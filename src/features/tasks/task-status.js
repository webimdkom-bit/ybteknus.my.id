import { getDateKey } from "../../lib/utils/time.js";

export function toDateKey(date = new Date()) {
  return getDateKey(date);
}

export function getTimeStatus({ deadline, submittedAt, status, now = new Date() }) {
  if (!deadline) return "pending";
  const today = toDateKey(now);
  if (!["submitted", "approved"].includes(status)) {
    return deadline < today ? "overdue" : "pending";
  }
  const submitted = submittedAt ? String(submittedAt).slice(0, 10) : today;
  return submitted <= deadline ? "on-time" : "late";
}
