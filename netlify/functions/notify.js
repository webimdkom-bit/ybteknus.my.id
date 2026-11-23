import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./_shared/admin";
import { verifyFirebaseToken } from "./_shared/auth";
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
  const type = String(body.type || "").trim();
  const title = String(body.title || "").trim().slice(0, 120);
  const message = String(body.body || "").trim().slice(0, 500);
  if (!type || !title) return json(400, { error: "type dan title wajib diisi." });

  const db = getFirestore(getAdminApp());
  const actorSnapshot = await db.collection("users").doc(uid).get();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor) return json(403, { error: "Profil pengguna tidak ditemukan." });

  const organizationId = String(body.organizationId || actor.organizationId || "").trim();
  if (actor.organizationId !== organizationId) return json(403, { error: "Organisasi tidak sesuai." });
  const businessId = body.businessId ? String(body.businessId).trim() : null;
  if (actor.role !== "owner" && actor.role !== "admin") {
    if (businessId && !(actor.businessIds || []).includes(businessId)) return json(403, { error: "Bisnis di luar jangkauan." });
  }

  let recipients = [];
  const explicit = Array.isArray(body.userIds) ? body.userIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()) : [];
  if (explicit.length) {
    const snapshots = await Promise.all(explicit.map((id) => db.collection("users").doc(id).get()));
    recipients = snapshots.filter((snapshot) => {
      if (!snapshot.exists) return false;
      const target = snapshot.data();
      if (target.organizationId !== organizationId) return false;
      if (actor.role === "owner") return true;
      const actorBusinesses = actor.businessIds || [];
      const targetBusinesses = target.businessIds || [];
      return businessId
        ? actorBusinesses.includes(businessId) && targetBusinesses.includes(businessId)
        : actorBusinesses.some((id) => targetBusinesses.includes(id));
    }).map((snapshot) => snapshot.id);
  } else if (body.audience === "owner" || body.audience === "admins" || body.audience === "employees") {
    const users = await db.collection("users").where("organizationId", "==", organizationId).get();
    const candidates = users.docs.filter((doc) => {
      const user = doc.data();
      if (body.audience === "owner") return user.role === "owner" && user.status === "active";
      if (body.audience === "admins") return user.role === "admin" && user.status === "active" && (!businessId || (user.businessIds || []).includes(businessId));
      return user.role === "employee" && (!businessId || (user.businessIds || []).includes(businessId));
    });
    if (body.audience === "admins" && body.permission && businessId) {
      const allowed = [];
      for (const doc of candidates) {
        const membership = await db.collection("memberships").doc(`${doc.id}_${businessId}`).get();
        if (membership.exists && (membership.data().permissions || []).includes(body.permission)) allowed.push(doc.id);
      }
      recipients = allowed;
    } else {
      recipients = candidates.map((doc) => doc.id);
    }
  }
  recipients = [...new Set(recipients)].filter((id) => id && (explicit.length ? true : id !== uid));
  if (!recipients.length) return json(200, { created: 0 });

  const docId = body.id ? String(body.id).trim() : null;
  const created = [];
  for (const userId of recipients) {
    const id = docId ? `${docId}_${userId}` : undefined;
    const reference = id ? db.collection("notifications").doc(id) : db.collection("notifications").doc();
    if (id && (await reference.get()).exists) continue;
    await reference.set({
      userId,
      organizationId,
      businessId: businessId || null,
      type,
      title,
      body: message,
      targetType: body.targetType || null,
      targetId: body.targetId || null,
      actorId: uid,
      actorName: actor.displayName || actor.email || "",
      read: false,
      createdAt: jakartaNow(),
    });
    created.push(reference.id);
  }
  return json(200, { created: created.length, ids: created });
};
