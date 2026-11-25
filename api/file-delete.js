import { getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import { getAdminApp } from "../server/shared/admin.js";
import { configureCloudinary, isCloudinaryConfigured } from "../server/shared/cloudinary.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { canAccessFile } from "../server/shared/access.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const fileId = String(body.fileId || "").trim();
  if (!fileId) return sendJson(res, 400, { error: "fileId wajib diisi." });

  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection("files").doc(fileId).get();
  if (!snapshot.exists) return sendJson(res, 404, { error: "File tidak ditemukan." });
  const file = snapshot.data();
  const actor = await assertActiveActor(uid);
  if (!actor) return sendJson(res, 403, { error: "Akun tidak aktif." });
  if (!canAccessFile({ ...actor, uid }, file)) return sendJson(res, 403, { error: "Tidak memiliki izin menghapus file." });

  if (!isCloudinaryConfigured()) return sendJson(res, 503, { error: "Cloudinary belum dikonfigurasi." });
  configureCloudinary();
  const result = await cloudinary.uploader.destroy(file.cloudinaryPublicId);
  const nowIso = jakartaNow();
  await db.collection("files").doc(fileId).update({ status: "deleted", deletedBy: uid, deletedAt: nowIso });
  await db.collection("auditLogs").add({
    actorId: uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: actor.role,
    organizationId: actor.organizationId,
    businessId: file.businessId || null,
    action: "file_deleted",
    targetType: "file",
    targetId: fileId,
    metadata: { fileName: file.fileName, publicId: file.cloudinaryPublicId },
    timestamp: nowIso,
  });
  return sendJson(res, 200, { result: result.result, fileId });
}
