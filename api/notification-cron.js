import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { jakartaNow } from "../server/shared/time.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET belum dikonfigurasi." });
  if ((req.headers.authorization || "") !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized." });
  }

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
      const id = `${type}_${doc.id}_${today}_${userId}`;
      batch.set(db.collection("notifications").doc(id), {
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
