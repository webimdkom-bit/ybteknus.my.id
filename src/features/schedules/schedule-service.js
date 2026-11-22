import {
  createSchedule,
  createShift,
  listSchedules,
  listShifts,
} from "../../lib/firestore/repositories.js";
import { calculateAttendanceTiming, getAttendanceStatus, toMinutes } from "./schedule-calculations.js";

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

export async function assignShift({ organizationId, businessId, userId, shiftId, date, effectiveFrom, assignedBy }) {
  if (!organizationId || !businessId || !userId || !shiftId || !date) {
    throw new Error("Business, employee, shift, dan tanggal wajib diisi.");
  }
  return createSchedule({ organizationId, businessId, userId, shiftId, date, effectiveFrom: effectiveFrom || date, assignedBy });
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
