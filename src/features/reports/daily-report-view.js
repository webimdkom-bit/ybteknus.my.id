import { getDateKey, getJakartaISO } from "../../lib/utils/time.js";
import { escapeHtml, openWithBusy, safeUrl, setBusy } from "../../lib/utils/html.js";
import {
  createTask,
  getBusiness,
  getDailyReport,
  listBusinessesForOrganization,
  listDailyReportsForOrganization,
  listEmployeesForBusiness,
  listFilesForTarget,
  listTaskReportsForBusiness,
  listTaskReportsForOrganization,
  listTaskReportsForUser,
  listTasksForBusiness,
  listTasksForOrganization,
  listTasksForUser,
  reviewDailyReport,
  reviewTaskReport,
  saveDailyReport,
  syncDailyReportTask,
  updateTaskAndDailyReports,
} from "../../lib/firestore/repositories.js";
import { DAILY_REPORT_STATUS, isDailyReportEditable, isDailyReportReady } from "../../lib/utils/daily-report.js";
import { getDeadlineDate } from "../tasks/task-status.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";
import { recordFileMetadata, requestDailyReportUploadSignature, requestFileAccess, uploadFileToCloudinary } from "../files/file-upload-service.js";
import { can } from "../permissions/permission-service.js";

const STATUS_LABELS = Object.freeze({
  draft: "Draf",
  submitted: "Dikirim",
  reviewed: "Ditinjau",
  revision: "Perlu revisi",
});

const TASK_STATUS_LABELS = Object.freeze({
  assigned: "Ditugaskan",
  "in-progress": "Dikerjakan",
  completed: "Selesai",
  submitted: "Dikirim",
  revision: "Perlu revisi",
  approved: "Disetujui",
  cancelled: "Dibatalkan",
  archived: "Diarsipkan",
});

export async function openDailyReportViewer({ profile }) {
  const reviewMode = profile.role === "owner" || (profile.role === "admin" && can(profile, "reviewSubmissions"));
  const overlay = document.createElement("div");
  overlay.className = "daily-report-overlay";
  overlay.innerHTML = `<section class="daily-report-modal" role="dialog" aria-modal="true" aria-labelledby="daily-report-title"><div class="daily-report-head"><div><p class="eyebrow">DAILY REPORT</p><h2 id="daily-report-title">${reviewMode ? "Laporan harian tim" : "Laporan harian saya"}</h2><p>${reviewMode ? "Lihat dan tinjau laporan kerja harian per tanggal." : "Catat pekerjaan harian Anda. Tugas dengan deadline hari ini otomatis masuk."}</p></div><button class="icon-button daily-report-close" aria-label="Tutup">×</button></div><div class="daily-report-body"></div></section>`;
  document.body.append(overlay);
  const photoViewer = document.createElement("div");
  photoViewer.className = "task-photo-viewer";
  photoViewer.hidden = true;
  photoViewer.innerHTML = `<div class="task-photo-viewer-inner"><button class="icon-button task-photo-close" aria-label="Tutup foto">×</button><div class="task-photo-list"></div></div>`;
  overlay.append(photoViewer);
  const hidePhotoViewer = () => { photoViewer.hidden = true; photoViewer.querySelector(".task-photo-list").innerHTML = ""; };
  photoViewer.querySelector(".task-photo-close").addEventListener("click", hidePhotoViewer);
  photoViewer.addEventListener("click", (event) => { if (event.target === photoViewer) hidePhotoViewer(); });
  overlay.querySelector(".daily-report-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
  const body = overlay.querySelector(".daily-report-body");
  if (reviewMode) await renderOwnerMode(body, profile, profile.role === "admin", photoViewer);
  else await renderPersonalMode(body, profile);
}

async function renderPersonalMode(body, profile) {
  let reportDate = getDateKey();
  let report = await loadReport(profile, reportDate);
  let error = "";
  let message = "";

  const render = async () => {
    const editable = isDailyReportEditable(report.status) && report.status !== DAILY_REPORT_STATUS.REVIEWED;
    body.innerHTML = `<div class="daily-report-toolbar"><div class="field"><label for="daily-report-date">Tanggal</label><input id="daily-report-date" type="date" value="${reportDate}" /></div><div class="daily-report-status"><span class="daily-report-pill ${escapeHtml(report.status)}">${STATUS_LABELS[report.status] || report.status}</span><small>${report.submittedAt ? `Dikirim ${escapeHtml(formatDate(report.submittedAt))}` : "Belum dikirim"}</small></div></div><p class="daily-report-error">${escapeHtml(error)}</p><p class="daily-report-message">${escapeHtml(message)}</p><div class="daily-report-grid"><form class="daily-report-form"><h3>Catatan harian</h3><div class="field"><label for="daily-report-notes">Pekerjaan yang dilakukan</label><textarea id="daily-report-notes" name="notes" rows="7" placeholder="Tulis pekerjaan yang dilakukan hari ini, satu kegiatan per baris." ${editable ? "" : "disabled"}>${escapeHtml(report.notes || "")}</textarea></div><div class="field"><label for="daily-report-files">Lampiran foto/dokumen</label><input id="daily-report-files" type="file" multiple accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" ${editable ? "" : "disabled"} /></div><p class="field-hint">Maksimal 10 MB per file. Gambar publik, dokumen private.</p><div class="daily-report-actions"><button class="secondary-button" type="button" data-daily-save ${editable ? "" : "disabled"}>Simpan draf</button><button class="primary-button" type="button" data-daily-submit ${editable ? "" : "disabled"}>${report.status === DAILY_REPORT_STATUS.REVISION ? "Kirim ulang laporan" : "Kirim laporan"} <span>→</span></button></div></form><div class="daily-report-tasks"><div class="daily-report-section-head"><h3>Tugas otomatis</h3><span>${(report.tasks || []).length} tugas</span></div>${renderTaskEntries(report.tasks || [])}<div class="daily-report-section-head"><h3>Lampiran</h3><span>${(report.attachments || []).length} file</span></div>${renderAttachments(report.attachments || [])}</div></div>`;
    bindPersonalEvents(body, profile, reportDate, report, async (next) => {
      const result = await next();
      if (result?.report) report = result.report;
      if (result?.reportDate) reportDate = result.reportDate;
      if (result?.message) message = result.message;
      if (result?.error) error = result.error;
      await render();
    });
  };

  await render();
}

async function loadReport(profile, reportDate) {
  const stored = await getDailyReport(profile.uid, reportDate);
  const [tasks, taskReports, files] = await Promise.all([
    listTasksForUser(profile.uid, 500),
    listTaskReportsForUser(profile.uid),
    listFilesForTarget(profile.organizationId, "dailyReport", `${profile.uid}_${reportDate}`, profile.uid),
  ]);
  const reportsByTask = new Map(taskReports.filter((item) => toDateKey(item.createdAt) === reportDate).map((item) => [item.taskId, item]));
  const existingEntries = new Map((stored?.tasks || []).map((item) => [item.taskId, item]));
  const entries = tasks.filter((task) => !task.archived && (getDeadlineDate(task.deadline) === reportDate || reportsByTask.has(task.id))).map((task) => {
    const linked = reportsByTask.get(task.id);
    return {
      taskId: task.id,
      title: task.title || "-",
      businessId: task.businessId || "",
      deadline: task.deadline || "",
      taskStatus: task.status || "assigned",
      completed: ["submitted", "approved"].includes(task.status),
      progress: Number(task.progress || 0),
      reportId: linked?.id || existingEntries.get(task.id)?.reportId || null,
      reportStatus: linked?.status || existingEntries.get(task.id)?.reportStatus || null,
    };
  });
  const attachments = files.filter((file) => file.status !== "deleted").map((file) => ({
    fileId: file.id,
    fileName: file.fileName || "Lampiran",
    resourceType: file.resourceType || "raw",
    access: file.access || "private",
    secureUrl: file.secureUrl || "",
  }));
  const next = {
    ...(stored || {}),
    status: stored?.status || DAILY_REPORT_STATUS.DRAFT,
    notes: stored?.notes || "",
    tasks: entries,
    attachments,
  };
  if (isDailyReportEditable(next.status)) {
    await saveDailyReport({ profile, reportDate, report: { notes: next.notes, tasks: next.tasks, attachments: next.attachments, status: next.status } });
  }
  return { ...next, id: `${profile.uid}_${reportDate}` };
}

function bindPersonalEvents(body, profile, reportDate, report, apply) {
  body.querySelector("#daily-report-date")?.addEventListener("change", (event) => apply(async () => {
    const nextDate = event.target.value || reportDate;
    return { report: await loadReport(profile, nextDate), reportDate: nextDate };
  }));
  body.querySelector("[data-daily-save]")?.addEventListener("click", () => apply(async () => {
    const notes = body.querySelector("#daily-report-notes").value;
    await saveDailyReport({ profile, reportDate, report: { notes, tasks: report.tasks, attachments: report.attachments, status: report.status } });
    return { report: { ...report, notes }, message: "Draf disimpan." };
  }));
  body.querySelector("[data-daily-submit]")?.addEventListener("click", () => apply(async () => {
    if (!window.confirm("Kirim laporan harian ini?")) return {};
    const notes = body.querySelector("#daily-report-notes").value.trim();
    if (!notes && !(report.tasks || []).length) return { error: "Tulis catatan atau pastikan ada tugas hari ini." };
    const submittedAt = getJakartaISO();
    const status = DAILY_REPORT_STATUS.SUBMITTED;
    await saveDailyReport({ profile, reportDate, report: { notes, tasks: report.tasks, attachments: report.attachments, status, submittedAt } });
    logAuditSafe({ profile, action: "daily_report_submitted", targetType: "dailyReport", targetId: `${profile.uid}_${reportDate}`, metadata: { reportDate, status } });
    notifySafe({ id: `daily_report_submitted_${profile.uid}_${reportDate}`, type: NOTIFICATION_TYPES.dailyReportSubmitted, title: "Laporan harian dikirim", body: `${profile.displayName || profile.email || "Karyawan"} · ${reportDate}`, organizationId: profile.organizationId, targetType: "dailyReport", targetId: `${profile.uid}_${reportDate}`, audience: "owner" });
    return { report: { ...report, notes, status, submittedAt }, message: "Laporan berhasil dikirim." };
  }));
  body.querySelector("#daily-report-files")?.addEventListener("change", async (event) => {
    const input = event.target;
    const files = [...input.files];
    if (!files.length) return;
    const status = body.querySelector(".daily-report-message");
    const restoreActions = [
      setBusy(body.querySelector("[data-daily-save]"), "Menyimpan..."),
      setBusy(body.querySelector("[data-daily-submit]"), "Mengirim..."),
    ];
    input.disabled = true;
    let uploadError = "";
    let saveError = "";
    try {
      for (const [index, file] of files.entries()) {
        status.textContent = `Mengunggah ${index + 1}/${files.length}: ${file.name} 0%`;
        try {
          const resourceType = file.type.startsWith("image/") ? "image" : "raw";
          const signature = await requestDailyReportUploadSignature({ reportId: report.id, fileName: file.name, resourceType });
          const uploaded = await uploadFileToCloudinary({
            file,
            signature,
            folder: signature.folder,
            publicId: signature.public_id,
            onProgress: (progress) => { status.textContent = `Mengunggah ${index + 1}/${files.length}: ${file.name} ${progress}%`; },
          });
          const metadata = await recordFileMetadata({
            fileName: file.name,
            resourceType,
            format: file.name.split(".").pop() || "",
            publicId: signature.public_id,
            secureUrl: uploaded.secure_url,
            organizationId: profile.organizationId,
            businessId: profile.businessIds?.[0] || null,
            category: "daily-report-evidence",
            access: resourceType === "image" ? "public" : "private",
            targetType: "dailyReport",
            targetId: report.id,
          });
          report.attachments = [...(report.attachments || []), { fileId: metadata.id, fileName: file.name, resourceType, access: resourceType === "image" ? "public" : "private", secureUrl: uploaded.secure_url }];
        } catch (fileError) { uploadError = fileError.message; }
      }
      try {
        await saveDailyReport({ profile, reportDate, report: { notes: report.notes, tasks: report.tasks, attachments: report.attachments, status: report.status, submittedAt: report.submittedAt } });
      } catch (submitError) { saveError = submitError.message; }
    } finally {
      restoreActions.forEach((restore) => restore());
      input.disabled = false;
      input.value = "";
    }
    await apply(async () => ({ report, error: saveError || uploadError, message: saveError || uploadError ? "" : "Lampiran diperbarui." }));
  });
  body.querySelectorAll("[data-daily-file-open]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await openWithBusy(button, async () => (await requestFileAccess(button.dataset.dailyFileOpen))?.url);
    } catch (fileError) { window.alert(fileError.message); }
  }));
}

async function renderOwnerMode(body, profile, adminMode = false, photoViewer = null) {
  let reportDate = getDateKey();
  let businessId = "";
  let term = "";
  let reports = [];
  let taskReports = [];
  let taskMap = new Map();
  let selected = null;
  let message = "";
  let error = "";
  const businesses = adminMode
    ? (await Promise.all((profile.businessIds || []).map((id) => getBusiness(id).catch(() => null)))).filter(Boolean)
    : await listBusinessesForOrganization(profile.organizationId);
  const businessIds = businesses.filter((business) => business.status !== "inactive").map((business) => business.id);
  const businessOptions = businesses.filter((business) => business.status !== "inactive").map((business) => `<option value="${business.id}">${escapeHtml(business.name)}</option>`).join("");

  await reload();
  async function reload() {
    const scopes = businessId ? [businessId] : businessIds;
    const groups = await Promise.all(scopes.map((scope) => listDailyReportsForOrganization(profile.organizationId, reportDate, scope).catch(() => [])));
    const seen = new Set();
    reports = groups.flat().filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    if (term) reports = reports.filter((item) => `${item.displayName || ""} ${item.email || ""} ${item.role || ""}`.toLowerCase().includes(term.toLowerCase()));
    const reportGroups = await Promise.all(scopes.map((scope) => (adminMode
      ? listTaskReportsForBusiness(profile.organizationId, scope)
      : listTaskReportsForOrganization(profile.organizationId)).catch(() => [])));
    taskReports = [...new Map(reportGroups.flat().map((item) => [item.id, item])).values()];
    const taskGroups = await Promise.all(scopes.map((scope) => (adminMode
      ? listTasksForBusiness(profile.organizationId, scope)
      : listTasksForOrganization(profile.organizationId)).catch(() => [])));
    taskMap = new Map(taskGroups.flat().map((task) => [task.id, task]));
    if (!selected || !reports.some((item) => item.id === selected.id)) selected = reports[0] || null;
    render();
  }

  const openPhotoViewer = (urls) => {
    if (!photoViewer) return;
    const photos = urls.map((url) => safeUrl(url)).filter(Boolean);
    photoViewer.querySelector(".task-photo-list").innerHTML = photos.length
      ? photos.map((url) => `<img src="${url}" alt="Foto bukti karyawan" />`).join("")
      : `<p class="task-empty">Tidak ada foto pada laporan ini.</p>`;
    photoViewer.hidden = false;
  };

  function render() {
    body.innerHTML = `<div class="daily-report-toolbar"><div class="field"><label for="daily-owner-date">Tanggal</label><input id="daily-owner-date" type="date" value="${reportDate}" /></div><div class="field"><label for="daily-owner-business">Bisnis</label><select id="daily-owner-business"><option value="">Semua bisnis</option>${businessOptions}</select></div><div class="field"><label for="daily-owner-search">Cari</label><input id="daily-owner-search" type="search" value="${escapeHtml(term)}" placeholder="Nama atau email" /></div></div><p class="daily-report-error">${escapeHtml(error)}</p><p class="daily-report-message">${escapeHtml(message)}</p><div class="daily-report-grid"><div class="daily-report-list"><div class="daily-report-section-head"><h3>Laporan ${escapeHtml(reportDate)}</h3><span>${reports.length} laporan</span></div>${reports.length ? reports.map((item) => `<button class="daily-report-row ${selected?.id === item.id ? "is-selected" : ""}" data-daily-report-select="${escapeHtml(item.id)}"><strong>${escapeHtml(item.displayName || item.email || "Karyawan")}</strong><span class="daily-report-row-meta">${escapeHtml(item.role || "-")} <span class="daily-report-pill ${escapeHtml(item.status)}">${escapeHtml(STATUS_LABELS[item.status] || item.status)}</span></span><small>Dikirim ${escapeHtml(item.submittedAt ? formatDate(item.submittedAt) : "belum")}</small></button>`).join("") : `<div class="role-empty-state"><strong>Belum ada laporan.</strong><span>Pilih tanggal lain atau ubah filter bisnis untuk melihat laporan.</span></div>`}</div><div class="daily-report-detail">${selected ? renderDetail(selected, true, taskReports, taskMap) : `<div class="role-empty-state"><strong>Pilih laporan karyawan.</strong><span>Detail laporan, tugas, dan foto bukti akan tampil di sini.</span></div>`}</div></div>`;
    body.querySelector("#daily-owner-date").addEventListener("change", (event) => { reportDate = event.target.value || getDateKey(); selected = null; reload(); });
    body.querySelector("#daily-owner-business").addEventListener("change", (event) => { businessId = event.target.value; selected = null; reload(); });
    body.querySelector("#daily-owner-search").addEventListener("input", (event) => { term = event.target.value; selected = null; reload(); });
    body.querySelectorAll("[data-daily-report-select]").forEach((button) => button.addEventListener("click", () => {
      selected = reports.find((item) => item.id === button.dataset.dailyReportSelect) || null;
      message = "";
      error = "";
      render();
    }));
    body.querySelectorAll("[data-daily-review]").forEach((button) => button.addEventListener("click", async () => {
      const restore = setBusy(button, "Menyimpan review...");
      try {
        const action = button.dataset.dailyReview;
        const reviewNote = action === "revision" ? window.prompt("Catatan revisi:", "") || "" : "";
        const reviewedAt = getJakartaISO();
        await reviewDailyReport(selected.id, { status: action === "revision" ? DAILY_REPORT_STATUS.REVISION : DAILY_REPORT_STATUS.REVIEWED, reviewedBy: profile.uid, reviewedAt, reviewNote });
        logAuditSafe({ profile, action: action === "revision" ? "daily_report_revision_requested" : "daily_report_reviewed", targetType: "dailyReport", targetId: selected.id, metadata: { reportDate, reviewNote } });
        notifySafe({ id: `daily_report_${action}_${selected.id}_${reviewedAt}`, type: action === "revision" ? NOTIFICATION_TYPES.dailyReportRevisionRequested : NOTIFICATION_TYPES.dailyReportReviewed, title: action === "revision" ? "Laporan harian perlu revisi" : "Laporan harian ditinjau", body: reviewNote || reportDate, organizationId: profile.organizationId, businessId: selected.businessIds?.[0] || null, targetType: "dailyReport", targetId: selected.id, userIds: [selected.userId] });
        message = action === "revision" ? "Permintaan revisi dikirim." : "Laporan ditandai ditinjau.";
        const selectedId = selected.id;
        selected = null;
        await reload();
        selected = reports.find((item) => item.id === selectedId) || selected || null;
        render();
      } catch (reviewError) {
        error = reviewError.message;
        render();
      } finally { restore(); }
    }));
    body.querySelectorAll("[data-daily-file-open]").forEach((button) => button.addEventListener("click", async () => {
      try {
        const result = await requestFileAccess(button.dataset.dailyFileOpen);
        if (result?.url) window.open(result.url, "_blank", "noopener,noreferrer");
      } catch (fileError) { window.alert(fileError.message); }
    }));
    body.querySelectorAll("[data-daily-photo]").forEach((button) => button.addEventListener("click", () => {
      const [taskId, itemIndex] = button.dataset.dailyPhoto.split("|");
      const taskReport = taskReports.find((item) => item.taskId === taskId && item.userId === selected?.userId);
      const url = taskReport?.checklist?.[Number(itemIndex)]?.evidenceUrl;
      openPhotoViewer(url ? [url] : []);
    }));
    body.querySelectorAll("[data-daily-file-photo]").forEach((button) => button.addEventListener("click", async () => {
      try {
        const result = await requestFileAccess(button.dataset.dailyFilePhoto);
        openPhotoViewer(result?.url ? [result.url] : []);
      } catch (fileError) { error = fileError.message; render(); }
    }));
    body.querySelectorAll("[data-task-report-action]").forEach((button) => button.addEventListener("click", async () => {
      const restore = setBusy(button, "Menyimpan...");
      try {
        const action = button.dataset.taskReportAction;
        const note = window.prompt("Catatan review (opsional):", "") || "";
        const reviewedAt = getJakartaISO();
        await reviewTaskReport(button.dataset.taskReportId, { status: action, reviewedBy: profile.uid, reviewNote: note, reviewedAt });
        await syncDailyReportTask({ taskId: button.dataset.taskId, reportId: button.dataset.taskReportId, reportStatus: action });
        await updateTaskAndDailyReports(button.dataset.taskId, { status: action });
        logAuditSafe({ profile, action: action === "approved" ? "report_approved" : "report_revision_requested", targetType: "taskReport", targetId: button.dataset.taskReportId, metadata: { taskId: button.dataset.taskId, reviewNote: note } });
        const taskReport = taskReports.find((item) => item.id === button.dataset.taskReportId);
        if (taskReport?.userId) {
          notifySafe({
            type: action === "approved" ? NOTIFICATION_TYPES.reportApproved : NOTIFICATION_TYPES.revisionRequested,
            title: action === "approved" ? "Laporan tugas disetujui" : "Laporan tugas perlu revisi",
            body: note || "",
            organizationId: profile.organizationId,
            businessId: taskReport.businessId,
            targetType: "taskReport",
            targetId: taskReport.id,
            userIds: [taskReport.userId],
          });
        }
        message = action === "approved" ? "Laporan tugas disetujui." : "Permintaan revisi dikirim.";
        const selectedId = selected.id;
        await reload();
        selected = reports.find((item) => item.id === selectedId) || selected || null;
        render();
      } catch (reviewError) { error = reviewError.message; render(); }
      finally { restore(); }
    }));
    body.querySelectorAll("[data-task-subtask-toggle]").forEach((button) => button.addEventListener("click", async () => {
      const form = body.querySelector(`[data-task-subtask-form="${button.dataset.taskSubtaskToggle}"]`);
      if (!form) return;
      form.hidden = !form.hidden;
      if (form.hidden) return;
      const task = taskMap.get(button.dataset.taskSubtaskToggle);
      const select = form.querySelector("[data-subtask-assignee]");
      const employees = task ? await listEmployeesForBusiness(profile.organizationId, task.businessId).catch(() => []) : [];
      select.innerHTML = employees.length
        ? `<option value="">Pilih employee</option>${employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.displayName || employee.email || "Tanpa nama")}</option>`).join("")}`
        : `<option value="">Belum ada karyawan</option>`;
    }));
    body.querySelectorAll("[data-task-subtask-submit]").forEach((button) => button.addEventListener("click", async () => {
      const form = body.querySelector(`[data-task-subtask-form="${button.dataset.taskSubtaskSubmit}"]`);
      const parent = taskMap.get(button.dataset.taskSubtaskSubmit);
      const title = form?.querySelector("[data-subtask-title]")?.value.trim();
      const assigneeId = form?.querySelector("[data-subtask-assignee]")?.value;
      if (!parent || !title || !assigneeId) { error = "Judul dan penerima subtugas wajib diisi."; render(); return; }
      const restore = setBusy(button, "Menyimpan...");
      try {
        await createTask({
          organizationId: profile.organizationId,
          businessId: parent.businessId,
          title,
          description: "",
          deadline: parent.deadline || "",
          priority: parent.priority || "normal",
          category: parent.category || "Umum",
          reportFormat: parent.reportFormat || "written",
          evidenceRequired: parent.evidenceRequired || "none",
          checklistPhotoEnabled: false,
          attachmentUrl: "",
          parentTaskId: parent.id,
          rootTaskId: parent.rootTaskId || parent.id,
          assignedTo: [assigneeId],
          assignedBy: profile.uid,
          createdBy: profile.uid,
          timeStatus: "pending",
          checklist: [],
          checklistByUser: { [assigneeId]: [] },
          progressByUser: { [assigneeId]: 0 },
        });
        logAuditSafe({ profile, action: "subtask_created", targetType: "task", targetId: parent.id, businessId: parent.businessId, metadata: { title } });
        notifySafe({ type: NOTIFICATION_TYPES.taskCreated, title: "Subtugas baru", body: title, organizationId: profile.organizationId, businessId: parent.businessId, targetType: "task", targetId: parent.id, userIds: [assigneeId] });
        message = "Subtugas dibuat.";
        await reload();
      } catch (subtaskError) { error = subtaskError.message; render(); }
      finally { restore(); }
    }));
  }
}

function renderDetail(report, canReview = false, reports = [], taskMap = new Map()) {
  const reviewActions = canReview
    ? `<div class="daily-report-actions"><button class="secondary-button" type="button" data-daily-review="revision" ${report.status === DAILY_REPORT_STATUS.REVIEWED ? "disabled" : ""}>Minta revisi</button><button class="primary-button" type="button" data-daily-review="reviewed" ${report.status === DAILY_REPORT_STATUS.REVIEWED ? "disabled" : ""}>Tandai ditinjau</button></div>`
    : "";
  const photoCount = (report.tasks || []).reduce((total, entry) => {
    const taskReport = reports.find((item) => item.id === entry.reportId);
    return total + (taskReport?.checklist || []).filter((item) => safeUrl(item.evidenceUrl)).length;
  }, 0);
  return `<div class="daily-report-detail-head"><div><h3>${escapeHtml(report.displayName || report.email || "Karyawan")}</h3><p>${escapeHtml(report.role || "-")} · ${escapeHtml(reportDateLabel(report.reportDate))}</p></div><span class="daily-report-pill ${escapeHtml(report.status)}">${STATUS_LABELS[report.status] || report.status}</span></div>${report.reviewNote ? `<p class="daily-report-review-note"><strong>Catatan review:</strong> ${escapeHtml(report.reviewNote)}</p>` : ""}<h4>Catatan harian</h4><p class="daily-report-notes">${escapeHtml(report.notes || "-")}</p><h4>Tugas (${(report.tasks || []).length})</h4>${photoCount ? `<p class="field-hint">Ada ${photoCount} foto bukti. Klik foto untuk melihat detailnya.</p>` : ""}${renderTaskEntries(report.tasks || [], reports, taskMap, canReview)}<h4>Lampiran (${(report.attachments || []).length})</h4>${renderAttachments(report.attachments || [])}${reviewActions}`;
}

function renderTaskEntries(entries, reports = [], taskMap = new Map(), canReview = false) {
  if (!entries.length) return `<div class="role-empty-state"><strong>Belum ada tugas.</strong><span>Tugas dengan deadline hari ini akan muncul otomatis.</span></div>`;
  return entries.map((entry) => {
    const report = reports.find((item) => item.id === entry.reportId);
    const task = taskMap.get(entry.taskId);
    const checklist = report?.checklist || [];
    const checklistMarkup = checklist.length
      ? `<div class="daily-report-checklist">${checklist.map((item, index) => `<div class="daily-report-check-item"><span>${item.completed ? "✓" : "○"} ${escapeHtml(item.label)}</span>${item.evidenceUrl && safeUrl(item.evidenceUrl) ? `<button class="request-photo-button" type="button" data-daily-photo="${escapeHtml(entry.taskId)}|${index}" aria-label="Lihat foto bukti ${escapeHtml(item.label)}"><img src="${safeUrl(item.evidenceUrl)}" alt="Bukti ${escapeHtml(item.label)}" /></button>` : ""}</div>`).join("")}</div>`
      : "";
    const reviewActions = canReview && report && report.status === "submitted"
      ? `<button class="approve-registration" type="button" data-task-report-action="approved" data-task-report-id="${escapeHtml(report.id)}" data-task-id="${escapeHtml(entry.taskId)}">ACC</button><button class="reject-registration" type="button" data-task-report-action="revision" data-task-report-id="${escapeHtml(report.id)}" data-task-id="${escapeHtml(entry.taskId)}">Revisi</button>`
      : "";
    const subtaskActions = canReview && task
      ? `<button class="secondary-button" type="button" data-task-subtask-toggle="${escapeHtml(entry.taskId)}">Buat subtugas</button><div class="daily-report-subtask-form" data-task-subtask-form="${escapeHtml(entry.taskId)}" hidden><input type="text" data-subtask-title placeholder="Judul subtugas" /><select data-subtask-assignee><option value="">Pilih employee</option></select><button class="primary-button" type="button" data-task-subtask-submit="${escapeHtml(entry.taskId)}">Buat subtugas</button></div>`
      : "";
    return `<article class="daily-report-task"><div><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(getDeadlineDate(entry.deadline) || "-")} · progres ${Number(entry.progress || 0)}%</span></div><b class="task-status ${escapeHtml(entry.taskStatus || "assigned")}">${entry.completed ? "Selesai" : escapeHtml(TASK_STATUS_LABELS[entry.taskStatus] || entry.taskStatus || "Ditugaskan")}</b>${entry.reportId ? `<small>Laporan tugas: ${escapeHtml(TASK_STATUS_LABELS[entry.reportStatus] || entry.reportStatus || "Dikirim")}</small>` : ""}${report?.description ? `<p class="daily-report-task-report">${escapeHtml(report.description)}</p>` : ""}${checklistMarkup}<div class="daily-report-task-actions">${reviewActions}${subtaskActions}</div></article>`;
  }).join("");
}

function renderAttachments(attachments) {
  if (!attachments.length) return `<div class="role-empty-state"><strong>Belum ada lampiran.</strong><span>Tambahkan foto atau dokumen pendukung.</span></div>`;
  return attachments.map((file) => {
    const image = String(file.resourceType || "").startsWith("image");
    return `<article class="daily-report-file"><div><strong>${escapeHtml(file.fileName)}</strong><span>${image ? "Foto" : escapeHtml(file.resourceType)} · ${escapeHtml(file.access === "private" ? "pribadi" : "publik")}</span></div><button class="secondary-button" type="button" data-daily-${image ? "file-photo" : "file-open"}="${escapeHtml(file.fileId)}">${image ? "Lihat foto" : "Buka"}</button></article>`;
  }).join("");
}

function toDateKey(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return getDateKey(value.toDate());
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : getDateKey(date);
}

function formatDate(value) {
  return toDateKey(value);
}

function reportDateLabel(value) {
  return value || "-";
}
