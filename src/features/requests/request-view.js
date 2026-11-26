import {
  createOperationalRequest,
  listOperationalRequestsForBusiness,
  listOperationalRequestsForOrganization,
  listOperationalRequestsForUser,
  reviewOperationalRequest,
} from "../../lib/firestore/repositories.js";
import { getBusiness } from "../../lib/firestore/repositories.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";
import { applyAttendanceCorrection } from "../attendance-corrections/correction-service.js";
import { listAttendanceCorrectionsForUser, createOvertime, listOvertimeForUser, updateOvertime } from "../../lib/firestore/repositories.js";
import { escapeHtml, setBusy } from "../../lib/utils/html.js";
import { getJakartaISO } from "../../lib/utils/time.js";
import { canReviewRequest, reviewableBusinessIds } from "../permissions/permission-service.js";

const REQUEST_TYPES = Object.freeze([
  ["permission", "Izin"],
  ["leave", "Cuti"],
  ["offsite", "Absensi di luar lokasi"],
  ["attendance-correction", "Koreksi absensi"],
  ["overtime", "Lembur"],
]);

function minutesBetween(start, end) {
  const [startHours, startMinutes] = String(start || "").split(":").map(Number);
  const [endHours, endMinutes] = String(end || "").split(":").map(Number);
  if (![startHours, startMinutes, endHours, endMinutes].every(Number.isFinite)) return 0;
  return Math.max(0, (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes));
}

export async function openRequestManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "request-overlay";
  overlay.innerHTML = profile.role === "employee" ? employeeRequestMarkup() : reviewRequestMarkup(profile);
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".request-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  if (profile.role === "employee") await setupEmployeeRequests(overlay, profile);
  else await setupRequestReview(overlay, profile);
}

function employeeRequestMarkup() {
  return `<section class="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><div class="request-modal-head"><div><p class="eyebrow">MY REQUESTS</p><h2 id="request-title">Pengajuan</h2><p>Ajukan izin, cuti, koreksi absensi, atau lembur.</p></div><button class="icon-button request-close" aria-label="Tutup">×</button></div><div class="request-layout"><form class="request-form"><div class="field"><label for="request-type">Jenis pengajuan</label><select id="request-type" name="type" required>${REQUEST_TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div><div class="field"><label for="request-business">Bisnis</label><select id="request-business" name="businessId" required><option value="">Memuat bisnis...</option></select></div><div class="request-date-grid"><div class="field"><label for="request-start">Mulai</label><input id="request-start" name="startDate" type="date" required /></div><div class="field"><label for="request-end">Selesai</label><input id="request-end" name="endDate" type="date" required /></div></div><div class="field"><label for="request-reason">Alasan</label><textarea id="request-reason" name="reason" rows="4" placeholder="Jelaskan kebutuhan Anda" required></textarea></div><div class="field"><label for="request-evidence">Link bukti <span>(opsional)</span></label><input id="request-evidence" name="evidenceUrl" type="url" placeholder="https://..." /></div><div class="field" data-offsite-actions hidden><label for="request-actions">Tindakan yang diizinkan</label><select id="request-actions" name="allowedActions"><option value="both">Check-in & check-out</option><option value="check-in">Check-in saja</option><option value="check-out">Check-out saja</option></select></div><div data-correction-fields hidden><div class="field"><label for="correction-date">Tanggal absensi</label><input id="correction-date" name="correctionDate" type="date" /></div><div class="field"><label for="correction-type">Data yang dikoreksi</label><select id="correction-type" name="correctionType"><option value="check-in">Check-in</option><option value="check-out">Check-out</option></select></div><div class="field"><label for="correction-time">Waktu yang diminta</label><input id="correction-time" name="requestedTime" type="time" /></div></div><div data-overtime-fields hidden><div class="field"><label for="overtime-date">Tanggal lembur</label><input id="overtime-date" name="overtimeDate" type="date" /></div><div class="request-date-grid"><div class="field"><label for="overtime-start">Mulai</label><input id="overtime-start" name="overtimeStart" type="time" /></div><div class="field"><label for="overtime-end">Selesai</label><input id="overtime-end" name="overtimeEnd" type="time" /></div></div></div><p class="request-message" role="status"></p><p class="request-error" role="alert"></p><button class="primary-button" type="submit">Kirim pengajuan <span>→</span></button></form><div class="request-history"><h3>Riwayat pengajuan</h3><div class="request-list"><p class="request-empty">Memuat pengajuan...</p></div></div></div></section>`;
}

function reviewRequestMarkup(profile) {
  return `<section class="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><div class="request-modal-head"><div><p class="eyebrow">REQUEST REVIEW</p><h2 id="request-title">Review pengajuan</h2><p>${profile.role === "owner" ? "Review seluruh pengajuan organization." : "Review pengajuan sesuai izin Anda."}</p></div><button class="icon-button request-close" aria-label="Tutup">×</button></div><p class="owner-form-message" data-request-review-message></p><div class="request-list request-review-list"><p class="request-empty">Memuat pengajuan...</p></div></section>`;
}

async function setupEmployeeRequests(overlay, profile) {
  const businessSelect = overlay.querySelector("#request-business");
  const businesses = (await Promise.all((profile.businessIds || []).map((id) => getBusiness(id)))).filter(Boolean);
  businessSelect.innerHTML = businesses.length ? businesses.map((business) => `<option value="${business.id}">${business.name}</option>`).join("") : `<option value="">Belum ada bisnis</option>`;
  const typeSelect = overlay.querySelector("#request-type");
  const offsiteField = overlay.querySelector("[data-offsite-actions]");
  const correctionField = overlay.querySelector("[data-correction-fields]");
  const overtimeField = overlay.querySelector("[data-overtime-fields]");
  const toggleConditional = () => {
    offsiteField.hidden = typeSelect.value !== "offsite";
    correctionField.hidden = typeSelect.value !== "attendance-correction";
    overtimeField.hidden = typeSelect.value !== "overtime";
  };
  typeSelect.addEventListener("change", toggleConditional);
  toggleConditional();
  const list = overlay.querySelector(".request-list");
  const load = async () => {
    const requests = (await listOperationalRequestsForUser(profile.uid)).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    const corrections = (await listAttendanceCorrectionsForUser(profile.uid)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const overtime = (await listOvertimeForUser(profile.uid)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const correctionRows = corrections.map((item) => `<article class="request-row is-approved"><div class="request-row-mark">↺</div><div class="request-person"><strong>Koreksi absensi · ${item.date}</strong><span>${escapeHtml(item.type)} · ${escapeHtml(item.before?.recordedTime || "-")} → ${escapeHtml(item.after?.recordedTime || "-")}</span><small>${escapeHtml(item.reason || "Tanpa alasan")}</small></div><span class="request-status approved">Disetujui</span></article>`).join("");
    const overtimeRows = overtime.map((item) => `<article class="request-row is-${item.status === "approved" ? "approved" : "pending"}"><div class="request-row-mark">+</div><div class="request-person"><strong>Lembur · ${item.date}</strong><span>${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)} · ${Math.round((item.durationMinutes || 0) / 60 * 100) / 100} jam</span><small>${escapeHtml(item.reason || "Tanpa alasan")}</small></div><span class="request-status ${item.status === "approved" ? "approved" : "pending"}">${item.status}</span></article>`).join("");
    const rows = requests.map(requestRow).join("") + correctionRows + overtimeRows;
    list.innerHTML = rows ? rows : `<div class="request-empty-state"><strong>Belum ada pengajuan.</strong><span>Pengajuan Anda akan tampil di sini.</span></div>`;
  };
  await load();
  overlay.querySelector(".request-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".request-error");
    const message = form.querySelector(".request-message");
    error.textContent = "";
    message.textContent = "";
    const data = Object.fromEntries(new FormData(form));
    data.allowedActions = data.type === "offsite" ? [data.allowedActions || "both"] : [];
    if (data.type === "attendance-correction" && (!data.correctionDate || !data.requestedTime)) {
      error.textContent = "Tanggal absensi dan waktu yang diminta wajib diisi.";
      return;
    }
    if (data.type === "overtime" && (!data.overtimeDate || !data.overtimeStart || !data.overtimeEnd)) {
      error.textContent = "Tanggal, jam mulai, dan jam selesai lembur wajib diisi.";
      return;
    }
    if (data.type === "overtime") data.durationMinutes = minutesBetween(data.overtimeStart, data.overtimeEnd);
    if (data.endDate < data.startDate) { error.textContent = "Tanggal selesai tidak boleh sebelum tanggal mulai."; return; }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const request = await createOperationalRequest({ ...data, userId: profile.uid, organizationId: profile.organizationId });
      logAuditSafe({ profile, action: "request_submitted", targetType: "request", targetId: request?.id || null, businessId: data.businessId, metadata: { type: data.type } });
      if (data.type === "overtime") {
        await createOvertime({
          userId: profile.uid,
          organizationId: profile.organizationId,
          businessId: data.businessId,
          requestId: request?.id || null,
          date: data.overtimeDate,
          startTime: data.overtimeStart,
          endTime: data.overtimeEnd,
          durationMinutes: data.durationMinutes,
          reason: data.reason || "",
        });
      }
      const permission = data.type === "attendance-correction" ? "approveCorrections" : data.type === "overtime" ? "manageOvertime" : "approveLeave";
      const notification = {
        title: data.type === "attendance-correction" ? "Pengajuan koreksi absensi" : data.type === "overtime" ? "Pengajuan lembur" : data.type === "offsite" ? "Pengajuan absensi luar lokasi" : "Pengajuan izin/cuti baru",
        body: `Pengajuan ${data.type} menunggu persetujuan.`,
        organizationId: profile.organizationId,
        businessId: data.businessId,
        targetType: "request",
        targetId: request?.id || null,
      };
      notifySafe({ ...notification, type: NOTIFICATION_TYPES.requestSubmitted, audience: "owner" });
      notifySafe({ ...notification, type: data.type === "attendance-correction" ? NOTIFICATION_TYPES.correctionRequested : data.type === "overtime" ? NOTIFICATION_TYPES.overtimeInfo : NOTIFICATION_TYPES.requestSubmitted, audience: "admins", permission });
      form.reset();
      message.textContent = "Pengajuan berhasil dikirim dan menunggu persetujuan.";
      await load();
    } catch (submissionError) { error.textContent = submissionError.message; }
    submit.disabled = false;
  });
}

async function setupRequestReview(overlay, profile, notice = "") {
  const list = overlay.querySelector(".request-review-list");
  const message = overlay.querySelector("[data-request-review-message]");
  if (message) message.textContent = notice;
  try {
    const scopes = profile.role === "owner" ? (profile.businessIds || []) : reviewableBusinessIds(profile);
    const requests = profile.role === "owner"
      ? await listOperationalRequestsForOrganization(profile.organizationId)
      : scopes.length
        ? (await Promise.all(scopes.map((businessId) => listOperationalRequestsForBusiness(profile.organizationId, businessId)))).flat()
        : [];
    const pending = requests.filter((request) => request.status === "pending" && canReviewRequest(profile, request));
    list.innerHTML = pending.length ? pending.map((request) => reviewRequestRow(request)).join("") : `<div class="request-empty-state"><strong>All clear.</strong><span>Tidak ada pengajuan yang menunggu review.</span></div>`;
    list.querySelectorAll("[data-request-action]").forEach((button) => button.addEventListener("click", async () => {
      const request = pending.find((item) => item.id === button.dataset.requestId);
      if (!request) return;
      const reviewNote = window.prompt("Catatan review (opsional):", "");
      const restore = setBusy(button, "Memproses...");
      const sideEffectErrors = [];
      try {
        await reviewOperationalRequest(request.id, { status: button.dataset.requestAction, reviewedBy: profile.uid, reviewedAt: getJakartaISO(), reviewNote: reviewNote || "" });
        if (request.type === "attendance-correction" && button.dataset.requestAction === "approved") {
          try {
            await applyAttendanceCorrection({ ...request, status: "approved" }, profile);
            logAuditSafe({ profile, action: "attendance_corrected", targetType: "attendance", targetId: request.id, businessId: request.businessId, metadata: { date: request.correctionDate, type: request.correctionType, requestedTime: request.requestedTime } });
          } catch (correctionError) {
            sideEffectErrors.push(`Koreksi absensi: ${correctionError?.message || correctionError}`);
          }
        }
        logAuditSafe({ profile, action: button.dataset.requestAction === "approved" ? "request_approved" : "request_rejected", targetType: "request", targetId: request.id, businessId: request.businessId, metadata: { type: request.type, reviewNote: reviewNote || "" } });
        if (request.type === "overtime") {
          try {
            const overtimeRecords = await listOvertimeForUser(request.userId);
            const overtime = overtimeRecords.find((item) => item.requestId === request.id);
            if (overtime) {
              await updateOvertime(overtime.id, {
                status: button.dataset.requestAction === "approved" ? "approved" : "rejected",
                reviewedBy: profile.uid,
                reviewNote: reviewNote || "",
              });
              logAuditSafe({ profile, action: "overtime_reviewed", targetType: "overtime", targetId: overtime.id, businessId: request.businessId, metadata: { status: button.dataset.requestAction, durationMinutes: overtime.durationMinutes } });
            }
          } catch (overtimeError) { sideEffectErrors.push(`Lembur: ${overtimeError?.message || overtimeError}`); }
        }
        notifySafe({
          type: button.dataset.requestAction === "approved" ? NOTIFICATION_TYPES.requestApproved : NOTIFICATION_TYPES.requestRejected,
          title: button.dataset.requestAction === "approved" ? "Pengajuan disetujui" : "Pengajuan ditolak",
          body: `${request.type}${reviewNote ? ` · ${reviewNote}` : ""}`,
          organizationId: request.organizationId,
          businessId: request.businessId,
          targetType: "request",
          targetId: request.id,
          userIds: [request.userId],
        });
        await setupRequestReview(overlay, profile, sideEffectErrors.join(" · "));
      } catch (error) {
        const row = button.closest(".request-row");
        const rowError = row?.querySelector(".request-error");
        if (rowError) rowError.textContent = error.message;
        if (message) message.textContent = error.message;
      } finally { restore(); }
    }));
  } catch (error) { list.innerHTML = `<p class="request-error">${error.message}</p>`; }
}

function requestRow(request) {
  const label = REQUEST_TYPES.find(([value]) => value === request.type)?.[1] || request.type;
  return `<article class="request-row"><div class="request-row-mark">${label.slice(0, 1)}</div><div><strong>${label}</strong><span>${request.startDate} – ${request.endDate}</span><small>${escapeHtml(request.reason)}</small></div><b class="request-status ${request.status}">${request.status}</b></article>`;
}

function reviewRequestRow(request) {
  const label = REQUEST_TYPES.find(([value]) => value === request.type)?.[1] || request.type;
  return `<article class="request-row"><div class="request-row-mark">${label.slice(0, 1)}</div><div><strong>${label}</strong><span>${escapeHtml(request.startDate)} – ${escapeHtml(request.endDate)} · ${escapeHtml(request.businessId)}</span><small>${escapeHtml(request.reason)}</small></div><div class="request-actions"><button class="approve-registration" data-request-action="approved" data-request-id="${request.id}">Setujui</button><button class="reject-registration" data-request-action="rejected" data-request-id="${request.id}">Tolak</button></div><p class="request-error" role="alert"></p></article>`;
}
