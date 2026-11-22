import { auth } from "../../lib/firebase/firebase.js";
import {
  listTasksForBusiness,
  listTasksForOrganization,
  listTasksForUser,
} from "../../lib/firestore/repositories.js";

export const NOTIFICATION_TYPES = Object.freeze({
  registrationNew: "registration_new",
  registrationApproved: "registration_approved",
  registrationRejected: "registration_rejected",
  scheduleAssigned: "schedule_assigned",
  requestSubmitted: "request_submitted",
  requestApproved: "request_approved",
  requestRejected: "request_rejected",
  correctionRequested: "correction_requested",
  overtimeInfo: "overtime_info",
  taskCreated: "task_created",
  deadlineNear: "deadline_near",
  taskOverdue: "task_overdue",
  reportSubmitted: "report_submitted",
  revisionRequested: "revision_requested",
  reportApproved: "report_approved",
});

export async function notify(payload) {
  const user = auth.currentUser;
  if (!user) return null;
  const token = await user.getIdToken();
  const response = await fetch("/api/notify", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal mengirim notifikasi.");
  return data;
}

export function notifySafe(payload) {
  notify(payload).catch((error) => console.warn("[notify]", error?.message || error));
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysUntil(deadline) {
  const today = new Date(`${dateKey()}T00:00:00`);
  const target = new Date(`${deadline}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

export async function syncDeadlineNotifications(profile) {
  let tasks = [];
  try {
    tasks = profile.role === "employee"
      ? await listTasksForUser(profile.uid)
      : profile.role === "owner"
        ? await listTasksForOrganization(profile.organizationId)
        : (await Promise.all((profile.businessIds || []).map((businessId) => listTasksForBusiness(profile.organizationId, businessId)))).flat();
  } catch (error) {
    console.warn("[notify] deadline sync:", error?.message || error);
    return;
  }
  const today = dateKey();
  tasks.forEach((task) => {
    if (!task.deadline || ["approved", "cancelled"].includes(task.status)) return;
    const remaining = daysUntil(task.deadline);
    if (!(remaining === 1 || remaining < 0)) return;
    const type = remaining < 0 ? NOTIFICATION_TYPES.taskOverdue : NOTIFICATION_TYPES.deadlineNear;
    notifySafe({
      type,
      title: remaining < 0 ? "Tugas terlambat" : "Deadline mendekat",
      body: `${task.title} · deadline ${task.deadline}`,
      organizationId: task.organizationId,
      businessId: task.businessId,
      targetType: "task",
      targetId: task.id,
      userIds: profile.role === "employee" ? [profile.uid] : (task.assignedTo || []),
      id: `${type}_${task.id}_${today}`,
    });
  });
}
