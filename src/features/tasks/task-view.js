import {
  createTask,
  createTaskReport,
  getBusiness,
  listAdmins,
  listBusinessesForOrganization,
  listEmployeesForBusiness,
  listMembershipsForUser,
  listTasksForBusiness,
  listTasksForOrganization,
  listTasksForUser,
  listTaskReportsForBusiness,
  listTaskReportsForOrganization,
  listTaskCategories,
  createTaskCategory,
  updateTask,
  reviewTaskReport,
} from "../../lib/firestore/repositories.js";
import { DEFAULT_TASK_CATEGORIES } from "../../config/constants.js";
import { getTimeStatus } from "./task-status.js";
import { recordFileMetadata, requestFileAccess, requestUploadSignature, uploadFileToCloudinary } from "../files/file-upload-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";

export async function openTaskManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "task-overlay";
  overlay.innerHTML = `<section class="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-title"><div class="task-modal-head"><div><p class="eyebrow">WORK MANAGEMENT</p><h2 id="task-title">${profile.role === "employee" ? "Tugas saya" : "Task management"}</h2><p>${profile.role === "employee" ? "Kerjakan tugas dan kirim laporan pekerjaan Anda." : "Buat, delegasikan, dan pantau tugas bertingkat."}</p></div><button class="icon-button task-close" aria-label="Tutup">×</button></div><div class="task-layout">${profile.role === "employee" ? "" : taskFormMarkup()}<div class="task-list-wrap"><div class="task-list-heading"><h3>Daftar tugas</h3><span class="task-count">0</span></div><div class="task-list"><p class="task-empty">Memuat tugas...</p></div></div></div></section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".task-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  let memberships = [];
  if (profile.role === "admin") {
    try { memberships = await listMembershipsForUser(profile.uid, profile.organizationId); }
    catch (error) { console.warn("[tasks] memberships:", error?.message || error); }
  }
  const canManage = (businessId) => profile.role === "owner" || memberships.some((membership) => membership.businessId === businessId && (membership.permissions || []).includes("manageTasks"));

  if (profile.role !== "employee") await setupTaskForm(overlay, profile, canManage);
  await loadTaskList(overlay, profile, canManage);
}

function taskFormMarkup() {
  return `<form class="task-form"><h3>Buat tugas</h3><div class="field"><label for="task-business">Bisnis</label><select id="task-business" name="businessId" required><option value="">Memuat bisnis...</option></select></div><div class="field"><label>Penerima <span>(bisa lebih dari satu)</span></label><div class="task-assignee-list" id="task-assignees"><p class="task-empty">Memuat penerima...</p></div></div><div class="field"><label for="task-category">Kategori</label><div class="task-category-row"><select id="task-category" name="category">${DEFAULT_TASK_CATEGORIES.map((category) => `<option>${category}</option>`).join("")}</select><button class="secondary-button" type="button" data-add-category hidden>Kategori baru</button></div></div><div class="field"><label for="task-name">Judul tugas</label><input id="task-name" name="title" placeholder="Contoh: Inventory check" required /></div><div class="field"><label for="task-description">Deskripsi</label><textarea id="task-description" name="description" rows="3" required></textarea></div><div class="task-form-grid"><div class="field"><label for="task-deadline">Deadline</label><input id="task-deadline" name="deadline" type="date" required /></div><div class="field"><label for="task-priority">Prioritas</label><select id="task-priority" name="priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select></div></div><div class="field"><label for="task-checklist">Checklist <span>(satu item per baris)</span></label><textarea id="task-checklist" name="checklist" rows="3" placeholder="Periksa stok\nFoto rak"></textarea></div><p class="task-message" role="status"></p><p class="task-error" role="alert"></p><button class="primary-button" type="submit">Buat tugas <span>→</span></button></form>`;
}

async function setupTaskForm(overlay, profile, canManage) {
  const form = overlay.querySelector(".task-form");
  const businessSelect = form.querySelector("#task-business");
  const assigneeList = form.querySelector("#task-assignees");
  const categorySelect = form.querySelector("#task-category");
  const addCategoryButton = form.querySelector("[data-add-category]");
  if (profile.role === "owner") addCategoryButton.hidden = false;
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
    assigneeList.innerHTML = people.length
      ? people.map((person) => `<label><input type="checkbox" data-task-assignee="${person.id}" /> ${person.displayName || person.email} · ${person.role === "admin" ? "Admin" : "Employee"}</label>`).join("")
      : `<p class="task-empty">Belum ada penerima.</p>`;
  };
  const loadCategories = async () => {
    try {
      const categories = await listTaskCategories(profile.organizationId);
      const all = [...new Set([...DEFAULT_TASK_CATEGORIES, ...categories.map((item) => item.name)])];
      categorySelect.innerHTML = all.map((category) => `<option>${category}</option>`).join("");
    } catch (error) { console.warn("[tasks] categories:", error?.message || error); }
  };
  addCategoryButton.addEventListener("click", async () => {
    const name = window.prompt("Nama kategori tugas baru:");
    if (!name?.trim()) return;
    try {
      await createTaskCategory({ organizationId: profile.organizationId, name: name.trim() });
      await loadCategories();
      categorySelect.value = name.trim();
    } catch (error) { window.alert(error.message); }
  });
  businessSelect.addEventListener("change", loadAssignees);
  await loadAssignees();
  await loadCategories();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const assignedTo = [...form.querySelectorAll("[data-task-assignee]:checked")].map((input) => input.value);
    const error = form.querySelector(".task-error");
    const message = form.querySelector(".task-message");
    const submit = form.querySelector("button[type=submit]");
    error.textContent = "";
    message.textContent = "";
    if (!assignedTo.length) { error.textContent = "Pilih minimal satu penerima."; return; }
    submit.disabled = true;
    try {
      const task = await createTask({
        organizationId: profile.organizationId,
        businessId: data.businessId,
        title: data.title.trim(),
        description: data.description.trim(),
        deadline: data.deadline,
        priority: data.priority,
        category: data.category,
        assignedTo,
        createdBy: profile.uid,
        assignedBy: profile.uid,
        parentTaskId: null,
        rootTaskId: null,
        timeStatus: getTimeStatus({ deadline: data.deadline, status: "assigned" }),
        checklist: data.checklist.split("\n").map((label, index) => ({ id: `item-${index + 1}`, label: label.trim(), completed: false })).filter((item) => item.label),
      });
      logAuditSafe({ profile, action: "task_created", targetType: "task", targetId: task?.id || null, businessId: data.businessId, metadata: { title: data.title.trim(), assignedTo, priority: data.priority, category: data.category } });
      notifySafe({ type: NOTIFICATION_TYPES.taskCreated, title: "Tugas baru", body: data.title.trim(), organizationId: profile.organizationId, businessId: data.businessId, targetType: "task", targetId: task?.id || null, userIds: assignedTo });
      form.reset();
      message.textContent = "Tugas berhasil dibuat.";
      await loadTaskList(overlay, profile, canManage);
    } catch (taskError) { error.textContent = taskError.message; }
    submit.disabled = false;
  });
}

async function loadTaskList(overlay, profile, canManage) {
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
    list.innerHTML = tasks.length
      ? tasks.map((task) => taskRow(task, tasks, reports, profile, canManage)).join("")
      : `<div class="task-empty-state"><strong>Belum ada tugas.</strong><span>Tugas baru akan muncul di sini.</span></div>`;
    bindTaskActions(overlay, profile, tasks, reports, canManage);
  } catch (error) { list.innerHTML = `<p class="task-error">${error.message}</p>`; }
}

async function syncTimeStatus(taskId, tasks, status) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  await updateTask(taskId, {
    timeStatus: getTimeStatus({ deadline: task.deadline, submittedAt: new Date().toISOString(), status }),
  });
}

function parentProgress(parentId, tasks) {
  const children = tasks.filter((task) => task.parentTaskId === parentId);
  if (!children.length) return 0;
  return Math.round((children.filter((task) => task.status === "approved").length / children.length) * 100);
}

function taskRow(task, tasks, reports, profile, canManage) {
  const overdue = task.deadline && task.status !== "approved" && task.deadline < new Date().toISOString().slice(0, 10);
  const checklist = task.checklist || [];
  const children = tasks.filter((item) => item.parentTaskId === task.id);
  const approvedChildren = children.filter((item) => item.status === "approved").length;
  const progress = children.length ? parentProgress(task.id, tasks) : Number(task.progress || 0);
  const report = reports.find((item) => item.taskId === task.id && item.userId === profile.uid && !item.isFinal);
  const finalReport = reports.find((item) => item.taskId === task.id && item.isFinal);
  const isRoot = !task.parentTaskId;
  const mayManage = canManage(task.businessId) && (profile.role === "owner" || (task.assignedTo || []).includes(profile.uid));
  const canCreateFinal = profile.role === "admin" && isRoot && children.length > 0 && approvedChildren === children.length && !finalReport && (task.assignedTo || []).includes(profile.uid);
  const canCancel = mayManage && !["approved", "cancelled"].includes(task.status);

  const childrenMarkup = children.length ? `<div class="task-children"><div class="task-children-head"><strong>Tugas turunan</strong><span>${approvedChildren}/${children.length} disetujui · ${progress}%</span></div><div class="task-child-progress"><i style="width:${progress}%"></i></div>${children.map((child) => `<div class="task-child-row"><span>${child.title}</span><b class="task-status ${child.status}">${child.status}</b></div>`).join("")}</div>` : "";
  const subtaskForm = isRoot && mayManage ? `<div class="subtask-form" data-subtask-form="${task.id}" hidden><input type="text" data-subtask-title placeholder="Judul subtugas" /><textarea data-subtask-description rows="2" placeholder="Deskripsi subtugas"></textarea><div class="task-form-grid"><input type="date" data-subtask-deadline value="${task.deadline || ""}" /><select data-subtask-assignee><option value="">Pilih employee</option></select></div><button class="primary-button" type="button" data-subtask-submit="${task.id}">Buat subtugas</button></div>` : "";
  const actions = profile.role === "employee"
    ? `<button class="secondary-button task-start" data-task-action="start" data-task-id="${task.id}">${task.status === "assigned" ? "Mulai tugas" : task.status === "in-progress" ? "Sedang dikerjakan" : task.status}</button><button class="primary-button task-report" data-task-action="report" data-task-id="${task.id}">${report ? "Lihat laporan" : "Kirim laporan"}</button><input type="file" class="task-evidence-file" data-task-evidence="${task.id}" accept="image/*,.pdf,.doc,.docx" hidden />`
    : `<span class="task-assignee">${task.assignedTo?.length || 0} penerima</span>${isRoot && mayManage ? `<button class="secondary-button" data-subtask-toggle="${task.id}">Buat subtugas</button>` : ""}${canCreateFinal ? `<button class="primary-button" data-final-report="${task.id}">Laporan akhir</button>` : ""}${canCancel ? `<button class="reject-registration" data-task-cancel="${task.id}">Batalkan</button>` : ""}`;

  const finalMarkup = finalReport ? `<div class="task-final-report"><div><strong>Laporan akhir${finalReport.userId === profile.uid ? " Anda" : ""}</strong><span>${finalReport.description || "-"}</span></div><b class="task-status ${finalReport.status}">${finalReport.status}</b>${profile.role === "owner" && finalReport.status === "submitted" ? `<button class="approve-registration" data-final-action="approved" data-final-report-id="${finalReport.id}" data-final-task-id="${task.id}">Setujui akhir</button><button class="reject-registration" data-final-action="revision" data-final-report-id="${finalReport.id}" data-final-task-id="${task.id}">Revisi akhir</button>` : ""}${finalReport.userId === profile.uid && finalReport.status === "revision" ? `<button class="secondary-button" data-final-resubmit="${finalReport.id}" data-final-task-id="${task.id}">Kirim ulang</button>` : ""}</div>` : "";

  return `<article class="task-row ${overdue ? "is-overdue" : ""} ${isRoot ? "is-parent" : "is-child"}"><div class="task-row-head"><div><strong>${task.title}</strong><span>${task.priority || "normal"}${task.category ? ` · ${task.category}` : ""} · deadline ${task.deadline || "-"}${task.timeStatus ? ` · ${task.timeStatus}` : ""}${children.length ? ` · progres ${progress}%` : ""}</span></div><b class="task-status ${task.status}">${overdue ? "overdue" : task.status}</b></div><p>${task.description || ""}</p>${checklist.length ? `<div class="task-checklist">${checklist.map((item) => `<label><input type="checkbox" data-task-check="${task.id}" data-check-id="${item.id}" ${item.completed ? "checked" : ""} ${profile.role === "employee" ? "" : "disabled"} />${item.label}</label>`).join("")}</div>` : ""}${childrenMarkup}<div class="task-row-actions">${actions}</div>${subtaskForm}${finalMarkup}${profile.role !== "employee" ? reports.filter((item) => item.taskId === task.id && !item.isFinal).map((item) => reportRow(item)).join("") : ""}</article>`;
}

function reportRow(report) {
  return `<div class="task-report-row"><span>Laporan: ${report.description}</span>${report.evidenceUrl ? `<a class="task-evidence-link" href="${report.evidenceUrl}" target="_blank" rel="noopener noreferrer">Bukti</a>` : ""}${report.fileMetadataId ? `<button class="secondary-button" data-file-access="${report.fileMetadataId}">Buka aman</button>` : ""}<b>${report.status}</b>${report.status === "submitted" ? `<button class="approve-registration" data-report-action="approved" data-report-id="${report.id}" data-task-id="${report.taskId}">Approve</button><button class="reject-registration" data-report-action="revision" data-report-id="${report.id}" data-task-id="${report.taskId}">Revisi</button>` : ""}</div>`;
}

async function syncParentProgress(parentId, tasks, profile) {
  const parent = tasks.find((task) => task.id === parentId);
  if (!parent) return;
  const progress = parentProgress(parentId, tasks);
  await updateTask(parentId, { progress });
  logAuditSafe({ profile, action: "task_progress_updated", targetType: "task", targetId: parentId, businessId: parent.businessId, metadata: { progress } });
}

function bindTaskActions(overlay, profile, tasks, reports, canManage) {
  overlay.querySelectorAll("[data-task-action=\"start\"]").forEach((button) => button.addEventListener("click", async () => {
    await updateTask(button.dataset.taskId, { status: "in-progress" });
    await loadTaskList(overlay, profile, canManage);
  }));
  overlay.querySelectorAll("[data-task-check]").forEach((checkbox) => checkbox.addEventListener("change", async () => {
    const task = tasks.find((item) => item.id === checkbox.dataset.taskCheck);
    const checklist = (task?.checklist || []).map((item) => item.id === checkbox.dataset.checkId ? { ...item, completed: checkbox.checked } : item);
    const completed = checklist.filter((item) => item.completed).length;
    const status = completed === checklist.length && checklist.length ? "submitted" : "in-progress";
    await updateTask(task.id, { checklist, progress: checklist.length ? Math.round(completed / checklist.length * 100) : 0, status });
    if (task.parentTaskId) await syncParentProgress(task.parentTaskId, tasks, profile);
    await loadTaskList(overlay, profile, canManage);
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
      const resourceType = file.type.startsWith("image/") ? "image" : "raw";
      const signature = await requestUploadSignature({ taskId: task.id, fileName: file.name, resourceType });
      const uploaded = await uploadFileToCloudinary({ file, signature, folder: signature.folder, publicId: signature.public_id });
      let fileMetadataId = null;
      try {
        const metadata = await recordFileMetadata({
          fileName: file.name,
          resourceType,
          format: file.name.split(".").pop() || "",
          cloudinaryPublicId: signature.public_id,
          secureUrl: uploaded.secure_url,
          organizationId: task.organizationId,
          businessId: task.businessId,
          category: "task-evidence",
          access: resourceType === "image" ? "public" : "private",
          targetType: "taskReport",
          targetId: task.id,
        });
        fileMetadataId = metadata?.id || null;
      } catch (metadataError) { console.warn("[tasks] file metadata:", metadataError?.message || metadataError); }
      const description = window.prompt("Tulis laporan pekerjaan:", task.description || "");
      if (!description) return;
      const report = await createTaskReport({ taskId: task.id, organizationId: task.organizationId, businessId: task.businessId, userId: profile.uid, description, evidenceUrl: uploaded.secure_url, fileMetadataId, checklist: task.checklist || [] });
      logAuditSafe({ profile, action: "report_submitted", targetType: "taskReport", targetId: report?.id || null, businessId: task.businessId, metadata: { taskId: task.id, fileName: file.name } });
      logAuditSafe({ profile, action: "file_uploaded", targetType: "file", targetId: uploaded.public_id || null, businessId: task.businessId, metadata: { fileName: file.name, taskId: task.id } });
      const notification = { type: NOTIFICATION_TYPES.reportSubmitted, title: "Laporan tugas dikirim", body: description, organizationId: task.organizationId, businessId: task.businessId, targetType: "taskReport", targetId: report?.id || null };
      notifySafe({ ...notification, audience: "owner" });
      notifySafe({ ...notification, audience: "admins", permission: "reviewSubmissions" });
      const parent = tasks.find((item) => item.id === task.parentTaskId);
      if (parent) notifySafe({ ...notification, title: "Laporan tugas turunan dikirim", userIds: parent.assignedTo || [] });
      await updateTask(task.id, { status: "submitted" });
      await syncTimeStatus(task.id, tasks, "submitted");
    } catch (error) { window.alert(error.message); }
    input.disabled = false;
    input.value = "";
    await loadTaskList(overlay, profile, canManage);
  }));
  overlay.querySelectorAll("[data-report-action]").forEach((button) => button.addEventListener("click", async () => {
    const note = window.prompt("Catatan review (opsional):", "") || "";
    await reviewTaskReport(button.dataset.reportId, { status: button.dataset.reportAction, reviewedBy: profile.uid, reviewNote: note, reviewedAt: new Date().toISOString() });
    const report = reports.find((item) => item.id === button.dataset.reportId);
    const task = tasks.find((item) => item.id === button.dataset.taskId);
    logAuditSafe({ profile, action: button.dataset.reportAction === "approved" ? "report_approved" : "report_revision_requested", targetType: "taskReport", targetId: button.dataset.reportId, businessId: task?.businessId || report?.businessId || null, metadata: { taskId: button.dataset.taskId, reviewNote: note } });
    if (report?.userId) {
      notifySafe({
        type: button.dataset.reportAction === "approved" ? NOTIFICATION_TYPES.reportApproved : NOTIFICATION_TYPES.revisionRequested,
        title: button.dataset.reportAction === "approved" ? "Laporan disetujui" : "Permintaan revisi laporan",
        body: note || task?.title || "",
        organizationId: report.organizationId || task?.organizationId,
        businessId: report.businessId || task?.businessId,
        targetType: "taskReport",
        targetId: report.id,
        userIds: [report.userId],
      });
    }
    await updateTask(button.dataset.taskId, { status: button.dataset.reportAction === "approved" ? "approved" : "revision" });
    await syncTimeStatus(button.dataset.taskId, tasks, button.dataset.reportAction === "approved" ? "approved" : "revision");
    if (task?.parentTaskId) await syncParentProgress(task.parentTaskId, tasks, profile);
    await loadTaskList(overlay, profile, canManage);
  }));

  overlay.querySelectorAll("[data-subtask-toggle]").forEach((button) => button.addEventListener("click", async () => {
    const form = overlay.querySelector(`[data-subtask-form="${button.dataset.subtaskToggle}"]`);
    if (!form) return;
    form.hidden = !form.hidden;
    if (form.hidden) return;
    const task = tasks.find((item) => item.id === button.dataset.subtaskToggle);
    const select = form.querySelector("[data-subtask-assignee]");
    select.innerHTML = `<option value="">Memuat employee...</option>`;
    try {
      const employees = await listEmployeesForBusiness(profile.organizationId, task.businessId);
      select.innerHTML = employees.length ? employees.map((employee) => `<option value="${employee.id}">${employee.displayName || employee.email}</option>`).join("") : `<option value="">Belum ada employee</option>`;
    } catch (error) { select.innerHTML = `<option value="">Gagal memuat employee</option>`; }
  }));
  overlay.querySelectorAll("[data-subtask-submit]").forEach((button) => button.addEventListener("click", async () => {
    const task = tasks.find((item) => item.id === button.dataset.subtaskSubmit);
    const form = overlay.querySelector(`[data-subtask-form="${task.id}"]`);
    const title = form.querySelector("[data-subtask-title]").value.trim();
    const description = form.querySelector("[data-subtask-description]").value.trim();
    const deadline = form.querySelector("[data-subtask-deadline]").value;
    const assignee = form.querySelector("[data-subtask-assignee]").value;
    if (!title || !assignee) { window.alert("Judul dan penerima subtugas wajib diisi."); return; }
    button.disabled = true;
    try {
      const child = await createTask({
        organizationId: task.organizationId,
        businessId: task.businessId,
        title,
        description,
        deadline: deadline || task.deadline,
        priority: task.priority || "normal",
        assignedTo: [assignee],
        createdBy: profile.uid,
        assignedBy: profile.uid,
        parentTaskId: task.id,
        rootTaskId: task.rootTaskId || task.id,
        checklist: [],
      });
      logAuditSafe({ profile, action: "subtask_created", targetType: "task", targetId: child?.id || null, businessId: task.businessId, metadata: { parentTaskId: task.id, title, assignedTo: [assignee] } });
      notifySafe({ type: NOTIFICATION_TYPES.taskCreated, title: "Subtugas baru", body: `${title} · dari tugas ${task.title}`, organizationId: task.organizationId, businessId: task.businessId, targetType: "task", targetId: child?.id || null, userIds: [assignee] });
      await syncParentProgress(task.id, tasks, profile);
      await loadTaskList(overlay, profile, canManage);
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));

  overlay.querySelectorAll("[data-final-report]").forEach((button) => button.addEventListener("click", async () => {
    const task = tasks.find((item) => item.id === button.dataset.finalReport);
    const description = window.prompt("Tulis laporan akhir untuk Owner:", task.description || "");
    if (!description) return;
    button.disabled = true;
    try {
      const report = await createTaskReport({ taskId: task.id, organizationId: task.organizationId, businessId: task.businessId, userId: profile.uid, description, evidenceUrl: "", checklist: [], isFinal: true });
      logAuditSafe({ profile, action: "final_report_submitted", targetType: "taskReport", targetId: report?.id || null, businessId: task.businessId, metadata: { taskId: task.id } });
      notifySafe({ type: NOTIFICATION_TYPES.reportSubmitted, title: "Laporan akhir Admin dikirim", body: description, organizationId: task.organizationId, businessId: task.businessId, targetType: "taskReport", targetId: report?.id || null, audience: "owner" });
      await updateTask(task.id, { status: "submitted" });
      await loadTaskList(overlay, profile, canManage);
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));
  overlay.querySelectorAll("[data-final-action]").forEach((button) => button.addEventListener("click", async () => {
    const note = window.prompt("Catatan review akhir (opsional):", "") || "";
    await reviewTaskReport(button.dataset.finalReportId, { status: button.dataset.finalAction, reviewedBy: profile.uid, reviewNote: note, reviewedAt: new Date().toISOString() });
    const task = tasks.find((item) => item.id === button.dataset.finalTaskId);
    logAuditSafe({ profile, action: button.dataset.finalAction === "approved" ? "final_report_approved" : "final_report_revision_requested", targetType: "taskReport", targetId: button.dataset.finalReportId, businessId: task?.businessId || null, metadata: { taskId: button.dataset.finalTaskId, reviewNote: note } });
    const finalReport = reports.find((item) => item.id === button.dataset.finalReportId);
    if (finalReport?.userId) {
      notifySafe({
        type: button.dataset.finalAction === "approved" ? NOTIFICATION_TYPES.reportApproved : NOTIFICATION_TYPES.revisionRequested,
        title: button.dataset.finalAction === "approved" ? "Laporan akhir disetujui" : "Laporan akhir perlu revisi",
        body: note || task?.title || "",
        organizationId: finalReport.organizationId || task?.organizationId,
        businessId: finalReport.businessId || task?.businessId,
        targetType: "taskReport",
        targetId: finalReport.id,
        userIds: [finalReport.userId],
      });
    }
    await updateTask(button.dataset.finalTaskId, { status: button.dataset.finalAction === "approved" ? "approved" : "in-progress" });
    await syncTimeStatus(button.dataset.finalTaskId, tasks, button.dataset.finalAction === "approved" ? "approved" : "in-progress");
    await loadTaskList(overlay, profile, canManage);
  }));
  overlay.querySelectorAll("[data-final-resubmit]").forEach((button) => button.addEventListener("click", async () => {
    const report = reports.find((item) => item.id === button.dataset.finalResubmit);
    const description = window.prompt("Perbarui laporan akhir:", report?.description || "");
    if (!description) return;
    button.disabled = true;
    try {
      await reviewTaskReport(report.id, { status: "submitted", description, reviewedAt: new Date().toISOString() });
      logAuditSafe({ profile, action: "final_report_resubmitted", targetType: "taskReport", targetId: report.id, metadata: { taskId: button.dataset.finalTaskId } });
      await updateTask(button.dataset.finalTaskId, { status: "submitted" });
      await loadTaskList(overlay, profile, canManage);
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));
  overlay.querySelectorAll("[data-file-access]").forEach((button) => button.addEventListener("click", async () => {
    try {
      const result = await requestFileAccess(button.dataset.fileAccess);
      if (result?.url) window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) { window.alert(error.message); }
  }));
  overlay.querySelectorAll("[data-task-cancel]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Batalkan tugas ini?")) return;
    const task = tasks.find((item) => item.id === button.dataset.taskCancel);
    button.disabled = true;
    try {
      await updateTask(task.id, { status: "cancelled" });
      logAuditSafe({ profile, action: "task_cancelled", targetType: "task", targetId: task.id, businessId: task.businessId });
      if (task.parentTaskId) await syncParentProgress(task.parentTaskId, tasks, profile);
      await loadTaskList(overlay, profile, canManage);
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));
}
