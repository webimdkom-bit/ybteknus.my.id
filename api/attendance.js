import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";
import { jakartaNow, minutesBetweenJakarta } from "../server/shared/time.js";
import { calculateDistanceMeters, getLocationStatus } from "../src/lib/utils/geo.js";
import { calculateAttendanceTiming, pickActiveSchedule, toMinutes } from "../src/features/schedules/schedule-calculations.js";
import { dailyReportKey, isDailyReportReady } from "../src/lib/utils/daily-report.js";

function fail(res, status, message) {
  return sendJson(res, status, { error: message });
}

function overtimeRequestId(uid, workDate) {
  return `autoOT_${uid}_${workDate}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function listOvertimeApprovers(db, actor, businessId) {
  const snapshot = await db.collection("users").where("organizationId", "==", actor.organizationId).get();
  return snapshot.docs.filter((doc) => {
    const user = doc.data();
    if (user.status !== "active") return false;
    if (user.role === "owner") return true;
    if (user.role !== "admin") return false;
    if (businessId && !(user.businessIds || []).includes(businessId)) return false;
    return (user.permissions || []).includes("manageOvertime");
  }).map((doc) => doc.id);
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const actor = await assertActiveActor(decoded?.uid);
  if (!actor) return fail(res, 401, "Unauthorized.");
  if (actor.role !== "employee") return fail(res, 403, "Hanya Employee yang dapat melakukan absensi.");

  const body = parseBody(req);
  const businessId = String(body.businessId || "").trim();
  const type = body.type === "check-in" || body.type === "check-out" ? body.type : null;
  const reason = String(body.reason || "").trim().slice(0, 500);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracy = Number(body.accuracy);
  if (!businessId || !type || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
    return fail(res, 400, "businessId, type, latitude, longitude, dan accuracy wajib valid.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0) {
    return fail(res, 400, "Koordinat atau akurasi tidak valid.");
  }
  if (!(actor.businessIds || []).includes(businessId)) return fail(res, 403, "Bisnis di luar jangkauan.");

  const db = getFirestore(getAdminApp());
  const businessSnapshot = await db.collection("businesses").doc(businessId).get();
  if (!businessSnapshot.exists || businessSnapshot.data().status === "inactive") return fail(res, 404, "Bisnis tidak ditemukan.");
  const business = businessSnapshot.data();
  if (business.organizationId !== actor.organizationId) return fail(res, 403, "Bisnis di luar organisasi.");
  if (!business.location?.isActive) return fail(res, 403, "Lokasi absensi bisnis belum aktif.");

  const nowIso = jakartaNow();
  const attendanceDate = nowIso.slice(0, 10);
  const recordedTime = nowIso.slice(11, 16);

  const distanceMeters = calculateDistanceMeters(latitude, longitude, Number(business.location.latitude), Number(business.location.longitude));
  const radiusMeters = Number(business.location.radiusMeters) || 100;
  const locationStatus = getLocationStatus({ distanceMeters, radiusMeters, accuracy });
  let offsiteRequestId = null;
  if (locationStatus !== "valid") {
    const requests = await db.collection("requests").where("userId", "==", actor.uid).get();
    const offsite = requests.docs.map((doc) => ({ id: doc.id, ...doc.data() })).find((request) => {
      if (request.type !== "offsite" || request.status !== "approved" || request.businessId !== businessId) return false;
      if (request.startDate && attendanceDate < request.startDate) return false;
      if (request.endDate && attendanceDate > request.endDate) return false;
      const actions = request.allowedActions || [];
      return !actions.length || actions.includes(type) || actions.includes("both");
    });
    if (!offsite) {
      return fail(res, 403, locationStatus === "low-accuracy"
        ? `Akurasi GPS terlalu rendah (${Math.round(accuracy)}m).`
        : `Anda berada ${Math.round(distanceMeters)}m dari lokasi absensi. Batasnya ${radiusMeters}m.`);
    }
    offsiteRequestId = offsite.id;
  }

  const attendanceQuery = await db.collection("attendance").where("userId", "==", actor.uid).get();
  const todayEvents = attendanceQuery.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((event) => event.businessId === businessId && event.attendanceDate === attendanceDate);
  const checkInEvent = todayEvents.find((event) => event.type === "check-in");
  const checkOutEvent = todayEvents.find((event) => event.type === "check-out");
  if (type === "check-in" && checkInEvent) return fail(res, 409, "Anda sudah melakukan check-in hari ini.");
  if (type === "check-out" && !checkInEvent) return fail(res, 409, "Check-in belum tercatat hari ini.");
  if (type === "check-out" && checkOutEvent) return fail(res, 409, "Anda sudah melakukan check-out hari ini.");
  if (type === "check-out") {
    const reportSnapshot = await db.collection("dailyReports").doc(dailyReportKey(actor.uid, attendanceDate)).get();
    if (!isDailyReportReady(reportSnapshot.data()?.status)) return fail(res, 409, "Laporan harian belum disubmit.");
  }

  const scheduleQuery = await db.collection("schedules").where("userId", "==", actor.uid).get();
  const assignment = pickActiveSchedule(scheduleQuery.docs.map((doc) => ({ id: doc.id, ...doc.data() })), { businessId, date: attendanceDate });
  let shift = null;
  if (assignment?.shiftId) {
    const shiftSnapshot = await db.collection("shifts").doc(assignment.shiftId).get();
    if (shiftSnapshot.exists && shiftSnapshot.data().organizationId === actor.organizationId && shiftSnapshot.data().businessId === businessId) {
      shift = shiftSnapshot.data();
    }
  }

  const timing = shift ? calculateAttendanceTiming({
    scheduledStart: shift.startTime,
    scheduledEnd: shift.endTime,
    toleranceMinutes: shift.toleranceMinutes,
    checkIn: type === "check-in" ? recordedTime : checkInEvent?.recordedTime,
    checkOut: type === "check-out" ? recordedTime : null,
    now: toMinutes(recordedTime),
  }) : null;

  const scheduleStatus = shift ? "scheduled" : "unscheduled";
  const workDate = type === "check-out"
    ? (checkInEvent?.workDate || checkInEvent?.attendanceDate || checkInEvent?.clientRecordedAt?.slice(0, 10) || attendanceDate)
    : attendanceDate;
  const effectiveReason = reason || checkInEvent?.reason || "";
  if (type === "check-out" && scheduleStatus === "unscheduled" && !effectiveReason) {
    return fail(res, 400, "Absen di luar jadwal memerlukan keterangan.");
  }

  const record = {
    userId: actor.uid,
    organizationId: actor.organizationId,
    businessId,
    type,
    latitude,
    longitude,
    accuracyMeters: Math.round(accuracy),
    distanceMeters: Math.round(distanceMeters),
    locationStatus: offsiteRequestId ? "offsite-approved" : locationStatus,
    offsiteRequestId,
    attendanceDate,
    workDate,
    recordedTime,
    clientRecordedAt: nowIso,
    attendanceStatus: timing?.status || (type === "check-in" ? "belum lengkap" : "tercatat"),
    lateMinutes: timing?.lateAfterToleranceMinutes || 0,
    earlyDepartureMinutes: timing?.earlyDepartureMinutes || 0,
    scheduledStart: shift?.startTime || null,
    scheduledEnd: shift?.endTime || null,
    toleranceMinutes: shift?.toleranceMinutes || 0,
    scheduleStatus,
    reviewStatus: type === "check-out" && scheduleStatus === "unscheduled" ? "pending" : "none",
    reason: effectiveReason || null,
    overtimeRequestId: null,
    source: "server",
    timezone: "Asia/Jakarta",
    createdAt: nowIso,
  };

  const batch = db.batch();
  const attendanceRef = db.collection("attendance").doc();
  let autoOvertime = null;

  if (type === "check-out" && scheduleStatus === "unscheduled") {
    const requestId = overtimeRequestId(actor.uid, workDate);
    const requestRef = db.collection("requests").doc(requestId);
    const existing = await requestRef.get();
    if (!existing.exists) {
      const checkInDate = checkInEvent.attendanceDate || checkInEvent.clientRecordedAt?.slice(0, 10) || workDate;
      const checkInTime = checkInEvent.recordedTime || checkInEvent.clientRecordedAt?.slice(11, 16) || recordedTime;
      const rawDuration = minutesBetweenJakarta(checkInDate, checkInTime, attendanceDate, recordedTime);
      const durationMinutes = Number.isFinite(rawDuration) ? Math.round(rawDuration) : 0;
      const request = {
        userId: actor.uid,
        organizationId: actor.organizationId,
        businessId,
        type: "overtime",
        source: "auto",
        workDate,
        attendanceIds: [checkInEvent.id, attendanceRef.id],
        startDate: workDate,
        endDate: workDate,
        overtimeDate: workDate,
        overtimeStart: checkInTime,
        overtimeEnd: recordedTime,
        durationMinutes,
        reason: effectiveReason || "Absen di luar jadwal",
        status: "pending",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      batch.set(requestRef, request);
      batch.set(db.collection("overtime").doc(requestId), {
        userId: actor.uid,
        organizationId: actor.organizationId,
        businessId,
        requestId,
        source: "auto",
        date: workDate,
        startTime: checkInTime,
        endTime: recordedTime,
        durationMinutes,
        reason: effectiveReason,
        status: "pending",
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      const approvers = await listOvertimeApprovers(db, actor, businessId);
      approvers.forEach((userId) => {
        batch.set(db.collection("notifications").doc(`offschedule_${requestId}_${userId}`), {
          userId,
          organizationId: actor.organizationId,
          businessId,
          type: "request_submitted",
          title: "Pengajuan lembur otomatis",
          body: `${actor.displayName || actor.email || "Karyawan"} · ${workDate} · ${durationMinutes} menit`,
          targetType: "request",
          targetId: requestId,
          actorId: actor.uid,
          actorName: actor.displayName || actor.email || "",
          read: false,
          createdAt: nowIso,
        });
      });
      autoOvertime = { requestId, workDate, durationMinutes, approvers: approvers.length };
    } else {
      autoOvertime = {
        requestId,
        workDate,
        durationMinutes: Number(existing.data().durationMinutes) || 0,
        approvers: 0,
      };
    }
    record.overtimeRequestId = requestId;
  }

  batch.set(attendanceRef, record);
  batch.set(db.collection("auditLogs").doc(), {
    actorId: actor.uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: "employee",
    organizationId: actor.organizationId,
    businessId,
    action: "attendance_recorded",
    targetType: "attendance",
    targetId: attendanceRef.id,
    metadata: { type, attendanceDate, recordedTime, locationStatus: record.locationStatus, scheduleStatus, workDate, overtimeRequestId: record.overtimeRequestId },
    timestamp: nowIso,
  });
  if (autoOvertime && record.overtimeRequestId) {
    batch.set(db.collection("auditLogs").doc(), {
      actorId: actor.uid,
      actorName: actor.displayName || actor.email || "",
      actorRole: "employee",
      organizationId: actor.organizationId,
      businessId,
      action: "offschedule_overtime_auto_created",
      targetType: "request",
      targetId: autoOvertime.requestId,
      metadata: { workDate, durationMinutes: autoOvertime.durationMinutes, approvers: autoOvertime.approvers },
      timestamp: nowIso,
    });
  }
  await batch.commit();

  return sendJson(res, 200, { id: attendanceRef.id, ...record, autoOvertime });
}
