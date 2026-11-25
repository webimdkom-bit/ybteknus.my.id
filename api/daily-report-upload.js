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
  const reportId = String(body.reportId || "").trim();
  const fileName = String(body.fileName || "").trim().slice(0, 120);
  const resourceType = body.resourceType === "raw" ? "raw" : body.resourceType === "image" ? "image" : null;
  if (!reportId || !fileName || !resourceType) return sendJson(res, 400, { error: "reportId, fileName, dan resourceType wajib diisi." });

  const db = getFirestore(getAdminApp());
  const [reportSnapshot, actor] = await Promise.all([
    db.collection("dailyReports").doc(reportId).get(),
    assertActiveActor(uid),
  ]);
  if (!reportSnapshot.exists) return sendJson(res, 404, { error: "Laporan harian tidak ditemukan." });
  const report = reportSnapshot.data();
  if (!actor || actor.organizationId !== report.organizationId) return sendJson(res, 403, { error: "Laporan di luar jangkauan." });
  const allowed = report.userId === uid
    || actor.role === "owner"
    || (actor.role === "admin" && (report.businessIds || []).some((id) => (actor.businessIds || []).includes(id)));
  if (!allowed) return sendJson(res, 403, { error: "Anda tidak memiliki akses pada laporan ini." });

  const publicId = `daily/${report.userId}/${report.reportDate}/${fileName}`.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const folder = `daily-reports/${report.userId}`;
  const signature = await generateUploadSignature({ publicId, folder, resourceType });
  return sendJson(res, 200, { ...signature, reportId, fileName });
}
