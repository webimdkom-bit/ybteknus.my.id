import { getTimeStatus, normalizeDeadline } from "./task-status.js";

export function buildTaskPayload({ profile, businessId, assigneeIds, fields, parentTaskId = null, rootTaskId = null, status = "assigned" }) {
  const assignedTo = [...new Set(assigneeIds)].filter(Boolean);
  const deadline = normalizeDeadline(fields.deadline);
  const checklistPhotoEnabled = fields.checklistPhotoEnabled === true || fields.checklistPhotoEnabled === "true" || fields.checklistPhotoEnabled === "on";
  const checklist = String(fields.checklist || "")
    .split("\n")
    .map((label, index) => ({
      id: `item-${index + 1}`,
      label: label.trim(),
      completed: false,
      evidenceFileId: null,
      evidenceUrl: null,
      evidenceAt: null,
    }))
    .filter((item) => item.label);

  return {
    organizationId: profile.organizationId,
    businessId,
    title: String(fields.title || "").trim(),
    description: String(fields.description || "").trim(),
    deadline,
    priority: fields.priority || "normal",
    category: fields.category || "Umum",
    instructions: String(fields.instructions || "").trim(),
    reportFormat: fields.reportFormat || "written",
    evidenceRequired: fields.evidenceRequired || "none",
    checklistPhotoEnabled,
    attachmentUrl: String(fields.attachmentUrl || "").trim(),
    assignedTo,
    assignedBy: profile.uid,
    createdBy: profile.uid,
    parentTaskId,
    rootTaskId,
    timeStatus: getTimeStatus({ deadline, status }),
    checklist,
    checklistByUser: Object.fromEntries(assignedTo.map((id) => [id, checklist.map((item) => ({ ...item, completed: false }))])),
    evidenceByUser: Object.fromEntries(assignedTo.map((id) => [id, { evidenceUrl: null, evidenceFileId: null, evidenceAt: null }])),
    progressByUser: Object.fromEntries(assignedTo.map((id) => [id, 0])),
  };
}
