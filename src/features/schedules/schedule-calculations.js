import { getJakartaMinutes } from "../../lib/utils/time.js";

export function calculateAttendanceTiming({ scheduledStart, scheduledEnd, toleranceMinutes = 0, checkIn, checkOut, now }) {
  const start = toMinutes(scheduledStart);
  const end = toMinutes(scheduledEnd);
  const actualIn = checkIn == null ? null : toMinutes(checkIn);
  const actualOut = checkOut == null ? null : toMinutes(checkOut);
  const tolerance = Number(toleranceMinutes) || 0;
  const actualLateMinutes = actualIn == null ? null : Math.max(0, actualIn - start);
  const lateAfterToleranceMinutes = actualIn == null ? null : Math.max(0, actualIn - start - tolerance);
  const earlyDepartureMinutes = actualOut == null ? null : Math.max(0, end - actualOut);

  return {
    actualLateMinutes,
    lateAfterToleranceMinutes,
    earlyDepartureMinutes,
    status: getAttendanceStatus({ actualIn, actualOut, lateAfterToleranceMinutes, earlyDepartureMinutes, end, now }),
  };
}

export function getAttendanceStatus({ actualIn, actualOut, lateAfterToleranceMinutes, earlyDepartureMinutes, end, now }) {
  const current = now instanceof Date ? getJakartaMinutes(now) : Number.isFinite(now) ? now : currentMinutes();
  if (actualIn == null) return current > end ? "alpa" : "belum lengkap";
  if (actualOut == null) return "belum lengkap";
  if (lateAfterToleranceMinutes > 0 && earlyDepartureMinutes > 0) return "terlambat dan pulang lebih awal";
  if (lateAfterToleranceMinutes > 0) return "terlambat";
  if (earlyDepartureMinutes > 0) return "pulang lebih awal";
  return "hadir";
}

export function dateSpanDays(from, to) {
  const start = new Date(`${String(from ?? "").slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(to ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;
  return Math.round((end - start) / 86400000) + 1;
}

export function weekdayKey(date) {
  const value = new Date(`${String(date ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return "";
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][value.getUTCDay()];
}

export function eachScheduleDate({ from, to, weekdays = [], maxDays = 31 }) {
  const span = dateSpanDays(from, to);
  if (span == null || span > maxDays) return [];
  const start = new Date(`${String(from ?? "").slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(to ?? "").slice(0, 10)}T00:00:00Z`);
  const allowed = new Set(weekdays.filter((day) => typeof day === "string"));
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < maxDays) {
    const key = cursor.toISOString().slice(0, 10);
    if (!allowed.size || allowed.has(weekdayKey(key))) dates.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function groupEmployeeSchedules({ schedules = [], from = "" } = {}) {
  const visible = (schedules || [])
    .filter((schedule) => schedule && schedule.status !== "cancelled" && (!from || String(schedule.date || "") >= from) && isScheduleEffective(schedule, schedule.date))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const months = new Map();
  visible.forEach((schedule) => {
    const key = String(schedule.date || "").slice(0, 7);
    if (!key) return;
    if (!months.has(key)) months.set(key, { key, schedules: [] });
    months.get(key).schedules.push(schedule);
  });
  return {
    total: visible.length,
    months: [...months.values()].map((month) => ({
      key: month.key,
      label: new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month.key}-01T00:00:00Z`)),
      count: month.schedules.length,
      schedules: month.schedules,
    })),
  };
}

export function isScheduleEffective(schedule, date) {
  if (!schedule || schedule.status === "cancelled") return false;
  if (!date || !schedule.date || schedule.date !== date) return false;
  return !schedule.effectiveFrom || String(schedule.effectiveFrom) <= String(date);
}

function scheduleTimestamp(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function pickActiveSchedule(schedules, { businessId, date }) {
  return schedules
    .filter((schedule) => isScheduleEffective(schedule, date) && (!businessId || schedule.businessId === businessId))
    .sort((a, b) => scheduleTimestamp(b.createdAt) - scheduleTimestamp(a.createdAt) || String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || "")))[0] || null;
}

export function toMinutes(value) {
  if (typeof value === "number") return value;
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) throw new Error("Waktu harus menggunakan format HH:mm.");
  return hours * 60 + minutes;
}

function currentMinutes() {
  return getJakartaMinutes();
}
