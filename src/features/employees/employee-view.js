import {
  getBusiness,
  listBusinessesForOrganization,
  listEmployees,
  listTaskCategories,
  listTasksForBusiness,
  listTasksForOrganization,
  transferEmployee,
  updateUserProfile,
} from "../../lib/firestore/repositories.js";
import { resetPassword } from "../auth/auth-service.js";
import { openTaskManager } from "../tasks/task-view.js";
import { createTaskForAssignees } from "../tasks/task-service.js";
import { DEFAULT_TASK_CATEGORIES } from "../../config/constants.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { escapeHtml } from "../../lib/utils/html.js";
import { getDateKey } from "../../lib/utils/time.js";

const STATUS_LABELS = Object.freeze({ active: "Aktif", inactive: "Nonaktif", pending: "Pending", suspended: "Suspended" });

export async function openEmployeeManager({ profile }) {
  const organizationId = profile.organizationId;
  const isOwner = profile.role === "owner";
  const overlay = document.createElement("div");
  overlay.className = "registration-overlay employee-manager-overlay";
  overlay.innerHTML = `<section class="registration-modal employee-manager-modal" role="dialog" aria-modal="true" aria-labelledby="employee-manager-title"><div class="registration-modal-head"><div><p class="eyebrow">TEAM OPERATIONS</p><h2 id="employee-manager-title">Employee management</h2><p>${isOwner ? "Lihat dan kelola seluruh karyawan dalam organization ini." : "Lihat dan kelola karyawan pada bisnis yang menjadi tanggung jawab Anda."}</p></div><button class="icon-button registration-close" aria-label="Tutup">×</button></div><div class="employee-manager-grid"><div class="employee-manager-tools"><form class="employee-filter-form"><div class="field"><label for="employee-search">Cari karyawan</label><input id="employee-search" type="search" placeholder="Nama atau email" /></div><div class="employee-filter-row"><div class="field"><label for="employee-status-filter">Status</label><select id="employee-status-filter"><option value="">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select></div><div class="field"><label for="employee-business-filter">Bisnis</label><select id="employee-business-filter"><option value="">Semua bisnis</option></select></div></div></form><form class="quick-task-form" hidden><h3>Beri tugas cepat</h3><div class="field"><label for="quick-task-employee">Karyawan</label><select id="quick-task-employee" name="userId" required><option value="">Pilih karyawan aktif</option></select></div><div class="field"><label for="quick-task-business">Bisnis</label><select id="quick-task-business" name="businessId" required><option value="">Pilih bisnis</option></select></div><div class="field"><label for="quick-task-title">Judul tugas</label><input id="quick-task-title" name="title" required /></div><div class="field"><label for="quick-task-description">Deskripsi</label><textarea id="quick-task-description" name="description" rows="2" required></textarea></div><div class="schedule-fields"><div class="field"><label for="quick-task-deadline">Deadline</label><input id="quick-task-deadline" name="deadline" type="date" required /></div><div class="field"><label for="quick-task-priority">Prioritas</label><select id="quick-task-priority" name="priority"><option value="normal">Normal</option><option value="low">Rendah</option><option value="high">Tinggi</option><option value="urgent">Mendesak</option></select></div></div><div class="schedule-fields"><div class="field"><label for="quick-task-category">Kategori</label><select id="quick-task-category" name="category"></select></div><div class="field"><label for="quick-task-format">Format laporan</label><select id="quick-task-format" name="reportFormat"><option value="written">Laporan tertulis</option><option value="checklist">Checklist</option><option value="photo">Bukti foto</option><option value="document">Bukti dokumen</option><option value="mixed">Kombinasi</option></select></div></div><p class="registration-message" role="status"></p><p class="registration-error" role="alert"></p><button class="primary-button" type="submit">Buat tugas <span>→</span></button></form></div><div class="employee-manager-list-wrap"><div class="employee-manager-heading"><h3>Daftar karyawan</h3><span class="owner-count">0</span></div><p class="owner-form-message" role="status"></p><div class="employee-manager-list"><p class="registration-empty">Memuat karyawan...</p></div></div></div></section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".registration-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const list = overlay.querySelector(".employee-manager-list");
  const count = overlay.querySelector(".owner-count");
  const message = overlay.querySelector(".owner-form-message");
  const searchInput = overlay.querySelector("#employee-search");
  const statusFilter = overlay.querySelector("#employee-status-filter");
  const businessFilter = overlay.querySelector("#employee-business-filter");
  const quickForm = overlay.querySelector(".quick-task-form");
  const quickEmployeeSelect = overlay.querySelector("#quick-task-employee");
  const quickBusinessSelect = overlay.querySelector("#quick-task-business");
  const quickDeadline = overlay.querySelector("#quick-task-deadline");
  const quickCategory = overlay.querySelector("#quick-task-category");
  const quickError = quickForm.querySelector(".registration-error");
  const quickMessage = quickForm.querySelector(".registration-message");
  quickDeadline.value = getDateKey();

  const allowedBusinessIds = isOwner ? null : new Set((profile.businessIds || []).filter(Boolean));
  const allBusinesses = isOwner
    ? await listBusinessesForOrganization(organizationId)
    : (await Promise.all((profile.businessIds || []).map((id) => getBusiness(id)))).filter(Boolean);
  const activeBusinesses = allBusinesses.filter((business) => business.status !== "inactive");
  const businessMap = new Map(allBusinesses.map((business) => [business.id, business]));
  const businessOptions = activeBusinesses.map((business) => `<option value="${business.id}">${escapeHtml(business.name)}</option>`).join("");
  businessFilter.innerHTML = `<option value="">Semua bisnis</option>${businessOptions}`;
  quickBusinessSelect.innerHTML = `<option value="">Pilih bisnis</option>${businessOptions}`;

  try {
    const categories = await listTaskCategories(organizationId);
    const options = [...new Set([...DEFAULT_TASK_CATEGORIES, ...categories.map((item) => item.name)])];
    quickCategory.innerHTML = options.map((name) => `<option>${escapeHtml(name)}</option>`).join("");
  } catch {
    quickCategory.innerHTML = DEFAULT_TASK_CATEGORIES.map((name) => `<option>${escapeHtml(name)}</option>`).join("");
  }

  let employees = [];
  let taskCounts = new Map();
  const isInScope = (employee) => !allowedBusinessIds || (employee.businessIds || []).some((id) => allowedBusinessIds.has(id));

  const loadEmployees = async () => {
    try {
      const [all, tasks] = await Promise.all([
        listEmployees(organizationId),
        isOwner ? listTasksForOrganization(organizationId) : Promise.all((allowedBusinessIds ? [...allowedBusinessIds] : []).map((id) => listTasksForBusiness(organizationId, id))).then((groups) => groups.flat()),
      ]);
      employees = all.filter(isInScope);
      taskCounts = new Map();
      tasks.filter((task) => !["approved", "cancelled"].includes(task.status)).forEach((task) => {
        (task.assignedTo || []).forEach((userId) => taskCounts.set(userId, (taskCounts.get(userId) || 0) + 1));
      });
      renderEmployees();
    } catch (error) { list.innerHTML = `<p class="registration-error">${escapeHtml(error.message)}</p>`; }
  };

  const renderEmployees = () => {
    const term = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;
    const business = businessFilter.value;
    const visible = employees.filter((employee) => {
      if (term && !`${employee.displayName || ""} ${employee.email || ""}`.toLowerCase().includes(term)) return false;
      if (status && employee.status !== status) return false;
      if (business && !(employee.businessIds || []).includes(business)) return false;
      return true;
    });
    count.textContent = visible.filter((employee) => employee.status === "active").length;
    quickEmployeeSelect.innerHTML = `<option value="">Pilih karyawan aktif</option>${employees.filter((employee) => employee.status === "active").map((employee) => `<option value="${employee.id}">${escapeHtml(employee.displayName || employee.email)}</option>`).join("")}`;
    list.innerHTML = visible.length ? visible.map((employee) => employeeRow(employee, businessMap, taskCounts)).join("") : `<div class="registration-empty-state"><strong>Belum ada karyawan.</strong><span>Coba ubah pencarian atau filter status/bisnis.</span></div>`;
    bindRowActions();
  };

  const bindRowActions = () => {
    list.querySelectorAll("[data-toggle-employee]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await updateUserProfile(button.dataset.toggleEmployee, { status: button.dataset.nextStatus });
        logAuditSafe({ profile, action: "account_status_changed", targetType: "user", targetId: button.dataset.toggleEmployee, metadata: { status: button.dataset.nextStatus } });
        message.textContent = "Status karyawan diperbarui.";
        await loadEmployees();
      } catch (error) { message.textContent = error.message; button.disabled = false; }
    }));
    list.querySelectorAll("[data-transfer-employee]").forEach((button) => button.addEventListener("click", async () => {
      const form = button.closest(".employee-transfer-form");
      const userId = button.dataset.transferEmployee;
      const businessId = form.querySelector("[data-transfer-business]").value;
      if (!businessId) { message.textContent = "Pilih bisnis tujuan."; return; }
      if (form.dataset.currentBusiness === businessId) { message.textContent = "Karyawan sudah berada di bisnis tersebut."; return; }
      button.disabled = true;
      try {
        await transferEmployee({ userId, organizationId, businessId });
        logAuditSafe({ profile, action: "employee_transferred", targetType: "user", targetId: userId, businessId, metadata: { fromBusinessId: form.dataset.currentBusiness || null } });
        message.textContent = "Karyawan berhasil dipindahkan.";
        await loadEmployees();
      } catch (error) { message.textContent = error.message; button.disabled = false; }
    }));
    list.querySelectorAll("[data-reset-employee]").forEach((button) => button.addEventListener("click", async () => {
      if (!window.confirm(`Kirim link reset password ke ${button.dataset.resetEmail || "karyawan ini"}?`)) return;
      button.disabled = true;
      try {
        await resetPassword(button.dataset.resetEmail);
        logAuditSafe({ profile, action: "employee_password_reset", targetType: "user", targetId: button.dataset.resetEmployee, metadata: { email: button.dataset.resetEmail } });
        message.textContent = "Link reset password berhasil dikirim.";
      } catch (error) { message.textContent = error.message; }
      button.disabled = false;
    }));
    list.querySelectorAll("[data-view-employee-tasks]").forEach((button) => button.addEventListener("click", () => {
      const employee = employees.find((item) => item.id === button.dataset.viewEmployeeTasks);
      if (!employee) return;
      openTaskManager({ profile, context: { assigneeId: employee.id, businessId: employee.businessIds?.[0] || "", label: employee.displayName || employee.email } });
    }));
    list.querySelectorAll("[data-give-employee-task]").forEach((button) => button.addEventListener("click", () => {
      const employee = employees.find((item) => item.id === button.dataset.giveEmployeeTask);
      if (!employee) return;
      if (employee.status !== "active") { message.textContent = "Aktifkan karyawan terlebih dahulu sebelum memberi tugas."; return; }
      quickForm.hidden = false;
      quickEmployeeSelect.value = employee.id;
      quickBusinessSelect.value = employee.businessIds?.[0] || "";
      quickError.textContent = "";
      quickMessage.textContent = "";
      quickForm.scrollIntoView({ block: "nearest" });
    }));
  };

  searchInput.addEventListener("input", renderEmployees);
  statusFilter.addEventListener("change", renderEmployees);
  businessFilter.addEventListener("change", renderEmployees);
  quickEmployeeSelect.addEventListener("change", () => {
    const employee = employees.find((item) => item.id === quickEmployeeSelect.value);
    if (employee?.businessIds?.[0]) quickBusinessSelect.value = employee.businessIds[0];
  });
  quickForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(quickForm));
    quickError.textContent = "";
    quickMessage.textContent = "";
    if (!data.userId || !data.businessId || !data.title.trim() || !data.description.trim() || !data.deadline) {
      quickError.textContent = "Karyawan, bisnis, judul, deskripsi, dan deadline wajib diisi.";
      return;
    }
    const submit = quickForm.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await createTaskForAssignees({ profile, businessId: data.businessId, assigneeIds: [data.userId], fields: data });
      quickMessage.textContent = "Tugas berhasil dibuat.";
      quickForm.reset();
      quickDeadline.value = getDateKey();
      await loadEmployees();
    } catch (error) { quickError.textContent = error.message; }
    submit.disabled = false;
  });

  await loadEmployees();
}

function employeeRow(employee, businessMap, taskCounts) {
  const status = employee.status || "pending";
  const label = STATUS_LABELS[status] || status;
  const nextStatus = status === "active" ? "inactive" : "active";
  const businesses = (employee.businessIds || []).map((id) => businessMap.get(id)?.name || "Bisnis").join(", ") || "Belum ditempatkan";
  const currentBusiness = employee.businessIds?.[0] || "";
  const activeBusinesses = [...businessMap.values()].filter((business) => business.status !== "inactive");
  return `<article class="employee-management-row"><div class="registration-avatar">${escapeHtml((employee.displayName || employee.email || "E").slice(0, 1)).toUpperCase()}</div><div class="registration-person"><strong>${escapeHtml(employee.displayName || "Tanpa nama")}</strong><span>${escapeHtml(employee.email || "Email tidak tersedia")}</span><small>${escapeHtml(businesses)}${employee.position ? ` · ${escapeHtml(employee.position)}` : ""}${employee.phone ? ` · ${escapeHtml(employee.phone)}` : ""}${employee.joinedAt ? ` · sejak ${escapeHtml(employee.joinedAt)}` : ""} · ${taskCounts.get(employee.id) || 0} tugas aktif</small></div><span class="employee-status">${label}</span><div class="owner-employee-actions"><button class="approve-registration" data-toggle-employee="${employee.id}" data-next-status="${nextStatus}">${nextStatus === "active" ? "Aktifkan" : "Nonaktifkan"}</button>${employee.email ? `<button class="secondary-button" data-reset-employee="${employee.id}" data-reset-email="${escapeHtml(employee.email)}">Reset password</button>` : ""}<button class="secondary-button" data-view-employee-tasks="${employee.id}">Lihat tugas</button>${status === "active" ? `<button class="primary-button" data-give-employee-task="${employee.id}">Beri tugas</button>` : ""}</div><form class="employee-transfer-form" data-current-business="${escapeHtml(currentBusiness)}"><select data-transfer-business><option value="">Pilih bisnis tujuan</option>${activeBusinesses.map((business) => `<option value="${business.id}" ${business.id === currentBusiness ? "selected" : ""}>${escapeHtml(business.name)}</option>`).join("")}</select><button class="secondary-button" type="button" data-transfer-employee="${employee.id}">Pindahkan</button></form><p class="registration-error" role="alert"></p></article>`;
}
