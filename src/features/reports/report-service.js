import {
  listAttendanceForOrganization,
  listBusinessesForOrganization,
  listEmployees,
  listEmployeesForBusiness,
  listSchedules,
  listShifts,
} from "../../lib/firestore/repositories.js";
import { getAttendanceStatus, toMinutes } from "../schedules/schedule-calculations.js";
import { getDateKey } from "../attendance/attendance-service.js";

async function safeList(callback, label) {
  try {
    return await callback();
  } catch (error) {
    console.warn(`[reports] ${label}:`, error?.message || error);
    return [];
  }
}

function eachDate(from, to) {
  const dates = [];
  const [year, month, day] = String(from).split("-").map(Number);
  const cursor = new Date(year, month - 1, day);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end && dates.length < 400) {
    dates.push(getDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function eventTime(event) {
  return event.recordedTime || event.clientRecordedAt?.slice(11, 16) || "";
}

function buildRow({ date, employee, business, schedule, shift, events }) {
  const checkIn = events.find((event) => event.type === "check-in");
  const checkOut = events.find((event) => event.type === "check-out");
  const inTime = eventTime(checkIn);
  const outTime = eventTime(checkOut);
  let status = checkOut?.attendanceStatus || checkIn?.attendanceStatus || "";
  if (!status && shift && inTime && outTime) {
    status = getAttendanceStatus({
      actualIn: toMinutes(inTime),
      actualOut: toMinutes(outTime),
      lateAfterToleranceMinutes: Math.max(0, toMinutes(inTime) - toMinutes(shift.startTime) - (Number(shift.toleranceMinutes) || 0)),
      earlyDepartureMinutes: Math.max(0, toMinutes(shift.endTime) - toMinutes(outTime)),
      end: toMinutes(shift.endTime),
    });
  }
  if (!status) status = inTime ? "belum lengkap" : "alpa";
  return {
    date,
    employeeId: employee.id,
    employee: employee.displayName || employee.email || "-",
    businessId: business?.id || "",
    business: business?.name || "-",
    shift: shift?.name || "-",
    checkIn: inTime || "-",
    checkOut: outTime || "-",
    status,
    lateMinutes: Number(checkOut?.lateMinutes || checkIn?.lateMinutes || 0),
    earlyMinutes: Number(checkOut?.earlyDepartureMinutes || 0),
    locationStatus: checkIn?.locationStatus || "-",
  };
}

export async function buildAttendanceReport({ profile, from, to, businessId, userId }) {
  const organizationId = profile.organizationId;
  const businesses = await safeList(() => listBusinessesForOrganization(organizationId), "businesses");
  const businessMap = new Map(businesses.map((business) => [business.id, business]));
  const isOwner = profile.role === "owner";
  const scopes = isOwner
    ? (businessId ? [businessId] : businesses.filter((business) => business.status !== "inactive").map((business) => business.id))
    : (businessId && (profile.businessIds || []).includes(businessId) ? [businessId] : (profile.businessIds || []));

  const [employeeGroups, attendanceGroups, scheduleGroups, shiftGroups] = await Promise.all([
    Promise.all(scopes.map((scope) => safeList(
      () => isOwner && !businessId && !userId ? listEmployees(organizationId) : listEmployeesForBusiness(organizationId, scope),
      `employees ${scope}`,
    ))),
    Promise.all(scopes.map((scope) => safeList(() => listAttendanceForOrganization(organizationId, { businessId: scope, from, to }), `attendance ${scope}`))),
    Promise.all(scopes.map((scope) => safeList(() => listSchedules({ organizationId, businessId: scope, from, to }), `schedules ${scope}`))),
    Promise.all(scopes.map((scope) => safeList(() => listShifts(organizationId, scope), `shifts ${scope}`))),
  ]);

  const employees = [...new Map(employeeGroups.flat().map((employee) => [employee.id, employee])).values()];
  const attendance = attendanceGroups.flat();
  const schedules = scheduleGroups.flat();
  const shifts = new Map(shiftGroups.flat().map((shift) => [shift.id, shift]));
  const filteredEmployees = userId ? employees.filter((employee) => employee.id === userId) : employees;
  const dates = eachDate(from, to);

  const rows = [];
  filteredEmployees.forEach((employee) => {
    dates.forEach((date) => {
      const schedule = schedules.find((item) => item.date === date && item.userId === employee.id && item.status !== "cancelled");
      const scope = schedule?.businessId || employee.businessIds?.[0] || "";
      if (businessId && scope !== businessId) return;
      const business = businessMap.get(scope) || { id: scope, name: "-" };
      const events = attendance.filter((event) => event.attendanceDate === date && event.userId === employee.id && event.businessId === scope);
      if (!schedule && !events.length) return;
      rows.push(buildRow({ date, employee, business, shift: shifts.get(schedule?.shiftId), events }));
    });
  });
  rows.sort((a, b) => `${b.date}${b.employee}`.localeCompare(`${a.date}${a.employee}`));

  const summary = {
    total: rows.length,
    hadir: rows.filter((row) => ["hadir", "tercatat"].includes(row.status)).length,
    terlambat: rows.filter((row) => row.status.toLowerCase().includes("terlambat")).length,
    alpa: rows.filter((row) => row.status === "alpa").length,
    belumLengkap: rows.filter((row) => row.status === "belum lengkap").length,
    employees: filteredEmployees.length,
  };

  return { rows, summary, businesses, employees: filteredEmployees, from, to };
}
