import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

const FRESH_AUTH_SECONDS = 5 * 60;
const BATCH_LIMIT = 450;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });
  const authTime = Number(decoded.auth_time);
  if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > FRESH_AUTH_SECONDS) {
    return sendJson(res, 403, { error: "Konfirmasi password sudah kedaluwarsa. Coba lagi." });
  }

  const body = parseBody(req);
  const businessId = String(body.businessId || "").trim();
  if (!businessId) return sendJson(res, 400, { error: "businessId wajib diisi." });

  const db = getFirestore(getAdminApp());
  const actor = await assertActiveActor(uid);
  if (!actor || actor.role !== "owner") return sendJson(res, 403, { error: "Hanya Owner yang dapat menghapus bisnis." });

  const snapshot = await db.collection("businesses").doc(businessId).get();
  if (!snapshot.exists) return sendJson(res, 404, { error: "Bisnis tidak ditemukan." });
  const business = snapshot.data();
  if (business.organizationId !== actor.organizationId) return sendJson(res, 403, { error: "Bisnis di luar organization Anda." });

  const operations = [{ type: "delete", ref: db.collection("businesses").doc(businessId) }];
  const memberships = await db.collection("memberships").where("businessId", "==", businessId).get();
  memberships.docs.forEach((item) => operations.push({ type: "delete", ref: item.ref }));
  const users = await db.collection("users").where("businessIds", "array-contains", businessId).get();
  users.docs.forEach((item) => {
    const data = item.data() || {};
    const changes = { businessIds: (data.businessIds || []).filter((id) => id !== businessId) };
    if (data.selectedBusinessId === businessId) changes.selectedBusinessId = null;
    operations.push({ type: "update", ref: item.ref, data: changes });
  });
  for (let index = 0; index < operations.length; index += BATCH_LIMIT) {
    const batch = db.batch();
    operations.slice(index, index + BATCH_LIMIT).forEach((operation) => {
      if (operation.type === "delete") batch.delete(operation.ref);
      else batch.update(operation.ref, operation.data);
    });
    await batch.commit();
  }

  const nowIso = jakartaNow();
  await db.collection("auditLogs").add({
    actorId: uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: actor.role,
    organizationId: actor.organizationId,
    businessId: null,
    action: "business_deleted",
    targetType: "business",
    targetId: businessId,
    metadata: { name: business.name || "", city: business.city || "" },
    timestamp: nowIso,
  });
  return sendJson(res, 200, { businessId });
}
