import { formatInAppZone, getDateKey } from "../../lib/utils/time.js";

export function toDateKey(date = new Date()) {
  return getDateKey(date);
}

export function normalizeDeadline(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T17:00:00+07:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return `${text}:00+07:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text)) return text;
  return text;
}

export function getDeadlineDate(value) {
  return normalizeDeadline(value).slice(0, 10);
}

export function getDeadlineMillis(value) {
  const normalized = normalizeDeadline(value);
  if (!normalized) return NaN;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? NaN : parsed;
}

export function toDateTimeLocalValue(value) {
  const normalized = normalizeDeadline(value);
  if (!normalized) return "";
  const date = getDeadlineDate(normalized);
  const time = formatInAppZone(normalized, { hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }).replace(".", ":");
  return `${date}T${time}`;
}

export function formatTaskDeadline(value) {
  const normalized = normalizeDeadline(value);
  if (!normalized) return "-";
  return formatInAppZone(normalized, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }).replace(".", ":");
}

export function isTaskOverdue(task, now = new Date()) {
  if (!task?.deadline || ["approved", "cancelled"].includes(task.status)) return false;
  const deadline = getDeadlineMillis(task.deadline);
  return Number.isFinite(deadline) && now.getTime() > deadline;
}

export function getTimeStatus({ deadline, submittedAt, status, now = new Date() }) {
  if (!deadline) return "pending";
  const deadlineMs = getDeadlineMillis(deadline);
  if (!Number.isFinite(deadlineMs)) return "pending";
  if (!["submitted", "approved"].includes(status)) {
    return now.getTime() > deadlineMs ? "overdue" : "pending";
  }
  const submittedMs = submittedAt ? Date.parse(submittedAt) : now.getTime();
  return Number.isFinite(submittedMs) && submittedMs <= deadlineMs ? "on-time" : "late";
}
