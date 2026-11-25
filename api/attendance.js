import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";
import { jakartaNow } from "../server/shared/time.js";
import { calculateDistanceMeters, getLocationStatus } from "../src/lib/utils/geo.js";
import { calculateAttendanceTiming, pickActiveSchedule, toMinutes } from "../src/features/schedules/schedule-calculations.js";

function fail(res, status, message) {
  return sendJson(res, status, { error: message });
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
    recordedTime,
    clientRecordedAt: nowIso,
    attendanceStatus: timing?.status || (type === "check-in" ? "belum lengkap" : "tercatat"),
    lateMinutes: timing?.lateAfterToleranceMinutes || 0,
    earlyDepartureMinutes: timing?.earlyDepartureMinutes || 0,
    scheduledStart: shift?.startTime || null,
    scheduledEnd: shift?.endTime || null,
    toleranceMinutes: shift?.toleranceMinutes || 0,
    source: "server",
    timezone: "Asia/Jakarta",
    createdAt: nowIso,
  };
  const reference = await db.collection("attendance").add(record);

  await db.collection("auditLogs").add({
    actorId: actor.uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: "employee",
    organizationId: actor.organizationId,
    businessId,
    action: "attendance_recorded",
    targetType: "attendance",
    targetId: reference.id,
    metadata: { type, attendanceDate, recordedTime, locationStatus: record.locationStatus },
    timestamp: nowIso,
  });

  return sendJson(res, 200, { id: reference.id, ...record });
}
