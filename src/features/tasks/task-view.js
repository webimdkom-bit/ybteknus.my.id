import {
  createTask,
  createTaskReport,
  getBusiness,
  listAdmins,
  listBusinessesForOrganization,
  listEmployeesForBusiness,
  listTasksForBusiness,
  listTasksForOrganization,
  listTasksForUser,
  listTaskReportsForBusiness,
  listTaskReportsForOrganization,
  updateTask,
  reviewTaskReport,
} from "../../lib/firestore/repositories.js";
import { requestUploadSignature, uploadFileToCloudinary } from "../files/file-upload-service";
import { logAuditSafe } from "../audit-trail/index.js";

export async function openTaskManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "task-overlay";
  overlay.innerHTML = `<section class="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-title"><div class="task-modal-head"><div><p class="eyebrow">WORK MANAGEMENT</p><h2 id="task-title">${profile.role === "employee" ? "Tugas saya" : "Task management"}</h2><p>${profile.role === "employee" ? "Kerjakan tugas dan kirim laporan pekerjaan Anda." : "Buat, delegasikan, dan review pekerjaan operasional."}</p></div><button class="icon-button task-close" aria-label="Tutup">×</button></div><div class="task-layout">${profile.role === "employee" ? "" : taskFormMarkup()}<div class="task-list-wrap"><div class="task-list-heading"><h3>Daftar tugas</h3><span class="task-count">0</span></div><div class="task-list"><p class="task-empty">Memuat tugas...</p></div></div></div></section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".task-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  if (profile.role !== "employee") await setupTaskForm(overlay, profile);
  await loadTaskList(overlay, profile);
}

function taskFormMarkup() {
  return `<form class="task-form"><h3>Buat tugas</h3><div class="field"><label for="task-business">Bisnis</label><select id="task-business" name="businessId" required><option value="">Memuat bisnis...</option></select></div><div class="field"><label for="task-assignee">Berikan kepada</label><select id="task-assignee" name="assignedTo" required><option value="">Pilih penerima</option></select></div><div class="field"><label for="task-name">Judul tugas</label><input id="task-name" name="title" placeholder="Contoh: Inventory check" required /></div><div class="field"><label for="task-description">Deskripsi</label><textarea id="task-description" name="description" rows="3" required></textarea></div><div class="task-form-grid"><div class="field"><label for="task-deadline">Deadline</label><input id="task-deadline" name="deadline" type="date" required /></div><div class="field"><label for="task-priority">Prioritas</label><select id="task-priority" name="priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select></div></div><div class="field"><label for="task-checklist">Checklist <span>(satu item per baris)</span></label><textarea id="task-checklist" name="checklist" rows="3" placeholder="Periksa stok\nFoto rak"></textarea></div><p class="task-message" role="status"></p><p class="task-error" role="alert"></p><button class="primary-button" type="submit">Buat tugas <span>→</span></button></form>`;
}

async function setupTaskForm(overlay, profile) {
  const form = overlay.querySelector(".task-form");
  const businessSelect = form.querySelector("#task-business");
  const assigneeSelect = form.querySelector("#task-assignee");
  const businesses = profile.role === "owner"
    ? listBusinessesForOrganization(profile.organizationId)
    : Promise.all((profile.businessIds || []).map((id) => getBusiness(id)));
  const visibleBusinesses = (await businesses).filter(Boolean).filter((business) => business.status !== "inactive");
  businessSelect.innerHTML = visibleBusinesses.map((business) => `<option value="${business.id}">${business.name}</option>`).join("");
  const loadAssignees = async () => {
    const businessId = businessSelect.value;
    if (!businessId) return;
    const employees = await listEmployeesForBusiness(profile.organizationId, businessId);
    const admins = profile.role === "owner" ? await listAdmins(profile.organizationId) : [];
    const people = [...admins.filter((admin) => admin.businessIds?.includes(businessId)), ...employees];
    assigneeSelect.innerHTML = people.length ? people.map((person) => `<option value="${person.id}">${person.displayName || person.email} · ${person.role === "admin" ? "Admin" : "Employee"}</option>`).join("") : `<option value="">Belum ada penerima</option>`;
  };
  businessSelect.addEventListener("change", loadAssignees);
  await loadAssignees();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const error = form.querySelector(".task-error");
    const message = form.querySelector(".task-message");
    const submit = form.querySelector("button[type=submit]");
    error.textContent = "";
    message.textContent = "";
    submit.disabled = true;
    try {
      const task = await createTask({
        organizationId: profile.organizationId,
        businessId: data.businessId,
        title: data.title.trim(),
        description: data.description.trim(),
        deadline: data.deadline,
        priority: data.priority,
        assignedTo: [data.assignedTo],
        createdBy: profile.uid,
        parentTaskId: null,
        rootTaskId: null,
        checklist: data.checklist.split("\n").map((label, index) => ({ id: `item-${index + 1}`, label: label.trim(), completed: false })).filter((item) => item.label),
      });
      logAuditSafe({ profile, action: "task_created", targetType: "task", targetId: task?.id || null, businessId: data.businessId, metadata: { title: data.title.trim(), assignedTo: [data.assignedTo], priority: data.priority } });
      form.reset();
      message.textContent = "Tugas berhasil dibuat.";
      await loadTaskList(overlay, profile);
    } catch (taskError) { error.textContent = taskError.message; }
    submit.disabled = false;
  });
}

async function loadTaskList(overlay, profile) {
  const list = overlay.querySelector(".task-list");
  const count = overlay.querySelector(".task-count");
  try {
    const tasks = profile.role === "employee"
      ? await listTasksForUser(profile.uid)
      : profile.role === "owner"
        ? await listTasksForOrganization(profile.organizationId)
        : (await Promise.all((profile.businessIds || []).map((businessId) => listTasksForBusiness(profile.organizationId, businessId)))).flat();
    const reports = profile.role === "owner"
      ? await listTaskReportsForOrganization(profile.organizationId)
      : profile.role === "admin"
        ? (await Promise.all((profile.businessIds || []).map((businessId) => listTaskReportsForBusiness(profile.organizationId, businessId)))).flat()
        : await Promise.resolve([]);
    count.textContent = tasks.length;
    list.innerHTML = tasks.length ? tasks.map((task) => taskRow(task, profile, reports)).join("") : `<div class="task-empty-state"><strong>Belum ada tugas.</strong><span>Tugas baru akan muncul di sini.</span></div>`;
    bindTaskActions(overlay, profile, tasks, reports);
  } catch (error) { list.innerHTML = `<p class="task-error">${error.message}</p>`; }
}

function taskRow(task, profile, reports) {
  const overdue = task.deadline && task.status !== "approved" && task.deadline < new Date().toISOString().slice(0, 10);
  const checklist = task.checklist || [];
  const report = reports.find((item) => item.taskId === task.id && item.userId === profile.uid);
  return `<article class="task-row ${overdue ? "is-overdue" : ""}"><div class="task-row-head"><div><strong>${task.title}</strong><span>${task.priority || "normal"} · deadline ${task.deadline || "-"}</span></div><b class="task-status ${task.status}">${overdue ? "overdue" : task.status}</b></div><p>${task.description || ""}</p>${checklist.length ? `<div class="task-checklist">${checklist.map((item) => `<label><input type="checkbox" data-task-check="${task.id}" data-check-id="${item.id}" ${item.completed ? "checked" : ""} ${profile.role === "employee" ? "" : "disabled"} />${item.label}</label>`).join("")}</div>` : ""}<div class="task-row-actions">${profile.role === "employee" ? `<button class="secondary-button task-start" data-task-action="start" data-task-id="${task.id}">${task.status === "assigned" ? "Mulai tugas" : task.status === "in-progress" ? "Sedang dikerjakan" : task.status}</button><button class="primary-button task-report" data-task-action="report" data-task-id="${task.id}">${report ? "Lihat laporan" : "Kirim laporan"}</button><input type="file" class="task-evidence-file" data-task-evidence="${task.id}" accept="image/*" hidden />` : `<span class="task-assignee">${task.assignedTo?.length || 0} penerima</span>`}</div>${profile.role !== "employee" ? reports.filter((item) => item.taskId === task.id).map((item) => reportRow(item)).join("") : ""}</article>`;
}

function reportRow(report) {
  return `<div class="task-report-row"><span>Laporan: ${report.description}</span>${report.evidenceUrl ? `<a class="task-evidence-link" href="${report.evidenceUrl}" target="_blank" rel="noopener noreferrer">Bukti</a>` : ""}<b>${report.status}</b>${report.status === "submitted" ? `<button class="approve-registration" data-report-action="approved" data-report-id="${report.id}" data-task-id="${report.taskId}">Approve</button><button class="reject-registration" data-report-action="revision" data-report-id="${report.id}" data-task-id="${report.taskId}">Revisi</button>` : ""}</div>`;
}

function bindTaskActions(overlay, profile, tasks, reports) {
  overlay.querySelectorAll("[data-task-action=\"start\"]").forEach((button) => button.addEventListener("click", async () => {
    await updateTask(button.dataset.taskId, { status: "in-progress" });
    await loadTaskList(overlay, profile);
  }));
  overlay.querySelectorAll("[data-task-check]").forEach((checkbox) => checkbox.addEventListener("change", async () => {
    const task = tasks.find((item) => item.id === checkbox.dataset.taskCheck);
    const checklist = (task?.checklist || []).map((item) => item.id === checkbox.dataset.checkId ? { ...item, completed: checkbox.checked } : item);
    const completed = checklist.filter((item) => item.completed).length;
    await updateTask(task.id, { checklist, progress: checklist.length ? Math.round(completed / checklist.length * 100) : 0, status: completed === checklist.length && checklist.length ? "submitted" : "in-progress" });
    await loadTaskList(overlay, profile);
  }));
  overlay.querySelectorAll("[data-task-action=\"report\"]").forEach((button) => button.addEventListener("click", async () => {
    const task = tasks.find((item) => item.id === button.dataset.taskId);
    const input = overlay.querySelector(`[data-task-evidence="${task.id}"]`);
    if (input) input.click();
  }));
  overlay.querySelectorAll("[data-task-evidence]").forEach((input) => input.addEventListener("change", async () => {
    const task = tasks.find((item) => item.id === input.dataset.taskEvidence);
    const file = input.files?.[0];
    if (!task || !file) return;
    input.disabled = true;
    try {
      const signature = await requestUploadSignature({ taskId: task.id, fileName: file.name });
      const uploaded = await uploadFileToCloudinary({ file, signature, folder: signature.folder, publicId: signature.public_id });
      const description = window.prompt("Tulis laporan pekerjaan:", task.description || "");
      if (!description) return;
      const report = await createTaskReport({ taskId: task.id, organizationId: task.organizationId, businessId: task.businessId, userId: profile.uid, description, evidenceUrl: uploaded.secure_url, checklist: task.checklist || [] });
      logAuditSafe({ profile, action: "report_submitted", targetType: "taskReport", targetId: report?.id || null, businessId: task.businessId, metadata: { taskId: task.id, fileName: file.name, evidenceUrl: uploaded.secure_url } });
      logAuditSafe({ profile, action: "file_uploaded", targetType: "file", targetId: uploaded.public_id || null, businessId: task.businessId, metadata: { fileName: file.name, taskId: task.id } });
      await updateTask(task.id, { status: "submitted" });
    } catch (error) { window.alert(error.message); }
    input.disabled = false;
    input.value = "";
    await loadTaskList(overlay, profile);
  }));
  overlay.querySelectorAll("[data-report-action]").forEach((button) => button.addEventListener("click", async () => {
    const note = window.prompt("Catatan review (opsional):", "") || "";
    await reviewTaskReport(button.dataset.reportId, { status: button.dataset.reportAction, reviewedBy: profile.uid, reviewNote: note, reviewedAt: new Date().toISOString() });
    const report = reports.find((item) => item.id === button.dataset.reportId);
    const task = tasks.find((item) => item.id === button.dataset.taskId);
    logAuditSafe({
      profile,
      action: button.dataset.reportAction === "approved" ? "report_approved" : "report_revision_requested",
      targetType: "taskReport",
      targetId: button.dataset.reportId,
      businessId: task?.businessId || report?.businessId || null,
      metadata: { taskId: button.dataset.taskId, reviewNote: note },
    });
    await updateTask(button.dataset.taskId, { status: button.dataset.reportAction === "approved" ? "approved" : "revision" });
    await loadTaskList(overlay, profile);
  }));
}
