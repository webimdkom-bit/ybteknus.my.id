import {
  createSchedulesBatch,
  createShift,
  getShift,
  listEmployeesForBusiness,
  listSchedules,
  listShifts,
} from "../../lib/firestore/repositories.js";
import { calculateAttendanceTiming, getAttendanceStatus, isScheduleEffective, toMinutes } from "./schedule-calculations.js";

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom))) {
    throw new Error("Format tanggal harus YYYY-MM-DD.");
  }

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

export async function assignShift({ organizationId, businessId, userId, shiftId, date, effectiveFrom, assignedBy }) {
  const result = await assignShiftBulk({ organizationId, businessId, userIds: [userId], shiftId, date, effectiveFrom, assignedBy });
  if (!result.created.length) {
    const reason = result.skipped[0]?.reason || "Jadwal sudah dibuat sebelumnya.";
    throw new Error(reason);
  }
  return result.created[0];
}

export { calculateAttendanceTiming, getAttendanceStatus, listSchedules, listShifts };

function validateShift({ name, startTime, endTime, breakMinutes, toleranceMinutes, workDays }) {
  if (!name?.trim() || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    throw new Error("Nama shift, jam masuk, dan jam pulang wajib diisi dengan format yang benar.");
  }
  if (toMinutes(startTime) >= toMinutes(endTime)) throw new Error("Jam pulang harus setelah jam masuk.");
  if (Number(breakMinutes) < 0 || Number(toleranceMinutes) < 0) throw new Error("Istirahat dan toleransi tidak boleh negatif.");
  if (!workDays.length || workDays.some((day) => !WEEKDAYS.includes(day))) throw new Error("Hari kerja tidak valid.");
}
