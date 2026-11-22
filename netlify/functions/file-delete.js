import { getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import { getAdminApp } from "./_shared/admin";
import { verifyFirebaseToken } from "./_shared/auth";

function json(statusCode, payload) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
}

function configureCloudinary() {
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  const decoded = await verifyFirebaseToken(event.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return json(401, { error: "Unauthorized." });

  const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
  const fileId = String(body.fileId || "").trim();
  if (!fileId) return json(400, { error: "fileId wajib diisi." });

  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection("files").doc(fileId).get();
  if (!snapshot.exists) return json(404, { error: "File tidak ditemukan." });
  const file = snapshot.data();
  const actorSnapshot = await db.collection("users").doc(uid).get();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor) return json(403, { error: "Profil pengguna tidak ditemukan." });
  const allowed = actor.role === "owner"
    || file.uploadedBy === uid
    || (actor.role === "admin" && actor.businessIds?.includes(file.businessId));
  if (!allowed) return json(403, { error: "Tidak memiliki izin menghapus file." });

  configureCloudinary();
  const result = await cloudinary.v2.uploader.destroy(file.cloudinaryPublicId);
  await db.collection("files").doc(fileId).update({ status: "deleted", deletedBy: uid, deletedAt: new Date().toISOString() });
  return json(200, { result: result.result, fileId });
};
