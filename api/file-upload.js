import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { generateUploadSignature } from "../server/shared/cloudinary.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const taskId = String(body.taskId || "").trim();
  const reportId = String(body.reportId || "").trim();
  const fileName = String(body.fileName || "").trim().slice(0, 120);
  const resourceType = body.resourceType === "raw" ? "raw" : body.resourceType === "image" ? "image" : null;
  if ((!taskId && !reportId) || (taskId && reportId) || !fileName || !resourceType) {
    return sendJson(res, 400, { error: "taskId atau reportId, fileName, dan resourceType wajib diisi." });
  }

  const db = getFirestore(getAdminApp());
  const actor = await assertActiveActor(uid);
  if (!actor) return sendJson(res, 403, { error: "Akun tidak aktif." });

  if (taskId) {
    const taskSnapshot = await db.collection("tasks").doc(taskId).get();
    if (!taskSnapshot.exists) return sendJson(res, 404, { error: "Tugas tidak ditemukan." });
    const task = taskSnapshot.data();
    if (actor.organizationId !== task.organizationId) return sendJson(res, 403, { error: "Tugas di luar jangkauan." });
    const allowed = actor.role === "owner"
      || (task.assignedTo || []).includes(uid)
      || (actor.role === "admin" && actor.businessIds?.includes(task.businessId));
    if (!allowed) return sendJson(res, 403, { error: "Anda tidak ditugaskan pada tugas ini." });

    const publicId = `evidence/${uid}/${taskId}/${fileName}`.replace(/[^a-zA-Z0-9/_-]/g, "_");
    const folder = `tasks/${uid}`;
    const signature = await generateUploadSignature({ publicId, folder, resourceType });
    return sendJson(res, 200, { ...signature, taskId, fileName });
  }

  const reportSnapshot = await db.collection("dailyReports").doc(reportId).get();
  if (!reportSnapshot.exists) return sendJson(res, 404, { error: "Laporan harian tidak ditemukan." });
  const report = reportSnapshot.data();
  if (actor.organizationId !== report.organizationId) return sendJson(res, 403, { error: "Laporan di luar jangkauan." });
  const allowed = report.userId === uid
    || actor.role === "owner"
    || (actor.role === "admin" && (report.businessIds || []).some((id) => (actor.businessIds || []).includes(id)));
  if (!allowed) return sendJson(res, 403, { error: "Anda tidak memiliki akses pada laporan ini." });

  const publicId = `daily/${report.userId}/${report.reportDate}/${fileName}`.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const folder = `daily-reports/${report.userId}`;
  const signature = await generateUploadSignature({ publicId, folder, resourceType });
  return sendJson(res, 200, { ...signature, reportId, fileName });
}
