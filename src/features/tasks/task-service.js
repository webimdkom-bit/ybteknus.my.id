import { createTask } from "../../lib/firestore/repositories.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";
import { buildTaskPayload } from "./task-payload.js";

export async function createTaskForAssignees({ profile, businessId, assigneeIds, fields }) {
  const payload = buildTaskPayload({ profile, businessId, assigneeIds, fields });
  const task = await createTask(payload);
  logAuditSafe({
    profile,
    action: "task_created",
    targetType: "task",
    targetId: task?.id || null,
    businessId,
    metadata: { title: payload.title, assignedTo: payload.assignedTo, priority: payload.priority, category: payload.category },
  });
  notifySafe({
    id: `task_created_${task?.id || Date.now()}`,
    type: NOTIFICATION_TYPES.taskCreated,
    title: "Tugas baru",
    body: payload.title,
    organizationId: profile.organizationId,
    businessId,
    targetType: "task",
    targetId: task?.id || null,
    userIds: payload.assignedTo,
  });
  return task;
}

export { buildTaskPayload };
