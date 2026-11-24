import { submitAttendanceCorrection } from "../attendance/attendance-api.js";

export async function applyAttendanceCorrection(request, reviewer) {
  if (request.type !== "attendance-correction" || request.status !== "approved") return null;
  if (!request.correctionDate || !request.correctionType || !request.requestedTime) {
    throw new Error("Data koreksi absensi tidak lengkap.");
  }
  return submitAttendanceCorrection({
    requestId: request.id,
    userId: request.userId,
    organizationId: request.organizationId,
    businessId: request.businessId,
    correctionDate: request.correctionDate,
    correctionType: request.correctionType,
    requestedTime: request.requestedTime,
    reviewerUid: reviewer?.uid || null,
  });
}
