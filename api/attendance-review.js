import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const actor = await assertActiveActor(decoded?.uid);
  if (!actor) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const requestId = String(body.requestId || "").trim();
  const status = body.status === "approved" || body.status === "rejected" ? body.status : null;
  const reviewNote = String(body.reviewNote || "").trim().slice(0, 500);
  if (!requestId || !status) return sendJson(res, 400, { error: "requestId dan status wajib valid." });

  const db = getFirestore(getAdminApp());
  const requestRef = db.collection("requests").doc(requestId);
  const snapshot = await requestRef.get();
  if (!snapshot.exists) return sendJson(res, 404, { error: "Pengajuan tidak ditemukan." });
  const request = snapshot.data();
  if (request.type !== "overtime" || request.source !== "auto") return sendJson(res, 400, { error: "Bukan pengajuan lembur otomatis." });
  if (request.organizationId !== actor.organizationId) return sendJson(res, 403, { error: "Organisasi tidak sesuai." });
  if (request.status !== "pending" && request.status !== status) return sendJson(res, 409, { error: "Pengajuan sudah ditinjau dengan status lain." });

  const businessId = request.businessId || null;
  if (actor.role !== "owner") {
    if (actor.role !== "admin") return sendJson(res, 403, { error: "Tidak memiliki izin." });
    if (!businessId || !(actor.businessIds || []).includes(businessId)) return sendJson(res, 403, { error: "Bisnis di luar jangkauan." });
    const membership = await db.collection("memberships").doc(`${actor.uid}_${businessId}`).get();
    if (!membership.exists || !(membership.data().permissions || []).includes("manageOvertime")) {
      return sendJson(res, 403, { error: "Izin manageOvertime diperlukan." });
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
  batch.update(requestRef, {
    status,
    reviewedBy: actor.uid,
    reviewedAt: now,
    reviewNote,
    updatedAt: now,
  });
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
