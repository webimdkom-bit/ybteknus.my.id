import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";
import { jakartaNow } from "../server/shared/time.js";
import { dailyReportKey, isDailyReportReady } from "../src/lib/utils/daily-report.js";

function fail(res, status, message) {
  return sendJson(res, status, { error: message });
}

async function reviewOffSchedule({ res, db, actor, body }) {
  const requestId = String(body.requestId || "").trim();
  const status = body.status === "approved" || body.status === "rejected" ? body.status : null;
  const reviewNote = String(body.reviewNote || "").trim().slice(0, 500);
  if (!requestId || !status) return fail(res, 400, "requestId dan status wajib valid.");

  const requestRef = db.collection("requests").doc(requestId);
  const snapshot = await requestRef.get();
  if (!snapshot.exists) return fail(res, 404, "Pengajuan tidak ditemukan.");
  const request = snapshot.data();
  if (request.type !== "overtime" || request.source !== "auto") return fail(res, 400, "Bukan pengajuan lembur otomatis.");
  if (request.organizationId !== actor.organizationId) return fail(res, 403, "Organisasi tidak sesuai.");
  if (request.status !== "pending" && request.status !== status) return fail(res, 409, "Pengajuan sudah ditinjau dengan status lain.");

  const businessId = request.businessId || null;
  if (actor.role !== "owner") {
    if (actor.role !== "admin") return fail(res, 403, "Tidak memiliki izin.");
    if (!businessId || !(actor.businessIds || []).includes(businessId)) return fail(res, 403, "Bisnis di luar jangkauan.");
    const membership = await db.collection("memberships").doc(`${actor.uid}_${businessId}`).get();
    if (!membership.exists || !(membership.data().permissions || []).includes("manageOvertime")) {
      return fail(res, 403, "Izin manageOvertime diperlukan.");
    }
  }

  const attendanceIds = (request.attendanceIds || []).filter((id) => typeof id === "string" && id.trim());
  const now = jakartaNow();
  const batch = db.batch();
  attendanceIds.forEach((id) => {
    batch.update(db.collection("attendance").doc(id), {
      reviewStatus: status,
      reviewedBy: actor.uid,
      reviewedAt: now,
      reviewNote,
      overtimeRequestStatus: status,
      updatedAt: now,
    });
  });
  batch.update(requestRef, { status, reviewedBy: actor.uid, reviewedAt: now, reviewNote, updatedAt: now });
  batch.set(db.collection("auditLogs").doc(), {
    actorId: actor.uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: actor.role,
    organizationId: actor.organizationId,
    businessId,
    action: "offschedule_reviewed",
    targetType: "request",
    targetId: requestId,
    metadata: { status, attendanceIds: attendanceIds.length, workDate: request.workDate || request.overtimeDate || null },
    timestamp: now,
  });
  await batch.commit();
  return sendJson(res, 200, { requestId, status, reviewedAttendance: attendanceIds.length });
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const actor = await assertActiveActor(decoded?.uid);
  if (!actor) return fail(res, 401, "Unauthorized.");

  const body = parseBody(req);
  const db = getFirestore(getAdminApp());
  if (String(body.action || "").trim() === "review-offschedule") {
    return reviewOffSchedule({ res, db, actor, body });
  }
  if (!["owner", "admin"].includes(actor.role)) return fail(res, 403, "Tidak memiliki izin koreksi.");

  const requestId = String(body.requestId || "").trim();
  const targetUserId = String(body.userId || "").trim();
  const businessId = String(body.businessId || "").trim();
  const correctionDate = String(body.correctionDate || "").trim();
  const correctionType = String(body.correctionType || "").trim();
  const requestedTime = String(body.requestedTime || "").trim();
  if (!requestId || !targetUserId || !businessId || !correctionDate || !["check-in", "check-out"].includes(correctionType) || !/^\d{2}:\d{2}$/.test(requestedTime)) {
    return fail(res, 400, "Data koreksi tidak lengkap.");
  }
  if (actor.role === "admin" && (!(actor.permissions || []).includes("approveCorrections") || !(actor.businessIds || []).includes(businessId))) {
    return fail(res, 403, "Tidak memiliki izin koreksi pada bisnis ini.");
  }

  const requestSnapshot = await db.collection("requests").doc(requestId).get();
  if (!requestSnapshot.exists) return fail(res, 404, "Pengajuan tidak ditemukan.");
  const request = requestSnapshot.data();
  if (request.type !== "attendance-correction" || request.status !== "approved") return fail(res, 400, "Pengajuan koreksi belum disetujui.");
  if (request.organizationId !== actor.organizationId || request.businessId !== businessId || request.userId !== targetUserId) {
    return fail(res, 403, "Pengajuan di luar jangkauan.");
  }

  const attendanceQuery = await db.collection("attendance").where("userId", "==", targetUserId).get();
  const target = attendanceQuery.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .find((event) => event.businessId === businessId && event.attendanceDate === correctionDate && event.type === correctionType);
  if (!target) return fail(res, 404, "Absensi yang dikoreksi tidak ditemukan.");
  if (correctionType === "check-out") {
    const reportSnapshot = await db.collection("dailyReports").doc(dailyReportKey(targetUserId, correctionDate)).get();
    if (!isDailyReportReady(reportSnapshot.data()?.status)) return fail(res, 409, "Laporan harian belum disubmit.");
  }

  const before = {
    recordedTime: target.recordedTime || null,
    attendanceStatus: target.attendanceStatus || null,
    lateMinutes: target.lateMinutes || 0,
    earlyDepartureMinutes: target.earlyDepartureMinutes || 0,
    locationStatus: target.locationStatus || null,
  };
  const after = { ...before, recordedTime: requestedTime };
  const nowIso = jakartaNow();

  await db.collection("attendance").doc(target.id).update({
    recordedTime: requestedTime,
    clientRecordedAt: `${correctionDate}T${requestedTime}:00`,
    corrected: true,
    correctionRequestId: requestId,
  });

  const correction = await db.collection("attendanceCorrections").add({
    userId: targetUserId,
    organizationId: actor.organizationId,
    businessId,
    attendanceId: target.id,
    requestId,
    date: correctionDate,
    type: correctionType,
    before,
    after,
    reason: request.reason || "",
    evidenceUrl: request.evidenceUrl || "",
    correctedBy: actor.uid,
    reviewerName: actor.displayName || actor.email || "",
    createdAt: nowIso,
  });

  await db.collection("auditLogs").add({
    actorId: actor.uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: actor.role,
    organizationId: actor.organizationId,
    businessId,
    action: "attendance_corrected",
    targetType: "attendanceCorrection",
    targetId: correction.id,
    metadata: { requestId, attendanceId: target.id, date: correctionDate, requestedTime },
    timestamp: nowIso,
  });

  return sendJson(res, 200, { id: correction.id, before, after });
}
