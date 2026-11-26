import {
  createSchedulesBatch,
  createShift,
  deleteSchedule,
  deleteShift,
  getSchedule,
  getShift,
  listEmployeesForBusiness,
  listSchedules,
  listShifts,
  updateSchedule,
  updateShift,
} from "../../lib/firestore/repositories.js";
import { calculateAttendanceTiming, dateSpanDays, eachScheduleDate, getAttendanceStatus, isScheduleEffective, toMinutes } from "./schedule-calculations.js";

export const WEEKDAYS = Object.freeze([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export async function addShift({ organizationId, businessId, name, startTime, endTime, breakMinutes = 0, toleranceMinutes = 0, workDays = WEEKDAYS.slice(0, 5) }) {
  validateShift({ name, startTime, endTime, breakMinutes, toleranceMinutes, workDays });
  return createShift({
    organizationId,
    businessId,
    name: name.trim(),
    startTime,
    endTime,
    breakMinutes: Number(breakMinutes),
    toleranceMinutes: Number(toleranceMinutes),
    workDays,
  });
}

export async function assignShiftBulk({ organizationId, businessId, userIds, shiftId, date, effectiveFrom, assignedBy }) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (!organizationId || !businessId || !uniqueIds.length || !shiftId || !date) {
    throw new Error("Bisnis, karyawan, shift, dan tanggal wajib diisi.");
  }
  if (uniqueIds.length > 100) throw new Error("Maksimal 100 karyawan per penetapan jadwal.");
  if (!isValidDateKey(date) || (effectiveFrom && !isValidDateKey(effectiveFrom))) {
    throw new Error("Format tanggal harus YYYY-MM-DD.");
  }
  if (effectiveFrom && effectiveFrom > date) throw new Error("Tanggal efektif tidak boleh setelah tanggal jadwal.");

  const shift = await getShift(shiftId);
  if (!shift || shift.status === "inactive" || shift.organizationId !== organizationId || shift.businessId !== businessId) {
    throw new Error("Shift tidak valid untuk bisnis ini.");
  }

  const employees = await listEmployeesForBusiness(organizationId, businessId);
  const validIds = new Set(employees.map((employee) => employee.id));
  const skipped = uniqueIds.filter((userId) => !validIds.has(userId)).map((userId) => ({ userId, reason: "Karyawan tidak aktif di bisnis ini." }));
  const candidateIds = uniqueIds.filter((userId) => validIds.has(userId));

  if (candidateIds.length) {
    const existing = await listSchedules({ organizationId, businessId, from: date, to: date });
    const conflictIds = new Set(existing.filter((schedule) => isScheduleEffective(schedule, date) && candidateIds.includes(schedule.userId)).map((schedule) => schedule.userId));
    conflictIds.forEach((userId) => skipped.push({ userId, reason: "Sudah memiliki jadwal aktif pada tanggal ini." }));
  }

  const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const finalCandidateIds = candidateIds.filter((userId) => !skipped.some((item) => item.userId === userId));
  const result = await createSchedulesBatch(finalCandidateIds.map((userId) => ({
    organizationId,
    businessId,
    userId,
    shiftId,
    date,
    effectiveFrom: effectiveFrom || date,
    assignedBy,
    batchId,
  })));
  skipped.push(...result.skipped.map((userId) => ({ userId, reason: "Jadwal sudah dibuat sebelumnya." })));
  return { created: result.created, skipped, batchId, shift };
}

export async function assignShiftRange({
  organizationId,
  businessId,
  userIds,
  shiftId,
  from,
  to,
  weekdays = [],
  effectiveFrom,
  assignedBy,
  onProgress,
}) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (!organizationId || !businessId || !uniqueIds.length || !shiftId || !from || !to) {
    throw new Error("Bisnis, karyawan, shift, tanggal mulai, dan tanggal selesai wajib diisi.");
  }
  if (uniqueIds.length > 100) throw new Error("Maksimal 100 karyawan per penetapan jadwal.");
  if (!isValidDateKey(from) || !isValidDateKey(to)) throw new Error("Format tanggal harus YYYY-MM-DD.");
  if (from > to) throw new Error("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  if (effectiveFrom && !isValidDateKey(effectiveFrom)) throw new Error("Format tanggal efektif harus YYYY-MM-DD.");
  if (effectiveFrom && effectiveFrom > from) throw new Error("Tanggal efektif tidak boleh setelah tanggal mulai.");
  const span = dateSpanDays(from, to);
  if (span == null || span > 31) throw new Error("Rentang maksimal 31 hari kalender.");
  if (!weekdays.length) throw new Error("Pilih minimal satu hari kerja.");
  const dates = eachScheduleDate({ from, to, weekdays, maxDays: 31 });
  if (!dates.length) throw new Error("Tidak ada tanggal yang cocok dengan hari yang dipilih.");
  if (dates.length * uniqueIds.length > 400) throw new Error("Rentang ini menghasilkan terlalu banyak jadwal. Persempit tanggal atau karyawan.");
  if (typeof onProgress === "function") onProgress(0, dates.length, 0);

  const shift = await getShift(shiftId);
  if (!shift || shift.status === "inactive" || shift.organizationId !== organizationId || shift.businessId !== businessId) {
    throw new Error("Shift tidak valid untuk bisnis ini.");
  }

  const employees = await listEmployeesForBusiness(organizationId, businessId);
  const validIds = new Set(employees.map((employee) => employee.id));
  const skipped = uniqueIds.filter((userId) => !validIds.has(userId)).map((userId) => ({ userId, date: from, reason: "Karyawan tidak aktif di bisnis ini." }));
  const candidateIds = uniqueIds.filter((userId) => validIds.has(userId));
  const existing = candidateIds.length ? await listSchedules({ organizationId, businessId, from, to }) : [];
  const existingKeys = new Set(existing.filter((schedule) => schedule.status !== "cancelled").map((schedule) => `${schedule.userId}_${schedule.date}`));

  const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const items = [];
  candidateIds.forEach((userId) => {
    dates.forEach((date) => {
      if (existingKeys.has(`${userId}_${date}`)) {
        skipped.push({ userId, date, reason: "Sudah memiliki jadwal aktif pada tanggal ini." });
        return;
      }
      items.push({
        organizationId,
        businessId,
        userId,
        shiftId,
        date,
        effectiveFrom: effectiveFrom || from,
        assignedBy,
        batchId,
      });
    });
  });

  const result = await createSchedulesBatch(items);
  const createdIds = new Set(result.created.map((item) => item.id));
  result.skipped.forEach((userId) => {
    const item = items.find((candidate) => candidate.userId === userId && !createdIds.has(scheduleKeyForItem(candidate)));
    skipped.push({ userId, date: item?.date || from, reason: "Jadwal sudah dibuat sebelumnya." });
  });
  if (typeof onProgress === "function") onProgress(dates.length, dates.length, result.created.length);
  return { created: result.created, skipped, dates, batchId, shift };
}

export async function assignShift({ organizationId, businessId, userId, shiftId, date, effectiveFrom, assignedBy }) {
  const result = await assignShiftBulk({ organizationId, businessId, userIds: [userId], shiftId, date, effectiveFrom, assignedBy });
  if (!result.created.length) {
    const reason = result.skipped[0]?.reason || "Jadwal sudah dibuat sebelumnya.";
    throw new Error(reason);
  }
  return result.created[0];
}

export async function updateShiftAssignment({ organizationId, businessId, shiftId, fields }) {
  const shift = await getShift(shiftId);
  if (!shift || shift.organizationId !== organizationId || shift.businessId !== businessId) throw new Error("Shift tidak ditemukan.");
  const next = {
    name: fields.name ?? shift.name,
    startTime: fields.startTime ?? shift.startTime,
    endTime: fields.endTime ?? shift.endTime,
    breakMinutes: fields.breakMinutes ?? shift.breakMinutes ?? 0,
    toleranceMinutes: fields.toleranceMinutes ?? shift.toleranceMinutes ?? 0,
    workDays: fields.workDays ?? shift.workDays ?? WEEKDAYS.slice(0, 5),
  };
  validateShift(next);
  return updateShift(shiftId, next);
}

export async function deleteShiftAssignment({ organizationId, businessId, shiftId }) {
  const shift = await getShift(shiftId);
  if (!shift || shift.organizationId !== organizationId || shift.businessId !== businessId) throw new Error("Shift tidak ditemukan.");
  const schedules = await listSchedules({ organizationId, businessId });
  if (schedules.some((schedule) => schedule.shiftId === shiftId && schedule.status !== "cancelled")) {
    throw new Error("Shift masih dipakai jadwal aktif. Batalkan atau hapus jadwal tersebut terlebih dahulu.");
  }
  await deleteShift(shiftId);
}

export async function updateScheduleAssignment({ organizationId, businessId, scheduleId, fields }) {
  const schedule = await getSchedule(scheduleId);
  if (!schedule || schedule.organizationId !== organizationId || schedule.businessId !== businessId) throw new Error("Jadwal tidak ditemukan.");
  const date = fields.date ?? schedule.date;
  const effectiveFrom = fields.effectiveFrom ?? schedule.effectiveFrom ?? date;
  const shiftId = fields.shiftId ?? schedule.shiftId;
  const status = fields.status ?? schedule.status ?? "active";
  if (!isValidDateKey(date) || !isValidDateKey(effectiveFrom)) throw new Error("Format tanggal harus YYYY-MM-DD.");
  if (effectiveFrom > date) throw new Error("Tanggal efektif tidak boleh setelah tanggal jadwal.");
  if (!["active", "cancelled"].includes(status)) throw new Error("Status jadwal tidak valid.");
  const shift = await getShift(shiftId);
  if (!shift || shift.status === "inactive" || shift.organizationId !== organizationId || shift.businessId !== businessId) throw new Error("Shift tidak valid untuk bisnis ini.");
  if (date !== schedule.date) {
    const existing = await listSchedules({ organizationId, businessId, from: date, to: date });
    if (existing.some((item) => item.userId === schedule.userId && item.id !== scheduleId && item.status !== "cancelled")) {
      throw new Error("Karyawan sudah memiliki jadwal aktif pada tanggal ini.");
    }
  }
  return updateSchedule(scheduleId, { date, effectiveFrom, shiftId, status });
}

export async function deleteScheduleAssignment({ organizationId, businessId, scheduleId }) {
  const schedule = await getSchedule(scheduleId);
  if (!schedule || schedule.organizationId !== organizationId || schedule.businessId !== businessId) throw new Error("Jadwal tidak ditemukan.");
  await deleteSchedule(scheduleId);
}

export function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export { calculateAttendanceTiming, getAttendanceStatus, listSchedules, listShifts };

function scheduleKeyForItem(item) {
  return [item.organizationId, item.businessId, item.userId, item.date].map((value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "_")).join("_");
}

function validateShift({ name, startTime, endTime, breakMinutes, toleranceMinutes, workDays }) {
  if (!name?.trim() || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    throw new Error("Nama shift, jam masuk, dan jam pulang wajib diisi dengan format yang benar.");
  }
  if (toMinutes(startTime) >= toMinutes(endTime)) throw new Error("Jam pulang harus setelah jam masuk.");
  if (Number(breakMinutes) < 0 || Number(toleranceMinutes) < 0) throw new Error("Istirahat dan toleransi tidak boleh negatif.");
  if (!workDays.length || workDays.some((day) => !WEEKDAYS.includes(day))) throw new Error("Hari kerja tidak valid.");
}
