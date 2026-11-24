import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const fileName = String(body.fileName || "").trim();
  const publicId = String(body.publicId || "").trim();
  const secureUrl = String(body.secureUrl || "").trim();
  if (!fileName || !publicId || !secureUrl) return sendJson(res, 400, { error: "fileName, publicId, dan secureUrl wajib diisi." });

  const db = getFirestore(getAdminApp());
  const actor = await assertActiveActor(uid);
  if (!actor) return sendJson(res, 403, { error: "Akun tidak aktif." });

  const organizationId = String(body.organizationId || actor.organizationId || "").trim();
  const businessId = body.businessId ? String(body.businessId).trim() : null;
  if (actor.organizationId !== organizationId) return sendJson(res, 403, { error: "Organisasi tidak sesuai." });
  if (actor.role !== "owner" && businessId && !(actor.businessIds || []).includes(businessId)) return sendJson(res, 403, { error: "Bisnis di luar jangkauan." });

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
    createdAt: jakartaNow(),
  };
  const reference = await db.collection("files").add(record);
  return sendJson(res, 200, { id: reference.id, ...record });
}
