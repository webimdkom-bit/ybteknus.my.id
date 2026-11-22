import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./_shared/admin";
import { verifyFirebaseToken } from "./_shared/auth";

function json(statusCode, payload) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  const decoded = await verifyFirebaseToken(event.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return json(401, { error: "Unauthorized." });

  const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
  const fileName = String(body.fileName || "").trim();
  const publicId = String(body.publicId || "").trim();
  const secureUrl = String(body.secureUrl || "").trim();
  if (!fileName || !publicId || !secureUrl) return json(400, { error: "fileName, publicId, dan secureUrl wajib diisi." });

  const db = getFirestore(getAdminApp());
  const actorSnapshot = await db.collection("users").doc(uid).get();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor) return json(403, { error: "Profil pengguna tidak ditemukan." });

  const organizationId = String(body.organizationId || actor.organizationId || "").trim();
  const businessId = body.businessId ? String(body.businessId).trim() : null;
  if (actor.organizationId !== organizationId) return json(403, { error: "Organisasi tidak sesuai." });
  if (actor.role !== "owner" && businessId && !(actor.businessIds || []).includes(businessId)) {
    return json(403, { error: "Bisnis di luar jangkauan." });
  }

  const record = {
    fileName,
    resourceType: String(body.resourceType || "image"),
    format: String(body.format || fileName.split(".").pop() || "bin"),
    cloudinaryPublicId: publicId,
    secureUrl,
    uploadedBy: uid,
    organizationId,
    businessId: businessId || null,
    category: String(body.category || "task-evidence"),
    access: body.access === "private" ? "private" : "public",
    targetType: body.targetType || null,
    targetId: body.targetId || null,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  const reference = await db.collection("files").add(record);
  return json(200, { id: reference.id, ...record });
};
