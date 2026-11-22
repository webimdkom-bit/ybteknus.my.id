import {
  createAttendanceCorrection,
  listAttendance,
  updateAttendance,
} from "../../lib/firestore/repositories.js";

export async function applyAttendanceCorrection(request, reviewer) {
  if (request.type !== "attendance-correction" || request.status !== "approved") return null;
  if (!request.correctionDate || !request.correctionType || !request.requestedTime) {
    throw new Error("Data koreksi absensi tidak lengkap.");
  }
  const events = await listAttendance(request.userId);
  const target = events.find((event) => event.businessId === request.businessId
    && (event.attendanceDate || event.clientRecordedAt?.slice(0, 10)) === request.correctionDate
    && event.type === request.correctionType);
  if (!target) throw new Error("Absensi yang dikoreksi tidak ditemukan.");

  const before = {
    recordedTime: target.recordedTime || null,
    attendanceStatus: target.attendanceStatus || null,
    lateMinutes: target.lateMinutes || 0,
    earlyDepartureMinutes: target.earlyDepartureMinutes || 0,
    locationStatus: target.locationStatus || null,
  };
  const after = { ...before, recordedTime: request.requestedTime };

  await updateAttendance(target.id, {
    recordedTime: request.requestedTime,
    clientRecordedAt: `${request.correctionDate}T${request.requestedTime}:00`,
    corrected: true,
    correctionRequestId: request.id,
  });

  return createAttendanceCorrection({
    userId: request.userId,
    organizationId: request.organizationId,
    businessId: request.businessId,
    attendanceId: target.id,
    requestId: request.id,
    date: request.correctionDate,
    type: request.correctionType,
    before,
    after,
    reason: request.reason || "",
    evidenceUrl: request.evidenceUrl || "",
    correctedBy: reviewer?.uid || null,
    reviewerName: reviewer?.displayName || "",
  });
}
