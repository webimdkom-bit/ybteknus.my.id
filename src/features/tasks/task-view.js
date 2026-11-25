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
  watchTasksForUser,
  watchTasksForOrganization,
  watchTasksForBusiness,
  updateTaskAndDailyReports,
  reviewTaskReport,
  archiveTask,
  restoreTask,
  syncDailyReportTask,
} from "../../lib/firestore/repositories.js";
import { DEFAULT_TASK_CATEGORIES } from "../../config/constants.js";
import { formatTaskDeadline, getDeadlineMillis, getTimeStatus, isTaskOverdue, normalizeDeadline, toDateTimeLocalValue } from "./task-status.js";
import { escapeHtml, safeUrl } from "../../lib/utils/html.js";
import { getDateKey, getJakartaISO } from "../../lib/utils/time.js";
import { recordFileMetadata, requestFileAccess, requestUploadSignature, uploadFileToCloudinary } from "../files/file-upload-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";
import { createTaskForAssignees } from "./task-service.js";

export async function openTaskManager({ profile, context = null }) {
  const overlay = document.createElement("div");
  overlay.className = "task-overlay";
  const title = context ? `Tugas ${context.label || "karyawan"}` : profile.role === "employee" ? "Tugas saya" : "Task management";
  const subtitle = context ? `Daftar tugas yang ditugaskan kepada ${context.label || "karyawan"} ini.` : profile.role === "employee" ? "Kerjakan tugas dan kirim laporan pekerjaan Anda." : "Buat, delegasikan, dan pantau tugas bertingkat.";
  overlay.innerHTML = `<section class="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-title"><div class="task-modal-head"><div><p class="eyebrow">WORK MANAGEMENT</p><h2 id="task-title">${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button class="icon-button task-close" aria-label="Tutup">×</button></div><div class="task-layout">${profile.role === "employee" || context ? "" : taskFormMarkup()}<div class="task-list-wrap"><div class="task-list-heading"><h3>Daftar tugas</h3><span class="task-count">0</span></div><div class="task-list-toolbar"><input class="task-list-search" type="search" placeholder="Cari tugas..." aria-label="Cari tugas" /><select class="task-list-view" aria-label="Filter tampilan"><option value="active">Aktif</option><option value="all">Semua</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option><option value="archived">Arsip</option></select><select class="task-list-status" aria-label="Filter status"><option value="">Semua status</option><option value="assigned">Assigned</option><option value="in-progress">In progress</option><option value="submitted">Submitted</option><option value="revision">Revision</option><option value="approved">Approved</option><option value="cancelled">Cancelled</option></select><select class="task-list-priority" aria-label="Filter prioritas"><option value="">Semua prioritas</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select><select class="task-list-business" aria-label="Filter bisnis"><option value="">Semua bisnis</option></select><select class="task-list-sort" aria-label="Urutkan"><option value="newest">Terbaru</option><option value="deadline">Deadline terdekat</option><option value="priority">Prioritas</option></select></div><p class="task-list-range" aria-live="polite"></p><div class="task-list-scroll"><div class="task-list"><p class="task-empty">Memuat tugas...</p></div></div><button class="secondary-button task-load-more" type="button" hidden>Muat lebih banyak</button></div></div></section>`;
  document.body.append(overlay);
  let stopTaskWatch = null;
  const close = () => { stopTaskWatch?.(); overlay.remove(); };
  overlay.querySelector(".task-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  let taskLimit = 200;
  let lastTasks = [];
  let lastReports = [];
  const listState = { search: "", view: "active", status: "", priority: "", business: "", sort: "newest" };
  const businessMap = new Map();
  const renderCurrent = () => renderTaskList(overlay, profile, lastTasks, lastReports, canManage, reload, listState, businessMap);
  const reload = async (max = taskLimit) => {
    const result = await loadTaskList(overlay, profile, canManage, max, context);
    lastTasks = result.tasks;
    lastReports = result.reports;
    renderCurrent();
  };

  let memberships = [];
  if (profile.role === "admin") {
    try { memberships = await listMembershipsForUser(profile.uid, profile.organizationId); }
    catch (error) { console.warn("[tasks] memberships:", error?.message || error); }
  }
  const canManage = (businessId) => profile.role === "owner" || memberships.some((membership) => membership.businessId === businessId && (membership.permissions || []).includes("manageTasks"));

  const businessRecords = profile.role === "owner"
    ? await listBusinessesForOrganization(profile.organizationId)
    : profile.role === "admin"
      ? (await Promise.all((profile.businessIds || []).map((id) => getBusiness(id)))).filter(Boolean)
      : [];
  businessRecords.forEach((business) => businessMap.set(business.id, business.name));
  overlay.querySelector(".task-list-business").innerHTML = `<option value="">Semua bisnis</option>${businessRecords.map((business) => `<option value="${business.id}">${escapeHtml(business.name)}</option>`).join("")}`;
  bindTaskToolbar(overlay, listState, renderCurrent);

  const loadMoreButton = overlay.querySelector(".task-load-more");
  loadMoreButton.addEventListener("click", async () => {
    taskLimit += 200;
    await reload();
  });

  if (profile.role !== "employee" && !context) await setupTaskForm(overlay, profile, canManage, reload);
  if (context) {
    stopTaskWatch = watchTasksForUser(context.assigneeId, () => reload());
  } else if (profile.role === "employee") {
    stopTaskWatch = watchTasksForUser(profile.uid, () => reload());
  }
  await reload();
  if (!context && profile.role === "owner") {
    stopTaskWatch = watchTasksForOrganization(profile.organizationId, () => reload());
  } else if (!context && profile.role === "admin") {
    const stops = (profile.businessIds || []).map((businessId) => watchTasksForBusiness(profile.organizationId, businessId, () => reload()));
    stopTaskWatch = () => stops.forEach((stop) => stop());
  }
}

function taskFormMarkup() {
  return `<form class="task-form"><h3>Buat tugas</h3><div class="field"><label for="task-business">Bisnis</label><select id="task-business" name="businessId" required><option value="">Memuat bisnis...</option></select></div><div class="field"><label>Penerima <span>(bisa lebih dari satu)</span></label><div class="task-assignee-picker"><input class="task-assignee-search" type="search" placeholder="Cari nama atau email..." aria-label="Cari penerima" /><div class="task-assignee-selected" data-assignee-selected><span>Belum ada penerima dipilih.</span></div><div class="task-assignee-summary"><span data-assignee-count>0 dipilih</span><button class="text-button" type="button" data-assignee-all>Pilih semua</button><button class="text-button" type="button" data-assignee-none>Kosongkan</button></div><div class="task-assignee-list" id="task-assignees"><p class="task-empty">Memuat penerima...</p></div></div></div><div class="field"><label for="task-category">Kategori</label><div class="task-category-row"><select id="task-category" name="category">${DEFAULT_TASK_CATEGORIES.map((category) => `<option>${category}</option>`).join("")}</select><button class="secondary-button" type="button" data-add-category hidden>Kategori baru</button></div></div><div class="field"><label for="task-name">Judul tugas</label><input id="task-name" name="title" placeholder="Contoh: Inventory check" required /></div><div class="field"><label for="task-description">Deskripsi</label><textarea id="task-description" name="description" rows="3" required></textarea></div><div class="field"><label for="task-instructions">Instruksi kerja <span>(opsional)</span></label><textarea id="task-instructions" name="instructions" rows="2" placeholder="Langkah-langkah penting"></textarea></div><div class="task-form-grid"><div class="field"><label for="task-report-format">Format laporan</label><select id="task-report-format" name="reportFormat"><option value="written">Laporan tertulis</option><option value="checklist">Checklist</option><option value="photo">Bukti foto</option><option value="document">Bukti dokumen</option><option value="mixed">Kombinasi</option></select></div><div class="field"><label for="task-evidence-required">Persyaratan bukti</label><select id="task-evidence-required" name="evidenceRequired"><option value="none">Tidak wajib</option><option value="photo">Foto wajib</option><option value="document">Dokumen wajib</option><option value="either">Foto atau dokumen</option></select></div></div><div class="field"><label for="task-attachment">Lampiran URL <span>(opsional)</span></label><input id="task-attachment" name="attachmentUrl" type="url" placeholder="https://..." /></div><div class="task-form-grid"><div class="field"><label for="task-deadline">Deadline</label><input id="task-deadline" name="deadline" type="datetime-local" value="${getDateKey()}T17:00" required /></div><div class="field"><label for="task-priority">Prioritas</label><select id="task-priority" name="priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select></div></div><div class="field"><label for="task-checklist">Checklist <span>(satu item per baris)</span></label><textarea id="task-checklist" name="checklist" rows="3" placeholder="Periksa stok\nFoto rak"></textarea></div><p class="task-message" role="status"></p><p class="task-error" role="alert"></p><button class="primary-button" type="submit">Buat tugas <span>→</span></button></form>`;
}

async function setupTaskForm(overlay, profile, canManage, reload) {
  const form = overlay.querySelector(".task-form");
  const businessSelect = form.querySelector("#task-business");
  const assigneeList = form.querySelector("#task-assignees");
  const assigneeSearch = form.querySelector(".task-assignee-search");
  const selectedBox = form.querySelector("[data-assignee-selected]");
  const selectedCount = form.querySelector("[data-assignee-count]");
  const categorySelect = form.querySelector("#task-category");
  const addCategoryButton = form.querySelector("[data-add-category]");
  if (profile.role === "owner") addCategoryButton.hidden = false;
  const businesses = profile.role === "owner"
    ? listBusinessesForOrganization(profile.organizationId)
    : Promise.all((profile.businessIds || []).map((id) => getBusiness(id)));
  const visibleBusinesses = (await businesses).filter(Boolean).filter((business) => business.status !== "inactive");
  businessSelect.innerHTML = visibleBusinesses.map((business) => `<option value="${business.id}">${business.name}</option>`).join("");

  let validAssigneeIds = new Set();
  let activePeople = [];
  const selectedIds = new Set();

  const renderSelected = () => {
    const selected = activePeople.filter((person) => selectedIds.has(person.id));
    selectedCount.textContent = `${selected.length} dipilih`;
    selectedBox.innerHTML = selected.length
      ? selected.map((person) => `<button class="task-assignee-chip" type="button" data-remove-assignee="${person.id}">${escapeHtml(person.displayName || person.email)} ×</button>`).join("")
      : `<span>Belum ada penerima dipilih.</span>`;
  };

  const renderAssignees = () => {
    const term = assigneeSearch.value.trim().toLowerCase();
    const matches = activePeople.filter((person) => !term || `${person.displayName || ""} ${person.email || ""}`.toLowerCase().includes(term));
    const groups = [
      { label: "Admin", people: matches.filter((person) => person.role === "admin") },
      { label: "Employee", people: matches.filter((person) => person.role !== "admin") },
    ];
    assigneeList.innerHTML = groups.filter((group) => group.people.length).map((group) => `<div class="task-assignee-group"><h4>${group.label}</h4>${group.people.map((person) => `<label class="task-assignee-option"><input type="checkbox" value="${person.id}" data-task-assignee="${person.id}" ${selectedIds.has(person.id) ? "checked" : ""} /><span class="task-assignee-avatar">${escapeHtml((person.displayName || person.email || "P").slice(0, 1)).toUpperCase()}</span><span class="task-assignee-copy"><strong>${escapeHtml(person.displayName || "Tanpa nama")}</strong><small>${escapeHtml(person.email || "")}</small></span><b class="task-assignee-role">${group.label}</b></label>`).join("")}</div>`).join("") || `<p class="task-empty">Belum ada penerima.</p>`;
    renderSelected();
  };

  const loadAssignees = async () => {
    const businessId = businessSelect.value;
    if (!businessId) return;
    const [employees, admins] = await Promise.all([
      listEmployeesForBusiness(profile.organizationId, businessId),
      profile.role === "owner" ? listAdmins(profile.organizationId) : Promise.resolve([]),
    ]);
    activePeople = [...admins.filter((admin) => admin.businessIds?.includes(businessId) && admin.status === "active"), ...employees.filter((employee) => employee.status === "active")];
    validAssigneeIds = new Set(activePeople.map((person) => person.id));
    [...selectedIds].forEach((id) => { if (!validAssigneeIds.has(id)) selectedIds.delete(id); });
    renderAssignees();
  };

  assigneeList.addEventListener("change", (event) => {
    const input = event.target.closest("[data-task-assignee]");
    if (!input) return;
    if (input.checked) selectedIds.add(input.value);
    else selectedIds.delete(input.value);
    renderSelected();
  });
  selectedBox.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-assignee]");
    if (!button) return;
    selectedIds.delete(button.dataset.removeAssignee);
    const input = assigneeList.querySelector(`[data-task-assignee="${button.dataset.removeAssignee}"]`);
    if (input) input.checked = false;
    renderSelected();
  });
  assigneeSearch.addEventListener("input", renderAssignees);
  form.querySelector("[data-assignee-all]").addEventListener("click", () => {
    activePeople.forEach((person) => selectedIds.add(person.id));
    renderAssignees();
  });
  form.querySelector("[data-assignee-none]").addEventListener("click", () => {
    selectedIds.clear();
    renderAssignees();
  });
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
    const assignedTo = [...form.querySelectorAll("[data-task-assignee]:checked")].map((input) => input.dataset.taskAssignee || input.value);
    const error = form.querySelector(".task-error");
    const message = form.querySelector(".task-message");
    const submit = form.querySelector("button[type=submit]");
    error.textContent = "";
    message.textContent = "";
    if (!assignedTo.length) { error.textContent = "Pilih minimal satu penerima."; return; }
    if (assignedTo.some((id) => !validAssigneeIds.has(id))) { error.textContent = "Penerima tidak valid atau tidak aktif. Pilih ulang penerima."; return; }
    submit.disabled = true;
    try {
      await createTaskForAssignees({ profile, businessId: data.businessId, assigneeIds: assignedTo, fields: data });
      form.reset();
      selectedIds.clear();
      assigneeSearch.value = "";
      form.querySelector("#task-deadline").value = `${getDateKey()}T17:00`;
      await loadAssignees();
      message.textContent = "Tugas berhasil dibuat.";
      await reload();
    } catch (taskError) { error.textContent = taskError.message; }
    submit.disabled = false;
  });
}

function bindTaskToolbar(overlay, state, render) {
  const bindings = [
    [".task-list-search", "search", "input"],
    [".task-list-view", "view", "change"],
    [".task-list-status", "status", "change"],
    [".task-list-priority", "priority", "change"],
    [".task-list-business", "business", "change"],
    [".task-list-sort", "sort", "change"],
  ];
  bindings.forEach(([selector, key, eventName]) => {
    const element = overlay.querySelector(selector);
    if (!element) return;
    element.addEventListener(eventName, () => { state[key] = element.value; render(); });
  });
}

function renderTaskList(overlay, profile, tasks, reports, canManage, reload, state, businessMap) {
  const list = overlay.querySelector(".task-list");
  const count = overlay.querySelector(".task-count");
  const range = overlay.querySelector(".task-list-range");
  if (!list || !count) return;
  const scroller = overlay.querySelector(".task-list-scroll");
  const scrollTop = scroller?.scrollTop || 0;
  const openForms = new Set([...overlay.querySelectorAll("[data-subtask-form]:not([hidden])")].map((form) => form.dataset.subtaskForm));
  const term = state.search.trim().toLowerCase();
  let visible = tasks.filter((task) => {
    if (state.view === "archived") {
      if (!task.archived) return false;
    } else if (task.archived) return false;
    if (state.view === "active" && ["approved", "cancelled"].includes(task.status)) return false;
    if (state.view === "completed" && task.status !== "approved") return false;
    if (state.view === "cancelled" && task.status !== "cancelled") return false;
    if (state.status && task.status !== state.status) return false;
    if (state.priority && task.priority !== state.priority) return false;
    if (state.business && task.businessId !== state.business) return false;
    if (term && !`${task.title || ""} ${task.description || ""} ${task.category || ""}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  visible = [...visible].sort((a, b) => {
    if (state.sort === "deadline") return (getDeadlineMillis(a.deadline) || Infinity) - (getDeadlineMillis(b.deadline) || Infinity);
    if (state.sort === "priority") return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
    return (b.createdAt?.toDate?.()?.getTime?.() || b.createdAt || 0) - (a.createdAt?.toDate?.()?.getTime?.() || a.createdAt || 0);
  });
  count.textContent = `${visible.length}/${tasks.length}`;
  if (range) range.textContent = `Menampilkan ${visible.length} dari ${tasks.length} tugas`;
  list.innerHTML = visible.length
    ? visible.map((task) => taskRow(task, tasks, reports, profile, canManage, businessMap)).join("")
    : `<div class="task-empty-state"><strong>Belum ada tugas.</strong><span>Coba ubah pencarian atau filter.</span></div>`;
  openForms.forEach((id) => {
    const form = list.querySelector(`[data-subtask-form="${id}"]`);
    if (form) form.hidden = false;
  });
  if (scroller) scroller.scrollTop = scrollTop;
  bindTaskActions(overlay, profile, visible, reports, canManage, reload);
}

async function loadTaskList(overlay, profile, canManage, max = 200, context = null) {
  const list = overlay.querySelector(".task-list");
  const loadMoreButton = overlay.querySelector(".task-load-more");
  try {
    const tasks = context
      ? await listTasksForUser(context.assigneeId, max)
      : profile.role === "employee"
        ? await listTasksForUser(profile.uid, max)
        : profile.role === "owner"
          ? await listTasksForOrganization(profile.organizationId, max)
          : (await Promise.all((profile.businessIds || []).map((businessId) => listTasksForBusiness(profile.organizationId, businessId, max)))).flat();
    let reports = profile.role === "owner"
      ? await listTaskReportsForOrganization(profile.organizationId)
      : profile.role === "admin"
        ? (await Promise.all((profile.businessIds || []).map((businessId) => listTaskReportsForBusiness(profile.organizationId, businessId)))).flat()
        : await Promise.resolve([]);
    if (context) {
      const ids = new Set(tasks.map((task) => task.id));
      reports = reports.filter((report) => ids.has(report.taskId));
    }
    if (loadMoreButton) loadMoreButton.hidden = tasks.length < max;
    return { tasks, reports };
  } catch (error) {
    if (list) list.innerHTML = `<p class="task-error">${escapeHtml(error.message)}</p>`;
    return { tasks: [], reports: [] };
  }
}

async function syncTimeStatus(taskId, tasks, status) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  await updateTaskAndDailyReports(taskId, {
    timeStatus: getTimeStatus({ deadline: normalizeDeadline(task.deadline), submittedAt: getJakartaISO(), status }),
  });
}

function parentProgress(parentId, tasks) {
  const children = tasks.filter((task) => task.parentTaskId === parentId);
  if (!children.length) return 0;
  return Math.round((children.filter((task) => task.status === "approved").length / children.length) * 100);
}

function taskRow(task, tasks, reports, profile, canManage, businessMap = new Map()) {
  const overdue = isTaskOverdue(task);
  const checklist = profile.role === "employee"
    ? (task.checklistByUser?.[profile.uid] || task.checklist || [])
    : (task.checklist || []);
  const children = tasks.filter((item) => item.parentTaskId === task.id);
  const approvedChildren = children.filter((item) => item.status === "approved").length;
  const progress = children.length ? parentProgress(task.id, tasks) : Number(task.progress || 0);
  const report = reports.find((item) => item.taskId === task.id && item.userId === profile.uid && !item.isFinal);
  const finalReport = reports.find((item) => item.taskId === task.id && item.isFinal);
  const isRoot = !task.parentTaskId;
  const mayManage = canManage(task.businessId) && (profile.role === "owner" || (task.assignedTo || []).includes(profile.uid));
  const canCreateFinal = profile.role === "admin" && isRoot && children.length > 0 && approvedChildren === children.length && !finalReport && (task.assignedTo || []).includes(profile.uid);
  const canArchive = canManage(task.businessId) && !task.archived;
  const canRestore = canManage(task.businessId) && task.archived;
  const canCancel = mayManage && !task.archived && !["approved", "cancelled"].includes(task.status);

  const childrenMarkup = children.length ? `<div class="task-children"><div class="task-children-head"><strong>Tugas turunan</strong><span>${approvedChildren}/${children.length} disetujui · ${progress}%</span></div><div class="task-child-progress"><i style="width:${progress}%"></i></div>${children.map((child) => `<div class="task-child-row"><span>${escapeHtml(child.title)}</span><b class="task-status ${child.status}">${child.status}</b></div>`).join("")}</div>` : "";
  const subtaskForm = isRoot && mayManage && !task.archived ? `<div class="subtask-form" data-subtask-form="${task.id}" hidden><input type="text" data-subtask-title placeholder="Judul subtugas" /><textarea data-subtask-description rows="2" placeholder="Deskripsi subtugas"></textarea><div class="task-form-grid"><input type="datetime-local" data-subtask-deadline value="${toDateTimeLocalValue(task.deadline)}" /><select data-subtask-assignee><option value="">Pilih employee</option></select></div><button class="primary-button" type="button" data-subtask-submit="${task.id}">Buat subtugas</button></div>` : "";
  const actions = profile.role === "employee"
    ? `<button class="secondary-button task-start" data-task-action="start" data-task-id="${task.id}">${task.status === "assigned" ? "Mulai tugas" : task.status === "in-progress" ? "Sedang dikerjakan" : task.status}</button><button class="primary-button task-report" data-task-action="report" data-task-id="${task.id}">${report ? "Lihat laporan" : "Kirim laporan"}</button><input type="file" class="task-evidence-file" data-task-evidence="${task.id}" accept="image/*,.pdf,.doc,.docx" hidden />`
    : `<span class="task-assignee">${task.assignedTo?.length || 0} penerima · ${escapeHtml(businessMap.get(task.businessId) || "Bisnis")}</span>${isRoot && mayManage && !task.archived ? `<button class="secondary-button" data-subtask-toggle="${task.id}">Buat subtugas</button>` : ""}${canCreateFinal && !task.archived ? `<button class="primary-button" data-final-report="${task.id}">Laporan akhir</button>` : ""}${canCancel ? `<button class="reject-registration" data-task-cancel="${task.id}">Batalkan</button>` : ""}${canArchive ? `<button class="secondary-button" data-task-archive="${task.id}">Arsipkan</button>` : ""}${canRestore ? `<button class="secondary-button" data-task-restore="${task.id}">Pulihkan</button>` : ""}`;

  const finalMarkup = finalReport ? `<div class="task-final-report"><div><strong>Laporan akhir${finalReport.userId === profile.uid ? " Anda" : ""}</strong><span>${escapeHtml(finalReport.description || "-")}</span></div><b class="task-status ${finalReport.status}">${finalReport.status}</b>${profile.role === "owner" && finalReport.status === "submitted" ? `<button class="approve-registration" data-final-action="approved" data-final-report-id="${finalReport.id}" data-final-task-id="${task.id}">Setujui akhir</button><button class="reject-registration" data-final-action="revision" data-final-report-id="${finalReport.id}" data-final-task-id="${task.id}">Revisi akhir</button>` : ""}${finalReport.userId === profile.uid && finalReport.status === "revision" ? `<button class="secondary-button" data-final-resubmit="${finalReport.id}" data-final-task-id="${task.id}">Kirim ulang</button>` : ""}</div>` : "";

  return `<article class="task-row ${overdue ? "is-overdue" : ""} ${task.archived ? "is-archived" : ""} ${isRoot ? "is-parent" : "is-child"}"><div class="task-row-head"><div><strong>${escapeHtml(task.title)}</strong><span>${task.priority || "normal"}${task.category ? ` · ${escapeHtml(task.category)}` : ""} · deadline ${escapeHtml(formatTaskDeadline(task.deadline))}${task.timeStatus ? ` · ${task.timeStatus}` : ""}${children.length ? ` · progres ${progress}%` : ""}</span></div><b class="task-status ${task.status}">${overdue ? "overdue" : task.status}</b></div><p>${escapeHtml(task.description || "")}</p>${task.instructions ? `<p class="task-instructions"><strong>Instruksi:</strong> ${escapeHtml(task.instructions)}</p>` : ""}${(task.reportFormat || task.evidenceRequired || task.attachmentUrl) ? `<p class="task-requirements">${task.reportFormat ? `Format: ${escapeHtml(task.reportFormat)}` : ""}${task.evidenceRequired && task.evidenceRequired !== "none" ? ` · Bukti: ${escapeHtml(task.evidenceRequired)}` : ""}${safeUrl(task.attachmentUrl) ? ` · <a href="${safeUrl(task.attachmentUrl)}" target="_blank" rel="noopener noreferrer">Lampiran</a>` : ""}</p>` : ""}${checklist.length ? `<div class="task-checklist">${checklist.map((item) => `<label><input type="checkbox" data-task-check="${task.id}" data-check-id="${item.id}" ${item.completed ? "checked" : ""} ${profile.role === "employee" ? "" : "disabled"} />${escapeHtml(item.label)}</label>`).join("")}</div>` : ""}${childrenMarkup}<div class="task-row-actions">${actions}</div>${subtaskForm}${finalMarkup}${profile.role !== "employee" ? reports.filter((item) => item.taskId === task.id && !item.isFinal).map((item) => reportRow(item)).join("") : ""}</article>`;
}

function reportRow(report) {
  return `<div class="task-report-row"><span>Laporan: ${escapeHtml(report.description)}</span>${safeUrl(report.evidenceUrl) ? `<a class="task-evidence-link" href="${safeUrl(report.evidenceUrl)}" target="_blank" rel="noopener noreferrer">Bukti</a>` : ""}${report.fileMetadataId ? `<button class="secondary-button" data-file-access="${report.fileMetadataId}">Buka aman</button>` : ""}<b>${report.status}</b>${report.status === "submitted" ? `<button class="approve-registration" data-report-action="approved" data-report-id="${report.id}" data-task-id="${report.taskId}">Approve</button><button class="reject-registration" data-report-action="revision" data-report-id="${report.id}" data-task-id="${report.taskId}">Revisi</button>` : ""}</div>`;
}

async function syncParentProgress(parentId, tasks, profile) {
  const parent = tasks.find((task) => task.id === parentId);
  if (!parent) return;
  const progress = parentProgress(parentId, tasks);
  await updateTaskAndDailyReports(parentId, { progress });
  logAuditSafe({ profile, action: "task_progress_updated", targetType: "task", targetId: parentId, businessId: parent.businessId, metadata: { progress } });
}

function bindTaskActions(overlay, profile, tasks, reports, canManage, reload) {
  overlay.querySelectorAll("[data-task-action=\"start\"]").forEach((button) => button.addEventListener("click", async () => {
    await updateTaskAndDailyReports(button.dataset.taskId, { status: "in-progress" });
    await reload();
  }));
  overlay.querySelectorAll("[data-task-check]").forEach((checkbox) => checkbox.addEventListener("change", async () => {
    const task = tasks.find((item) => item.id === checkbox.dataset.taskCheck);
    const source = task?.checklistByUser?.[profile.uid] || task?.checklist || [];
    const checklist = source.map((item) => item.id === checkbox.dataset.checkId ? { ...item, completed: checkbox.checked } : item);
    const completed = checklist.filter((item) => item.completed).length;
    const status = completed === checklist.length && checklist.length ? "submitted" : "in-progress";
    const changes = profile.role === "employee"
      ? {
        checklistByUser: { ...(task.checklistByUser || {}), [profile.uid]: checklist },
        progressByUser: { ...(task.progressByUser || {}), [profile.uid]: checklist.length ? Math.round(completed / checklist.length * 100) : 0 },
        progress: checklist.length ? Math.round(completed / checklist.length * 100) : 0,
        status,
      }
      : { checklist, progress: checklist.length ? Math.round(completed / checklist.length * 100) : 0, status };
    await updateTaskAndDailyReports(task.id, changes);
    if (task.parentTaskId) await syncParentProgress(task.parentTaskId, tasks, profile);
    await reload();
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
      await syncDailyReportTask({ taskId: task.id, userId: profile.uid, reportId: report.id, reportStatus: "submitted" });
      logAuditSafe({ profile, action: "report_submitted", targetType: "taskReport", targetId: report?.id || null, businessId: task.businessId, metadata: { taskId: task.id, fileName: file.name } });
      logAuditSafe({ profile, action: "file_uploaded", targetType: "file", targetId: uploaded.public_id || null, businessId: task.businessId, metadata: { fileName: file.name, taskId: task.id } });
      const notification = { type: NOTIFICATION_TYPES.reportSubmitted, title: "Laporan tugas dikirim", body: description, organizationId: task.organizationId, businessId: task.businessId, targetType: "taskReport", targetId: report?.id || null };
      notifySafe({ ...notification, audience: "owner" });
      notifySafe({ ...notification, audience: "admins", permission: "reviewSubmissions" });
      const parent = tasks.find((item) => item.id === task.parentTaskId);
      if (parent) notifySafe({ ...notification, title: "Laporan tugas turunan dikirim", userIds: parent.assignedTo || [] });
      await updateTaskAndDailyReports(task.id, { status: "submitted" });
      await syncTimeStatus(task.id, tasks, "submitted");
    } catch (error) { window.alert(error.message); }
    input.disabled = false;
    input.value = "";
    await reload();
  }));
  overlay.querySelectorAll("[data-report-action]").forEach((button) => button.addEventListener("click", async () => {
    const note = window.prompt("Catatan review (opsional):", "") || "";
    await reviewTaskReport(button.dataset.reportId, { status: button.dataset.reportAction, reviewedBy: profile.uid, reviewNote: note, reviewedAt: getJakartaISO() });
    await syncDailyReportTask({ taskId: button.dataset.taskId, reportId: button.dataset.reportId, reportStatus: button.dataset.reportAction });
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
    await updateTaskAndDailyReports(button.dataset.taskId, { status: button.dataset.reportAction === "approved" ? "approved" : "revision" });
    await syncTimeStatus(button.dataset.taskId, tasks, button.dataset.reportAction === "approved" ? "approved" : "revision");
    if (task?.parentTaskId) await syncParentProgress(task.parentTaskId, tasks, profile);
    await reload();
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
        deadline: normalizeDeadline(deadline || task.deadline),
        priority: task.priority || "normal",
        assignedTo: [assignee],
        createdBy: profile.uid,
        assignedBy: profile.uid,
        parentTaskId: task.id,
        rootTaskId: task.rootTaskId || task.id,
        timeStatus: getTimeStatus({ deadline: normalizeDeadline(deadline || task.deadline), status: "assigned" }),
        checklist: [],
      });
      logAuditSafe({ profile, action: "subtask_created", targetType: "task", targetId: child?.id || null, businessId: task.businessId, metadata: { parentTaskId: task.id, title, assignedTo: [assignee] } });
      notifySafe({ type: NOTIFICATION_TYPES.taskCreated, title: "Subtugas baru", body: `${title} · dari tugas ${task.title}`, organizationId: task.organizationId, businessId: task.businessId, targetType: "task", targetId: child?.id || null, userIds: [assignee] });
      await syncParentProgress(task.id, tasks, profile);
      await reload();
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));

  overlay.querySelectorAll("[data-final-report]").forEach((button) => button.addEventListener("click", async () => {
    const task = tasks.find((item) => item.id === button.dataset.finalReport);
    const description = window.prompt("Tulis laporan akhir untuk Owner:", task.description || "");
    if (!description) return;
    button.disabled = true;
    try {
      const report = await createTaskReport({ taskId: task.id, organizationId: task.organizationId, businessId: task.businessId, userId: profile.uid, description, evidenceUrl: "", checklist: [], isFinal: true });
      await syncDailyReportTask({ taskId: task.id, userId: profile.uid, reportId: report.id, reportStatus: "submitted" });
      logAuditSafe({ profile, action: "final_report_submitted", targetType: "taskReport", targetId: report?.id || null, businessId: task.businessId, metadata: { taskId: task.id } });
      notifySafe({ type: NOTIFICATION_TYPES.reportSubmitted, title: "Laporan akhir Admin dikirim", body: description, organizationId: task.organizationId, businessId: task.businessId, targetType: "taskReport", targetId: report?.id || null, audience: "owner" });
      await updateTaskAndDailyReports(task.id, { status: "submitted" });
      await reload();
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));
  overlay.querySelectorAll("[data-final-action]").forEach((button) => button.addEventListener("click", async () => {
    const note = window.prompt("Catatan review akhir (opsional):", "") || "";
    await reviewTaskReport(button.dataset.finalReportId, { status: button.dataset.finalAction, reviewedBy: profile.uid, reviewNote: note, reviewedAt: getJakartaISO() });
    await syncDailyReportTask({ taskId: button.dataset.finalTaskId, reportId: button.dataset.finalReportId, reportStatus: button.dataset.finalAction });
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
    await updateTaskAndDailyReports(button.dataset.finalTaskId, { status: button.dataset.finalAction === "approved" ? "approved" : "in-progress" });
    await syncTimeStatus(button.dataset.finalTaskId, tasks, button.dataset.finalAction === "approved" ? "approved" : "in-progress");
    await reload();
  }));
  overlay.querySelectorAll("[data-final-resubmit]").forEach((button) => button.addEventListener("click", async () => {
    const report = reports.find((item) => item.id === button.dataset.finalResubmit);
    const description = window.prompt("Perbarui laporan akhir:", report?.description || "");
    if (!description) return;
    button.disabled = true;
    try {
      await reviewTaskReport(report.id, { status: "submitted", description, reviewedAt: getJakartaISO() });
      await syncDailyReportTask({ taskId: button.dataset.finalTaskId, reportId: report.id, reportStatus: "submitted" });
      logAuditSafe({ profile, action: "final_report_resubmitted", targetType: "taskReport", targetId: report.id, metadata: { taskId: button.dataset.finalTaskId } });
      await updateTaskAndDailyReports(button.dataset.finalTaskId, { status: "submitted" });
      await reload();
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
      await updateTaskAndDailyReports(task.id, { status: "cancelled" });
      logAuditSafe({ profile, action: "task_cancelled", targetType: "task", targetId: task.id, businessId: task.businessId });
      if (task.parentTaskId) await syncParentProgress(task.parentTaskId, tasks, profile);
      await reload();
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));
  overlay.querySelectorAll("[data-task-archive]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Arsipkan tugas ini? Tugas akan hilang dari daftar utama.")) return;
    button.disabled = true;
    try {
      await archiveTask(button.dataset.taskArchive, profile.uid);
      logAuditSafe({ profile, action: "task_archived", targetType: "task", targetId: button.dataset.taskArchive });
      await reload();
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));
  overlay.querySelectorAll("[data-task-restore]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await restoreTask(button.dataset.taskRestore);
      logAuditSafe({ profile, action: "task_restored", targetType: "task", targetId: button.dataset.taskRestore });
      await reload();
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));
}
