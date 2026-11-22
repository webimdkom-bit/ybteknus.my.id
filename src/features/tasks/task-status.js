export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
