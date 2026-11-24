import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

async function runDeadlineNotifications(res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET belum dikonfigurasi." });
  const nowIso = jakartaNow();
  const today = nowIso.slice(0, 10);
  const todayMs = new Date(`${today}T00:00:00+07:00`).getTime();
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection("tasks").limit(500).get();
  const batch = db.batch();
  let created = 0;
  snapshot.docs.forEach((doc) => {
    const task = doc.data();
    if (!task.deadline || ["approved", "cancelled"].includes(task.status)) return;
    const deadlineMs = new Date(`${task.deadline}T00:00:00+07:00`).getTime();
    if (Number.isNaN(deadlineMs)) return;
    const remaining = Math.round((deadlineMs - todayMs) / 86400000);
    if (!(remaining === 1 || remaining < 0)) return;
    const type = remaining < 0 ? "task_overdue" : "deadline_near";
    (task.assignedTo || []).forEach((userId) => {
      batch.set(db.collection("notifications").doc(`${type}_${doc.id}_${today}_${userId}`), {
        userId,
        organizationId: task.organizationId,
        businessId: task.businessId || null,
        type,
        title: remaining < 0 ? "Tugas terlambat" : "Deadline mendekat",
        body: `${task.title} · deadline ${task.deadline}`,
        targetType: "task",
        targetId: doc.id,
        actorId: "system",
        actorName: "Sistem",
        read: false,
        createdAt: nowIso,
      });
      created += 1;
    });
  });
  if (created) await batch.commit();
  return res.status(200).json({ created, date: today });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const secret = process.env.CRON_SECRET;
    if (!secret || (req.headers.authorization || "") !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    return runDeadlineNotifications(res);
  }
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const type = String(body.type || "").trim();
  const title = String(body.title || "").trim().slice(0, 120);
  const message = String(body.body || "").trim().slice(0, 500);
  if (!type || !title) return sendJson(res, 400, { error: "type dan title wajib diisi." });

  const db = getFirestore(getAdminApp());
  const actor = await assertActiveActor(uid);
  if (!actor) return sendJson(res, 403, { error: "Akun tidak aktif." });

  const organizationId = String(body.organizationId || actor.organizationId || "").trim();
  if (actor.organizationId !== organizationId) return sendJson(res, 403, { error: "Organisasi tidak sesuai." });
  const businessId = body.businessId ? String(body.businessId).trim() : null;
  if (actor.role !== "owner" && actor.role !== "admin") {
    if (businessId && !(actor.businessIds || []).includes(businessId)) return sendJson(res, 403, { error: "Bisnis di luar jangkauan." });
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
  if (!recipients.length) return sendJson(res, 200, { created: 0 });

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
  return sendJson(res, 200, { created: created.length, ids: created });
}
