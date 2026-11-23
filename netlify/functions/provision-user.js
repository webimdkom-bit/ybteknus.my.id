import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./_shared/admin";
import { verifyFirebaseToken } from "./_shared/auth";
import { ADMIN_PERMISSIONS } from "./_shared/permissions";
import { jakartaNow } from "./_shared/time";

function json(statusCode, payload) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  const decoded = await verifyFirebaseToken(event.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return json(401, { error: "Unauthorized." });

  const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
  const role = body.role === "owner" ? "owner" : body.role === "admin" ? "admin" : null;
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const organizationId = String(body.organizationId || "").trim();
  if (!role || !name || !email || !organizationId) return json(400, { error: "role, name, email, organizationId wajib diisi." });

  const app = getAdminApp();
  const db = getFirestore(app);
  const actorSnapshot = await db.collection("users").doc(uid).get();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor || actor.role !== "owner" || actor.organizationId !== organizationId) {
    return json(403, { error: "Hanya Owner organization yang dapat membuat akun." });
  }

  const rawAccess = Array.isArray(body.access) ? body.access : [];
  const businessIds = [...new Set(rawAccess.map((item) => String(item.businessId || "").trim()).filter(Boolean))];
  if (businessIds.length) {
    const snapshots = await Promise.all(businessIds.map((id) => db.collection("businesses").doc(id).get()));
    if (snapshots.some((snapshot) => !snapshot.exists || snapshot.data().organizationId !== organizationId)) {
      return json(400, { error: "Bisnis tidak valid untuk organization ini." });
    }
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
    return json(400, { error: error.code === "auth/email-already-exists" ? "Email tersebut sudah memiliki akun." : error.message });
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
  return json(200, { uid: user.uid, email });
};
