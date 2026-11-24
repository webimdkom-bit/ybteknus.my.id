import { getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { canAccessFile } from "../server/shared/access.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

function configureCloudinary() {
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

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

  configureCloudinary();
  const result = await cloudinary.v2.uploader.destroy(file.cloudinaryPublicId);
  await db.collection("files").doc(fileId).update({ status: "deleted", deletedBy: uid, deletedAt: jakartaNow() });
  return sendJson(res, 200, { result: result.result, fileId });
}
