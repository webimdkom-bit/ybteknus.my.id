import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./_shared/admin";
import { verifyFirebaseToken } from "./_shared/auth";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  const decoded = await verifyFirebaseToken(event.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) {
    return { statusCode: 401, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Unauthorized." }) };
  }

  const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
  const action = String(body.action || "").trim();
  const targetType = String(body.targetType || "").trim();
  const targetId = String(body.targetId || "").trim();
  if (!action || !targetType) {
    return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "action dan targetType wajib diisi." }) };
  }

  const db = getFirestore(getAdminApp());
  const actorSnapshot = await db.collection("users").doc(uid).get();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Profil pengguna tidak ditemukan." }) };
  }

  const organizationId = String(body.organizationId || actor.organizationId || "").trim();
  const businessId = body.businessId ? String(body.businessId).trim() : null;
  const role = actor.role;
  if (!["owner", "admin", "employee"].includes(role)) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Tidak memiliki izin audit." }) };
  }
  if (actor.organizationId !== organizationId) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Organisasi tidak sesuai." }) };
  }
  if (role !== "owner" && businessId && !(actor.businessIds || []).includes(businessId)) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Bisnis di luar jangkauan." }) };
  }

  const record = {
    actorId: uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: role,
    organizationId,
    businessId: businessId || null,
    action,
    targetType,
    targetId: targetId || null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    timestamp: new Date().toISOString(),
  };
  const reference = await db.collection("auditLogs").add(record);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: reference.id, ...record }),
  };
};
