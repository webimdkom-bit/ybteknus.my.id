import {
  listAttendanceForOrganization,
  listBusinessesForOrganization,
  listEmployees,
  listEmployeesForBusiness,
  listOperationalRequestsForBusiness,
  listOvertimeForBusiness,
  listSchedules,
  listShifts,
} from "../../lib/firestore/repositories.js";
import { getAttendanceStatus, pickActiveSchedule, toMinutes } from "../schedules/schedule-calculations.js";
import { getDateKey } from "../attendance/attendance-service.js";
import { calculateWorkedDay, hoursLabel, hoursValue, summarizeRows } from "../attendance/worked-hours.js";

async function safeList(callback, label, errors) {
  try {
    return await callback();
  } catch (error) {
    const message = error?.message || String(error);
    errors.push(`${label}: ${message}`);
    console.warn(`[reports] ${label}:`, message);
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

function inRange(date, from, to) {
  return Boolean(date) && (!from || date >= from) && (!to || date <= to);
}

function buildRow({ date, employee, business, shift, events, overtime = [], leaveRequest = null }) {
  const checkIn = events.find((event) => event.type === "check-in");
  const checkOut = events.find((event) => event.type === "check-out");
  const inTime = eventTime(checkIn);
  const outTime = eventTime(checkOut);
  const worked = calculateWorkedDay({ checkIn: inTime, checkOut: outTime, approvedOvertime: overtime });
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
  if (!status && leaveRequest) status = leaveRequest.type === "leave" ? "cuti" : "izin";
  if (!status) status = inTime ? "belum lengkap" : "alpa";
  const offSchedule = checkOut?.scheduleStatus === "unscheduled" || checkIn?.scheduleStatus === "unscheduled";
  if (offSchedule) {
    const review = checkOut?.reviewStatus || checkIn?.reviewStatus || "pending";
    const detail = !checkOut ? "belum lengkap" : review === "approved" ? "disetujui" : review === "rejected" ? "ditolak" : "menunggu konfirmasi";
    status = `di luar jadwal · ${detail}`;
  }
  const rejected = offSchedule && (checkOut?.reviewStatus === "rejected" || checkIn?.reviewStatus === "rejected");
  const payableMinutes = rejected ? 0 : worked.payableMinutes;
  const overtimeApprovedMinutes = rejected ? 0 : worked.overtimeApprovedMinutes;
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
    locationStatus: checkIn?.locationStatus || checkOut?.locationStatus || "-",
    hasCompletePunch: worked.hasCompletePunch,
    crossesMidnight: worked.crossesMidnight,
    offsite: checkIn?.locationStatus === "offsite-approved" || checkOut?.locationStatus === "offsite-approved",
    corrected: Boolean(checkIn?.corrected || checkOut?.corrected),
    absoluteMinutes: worked.absoluteMinutes,
    overtimeApprovedMinutes,
    payableMinutes,
    workedHours: hoursLabel(payableMinutes),
  };
}

export async function buildAttendanceReport({ profile, from, to, businessId, userId, userIds = [] }) {
  const organizationId = profile.organizationId;
  const errors = [];
  const businesses = await safeList(() => listBusinessesForOrganization(organizationId), "businesses", errors);
  const businessMap = new Map(businesses.map((business) => [business.id, business]));
  const isOwner = profile.role === "owner";
  const selectedIds = [...new Set([...(Array.isArray(userIds) ? userIds : []), userId].filter(Boolean))];
  const scopes = isOwner
    ? (businessId ? [businessId] : businesses.filter((business) => business.status !== "inactive").map((business) => business.id))
    : (businessId && (profile.businessIds || []).includes(businessId) ? [businessId] : (profile.businessIds || []));

  const [employeeGroups, attendanceGroups, scheduleGroups, shiftGroups, overtimeGroups, requestGroups] = await Promise.all([
    Promise.all(scopes.map((scope) => safeList(
      () => isOwner && !businessId && !selectedIds.length ? listEmployees(organizationId) : listEmployeesForBusiness(organizationId, scope),
      `employees ${scope}`,
      errors,
    ))),
    Promise.all(scopes.map((scope) => safeList(() => listAttendanceForOrganization(organizationId, { businessId: scope, from, to }), `attendance ${scope}`, errors))),
    Promise.all(scopes.map((scope) => safeList(() => listSchedules({ organizationId, businessId: scope, from, to }), `schedules ${scope}`, errors))),
    Promise.all(scopes.map((scope) => safeList(() => listShifts(organizationId, scope), `shifts ${scope}`, errors))),
    Promise.all(scopes.map((scope) => safeList(() => listOvertimeForBusiness(organizationId, scope), `overtime ${scope}`, errors))),
    Promise.all(scopes.map((scope) => safeList(() => listOperationalRequestsForBusiness(organizationId, scope), `requests ${scope}`, errors))),
  ]);

  const employees = [...new Map(employeeGroups.flat().map((employee) => [employee.id, employee])).values()];
  const attendance = attendanceGroups.flat();
  const schedules = scheduleGroups.flat();
  const shifts = new Map(shiftGroups.flat().map((shift) => [shift.id, shift]));
  const approvedOvertime = overtimeGroups.flat().filter((item) => item.status === "approved" && inRange(item.date, from, to));
  const approvedLeave = requestGroups.flat().filter((item) => item.status === "approved" && ["leave", "permission"].includes(item.type));
  const filteredEmployees = selectedIds.length ? employees.filter((employee) => selectedIds.includes(employee.id)) : employees;
  const dates = eachDate(from, to);

  const rows = [];
  filteredEmployees.forEach((employee) => {
    const employeeSchedules = schedules.filter((item) => item.userId === employee.id);
    dates.forEach((date) => {
      const initialSchedule = pickActiveSchedule(employeeSchedules, { date });
      const scope = initialSchedule?.businessId || employee.businessIds?.[0] || "";
      const schedule = pickActiveSchedule(employeeSchedules, { businessId: scope, date }) || initialSchedule;
      if (businessId && scope !== businessId) return;
      const business = businessMap.get(scope) || { id: scope, name: "-" };
      const events = attendance.filter((event) => (event.workDate || event.attendanceDate) === date && event.userId === employee.id && event.businessId === scope);
      const overtime = approvedOvertime.filter((item) => item.userId === employee.id && (!item.businessId || item.businessId === scope) && item.date === date);
      const leaveRequest = approvedLeave.find((item) => item.userId === employee.id
        && (!item.businessId || item.businessId === scope)
        && date >= (item.startDate || date)
        && date <= (item.endDate || date));
      if (!schedule && !events.length && !leaveRequest) return;
      rows.push(buildRow({ date, employee, business, shift: shifts.get(schedule?.shiftId), events, overtime, leaveRequest }));
    });
  });
  rows.sort((a, b) => `${b.date}${b.employee}`.localeCompare(`${a.date}${a.employee}`));

  const employeeSummaries = summarizeRows(rows);
  const absoluteMinutes = rows.reduce((total, row) => total + row.absoluteMinutes, 0);
  const overtimeMinutes = rows.reduce((total, row) => total + row.overtimeApprovedMinutes, 0);
  const payableMinutes = rows.reduce((total, row) => total + row.payableMinutes, 0);
  const summary = {
    total: rows.length,
    hadir: rows.filter((row) => ["hadir", "tercatat"].includes(row.status)).length,
    terlambat: rows.filter((row) => row.status.toLowerCase().includes("terlambat")).length,
    alpa: rows.filter((row) => row.status === "alpa").length,
    belumLengkap: rows.filter((row) => row.status === "belum lengkap").length,
    employees: filteredEmployees.length,
    absoluteMinutes,
    overtimeMinutes,
    payableMinutes,
    absoluteHoursLabel: hoursLabel(absoluteMinutes),
    overtimeHoursLabel: hoursLabel(overtimeMinutes),
    totalHours: hoursValue(payableMinutes),
    totalHoursLabel: hoursLabel(payableMinutes),
  };

  return { rows, summary, employeeSummaries, businesses, employees: filteredEmployees, from, to, errors };
}
