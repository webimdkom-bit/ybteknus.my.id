import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { ADMIN_PERMISSIONS } from "../server/shared/permissions.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

const FRESH_AUTH_SECONDS = 5 * 60;
const BATCH_LIMIT = 450;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);

  if (body.action === "delete-business") {
    const businessId = String(body.businessId || "").trim();
    if (!businessId) return sendJson(res, 400, { error: "businessId wajib diisi." });
    const authTime = Number(decoded.auth_time);
    if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > FRESH_AUTH_SECONDS) {
      return sendJson(res, 403, { error: "Konfirmasi password sudah kedaluwarsa. Coba lagi." });
    }
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

  const role = body.role === "owner" ? "owner" : body.role === "admin" ? "admin" : null;
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const organizationId = String(body.organizationId || "").trim();
  if (!role || !name || !email || !organizationId) return sendJson(res, 400, { error: "role, name, email, organizationId wajib diisi." });

  const app = getAdminApp();
  const db = getFirestore(app);
  const actor = await assertActiveActor(uid);
  if (!actor || actor.role !== "owner" || actor.organizationId !== organizationId) return sendJson(res, 403, { error: "Hanya Owner organization yang dapat membuat akun." });

  const rawAccess = Array.isArray(body.access) ? body.access : [];
  const businessIds = [...new Set(rawAccess.map((item) => String(item.businessId || "").trim()).filter(Boolean))];
  if (businessIds.length) {
    const snapshots = await Promise.all(businessIds.map((id) => db.collection("businesses").doc(id).get()));
    if (snapshots.some((snapshot) => !snapshot.exists || snapshot.data().organizationId !== organizationId)) return sendJson(res, 400, { error: "Bisnis tidak valid untuk organization ini." });
  }
  const access = rawAccess
    .filter((item) => businessIds.includes(String(item.businessId || "").trim()))
    .map((item) => ({
      businessId: String(item.businessId).trim(),
      permissions: (Array.isArray(item.permissions) ? item.permissions : []).filter((permission) => ADMIN_PERMISSIONS.includes(permission)),
    }));

  let user;
  try {
    user = await getAuth(app).createUser({
      email,
      displayName: name,
      password: `${Date.now()}${Math.random().toString(36).slice(2)}Aa1!`,
    });
  } catch (error) {
    return sendJson(res, 400, { error: error.code === "auth/email-already-exists" ? "Email tersebut sudah memiliki akun." : error.message });
  }

  await db.collection("users").doc(user.uid).set({
    displayName: name,
    email,
    role,
    status: "active",
    organizationId,
    businessIds: role === "admin" ? businessIds : [],
    permissions: role === "admin" ? [...new Set(access.flatMap((item) => item.permissions || []))] : [],
    createdAt: jakartaNow(),
    updatedAt: jakartaNow(),
  });
  if (role === "admin") {
    const batch = db.batch();
    access.forEach((item) => {
      const businessId = String(item.businessId || "").trim();
      if (!businessId) return;
      batch.set(db.collection("memberships").doc(`${user.uid}_${businessId}`), {
        userId: user.uid,
        organizationId,
        businessId,
        role: "admin",
        permissions: Array.isArray(item.permissions) ? item.permissions : [],
        createdAt: jakartaNow(),
      });
    });
    await batch.commit();
  }
  return sendJson(res, 200, { uid: user.uid, email });
}
