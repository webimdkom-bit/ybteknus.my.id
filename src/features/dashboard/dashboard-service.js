import {
  getBusiness,
  listAttendanceForOrganization,
  listBusinessesForOrganization,
  listEmployees,
  listEmployeesForBusiness,
  listMembershipsForUser,
  listOperationalRequestsForBusiness,
  listOperationalRequestsForOrganization,
  listRegistrations,
  listRegistrationsForBusiness,
  listSchedules,
  listTaskReportsForBusiness,
  listTaskReportsForOrganization,
  listTasksForBusiness,
  listTasksForOrganization,
} from "../../lib/firestore/repositories.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const LATE_STATUSES = new Set(["terlambat", "terlambat dan pulang lebih awal"]);
const PRESENT_STATUSES = new Set(["hadir", "tercatat", "terlambat", "pulang lebih awal", "terlambat dan pulang lebih awal"]);

export function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return toDateKey(new Date(year, month - 1, day + days));
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function safeList(callback, label) {
  try {
    return await callback();
  } catch (error) {
    console.warn(`[dashboard] ${label}:`, error?.message || error);
    return [];
  }
}

function countAttendance(events, expectedUserIds) {
  const byUser = new Map();
  events.forEach((event) => {
    const current = byUser.get(event.userId);
    const sortKey = `${event.attendanceDate || ""}${event.recordedTime || ""}${toMillis(event.createdAt)}`;
    if (!current || sortKey > current.sortKey) byUser.set(event.userId, { event, sortKey });
  });

  let hadir = 0;
  let late = 0;
  let incomplete = 0;
  byUser.forEach(({ event }) => {
    const status = event.attendanceStatus || (event.type === "check-in" ? "belum lengkap" : "tercatat");
    if (PRESENT_STATUSES.has(status)) hadir += 1;
    if (LATE_STATUSES.has(status)) late += 1;
    if (status === "belum lengkap") incomplete += 1;
  });

  const expected = expectedUserIds.size;
  const withEvent = byUser.size;
  const alpa = Math.max(0, expected - withEvent);
  const percent = expected ? Math.round((hadir / expected) * 100) : 0;
  return { hadir, late, incomplete, alpa, expected, percent };
}

function countTasks(tasks, reports, today) {
  const running = tasks.filter((task) => ["in-progress", "submitted", "revision"].includes(task.status));
  const overdue = tasks.filter((task) => task.deadline && task.deadline < today && !["approved", "cancelled"].includes(task.status));
  const approved = tasks.filter((task) => task.status === "approved");
  const pendingReviews = reports.filter((report) => report.status === "submitted");
  const completion = tasks.length ? Math.round((approved.length / tasks.length) * 100) : 0;
  return {
    running: running.length,
    overdue: overdue.length,
    approved: approved.length,
    total: tasks.length,
    completion,
    pendingReviews: pendingReviews.length,
  };
}

function buildChartSeries(attendanceEvents, schedules, today) {
  const expectedByDate = new Map();
  schedules.forEach((schedule) => {
    if (!schedule.date || schedule.status === "cancelled") return;
    if (!expectedByDate.has(schedule.date)) expectedByDate.set(schedule.date, new Set());
    expectedByDate.get(schedule.date).add(schedule.userId);
  });

  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = shiftDateKey(today, -offset);
    const events = attendanceEvents.filter((event) => event.attendanceDate === date);
    const expected = expectedByDate.get(date) || new Set();
    const summary = countAttendance(events, expected);
    const parsed = new Date(`${date}T12:00:00`);
    days.push({ date, percent: summary.percent, label: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][parsed.getDay()] });
  }
  return days;
}

function healthLabel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "On track";
  return "Needs care";
}

function buildBusinessHealth(businesses, employees, attendanceEvents, schedules, tasks, today) {
  const expectedByBusiness = new Map();
  schedules.forEach((schedule) => {
    if (!schedule.date || schedule.date !== today || schedule.status === "cancelled") return;
    if (!expectedByBusiness.has(schedule.businessId)) expectedByBusiness.set(schedule.businessId, new Set());
    expectedByBusiness.get(schedule.businessId).add(schedule.userId);
  });

  return businesses.filter((business) => business.status !== "inactive").map((business) => {
    const people = employees.filter((employee) => employee.businessIds?.includes(business.id)).length;
    const expected = expectedByBusiness.get(business.id) || new Set();
    const attendance = countAttendance(
      attendanceEvents.filter((event) => event.businessId === business.id),
      expected,
    );
    const businessTasks = tasks.filter((task) => task.businessId === business.id);
    const approved = businessTasks.filter((task) => task.status === "approved").length;
    const completion = businessTasks.length ? Math.round((approved / businessTasks.length) * 100) : 0;
    const score = Math.round(attendance.percent * 0.6 + completion * 0.4);
    return {
      id: business.id,
      name: business.name,
      city: business.location?.name || business.location?.city || "Tanpa lokasi",
      people,
      score,
      label: healthLabel(score),
    };
  });
}

function buildRecentActivity({ tasks, reports, requests, registrations, businesses, limit = 4 }) {
  const businessNames = new Map(businesses.map((business) => [business.id, business.name]));
  const entries = [];
  const push = (item, title, detail, status, timestamp) => {
    const time = toMillis(timestamp);
    if (!time) return;
    entries.push({ title, detail, status, time, businessId: item.businessId });
  };

  tasks.forEach((task) => push(task, "Tugas baru dibuat", task.title || "Tugas", "assigned", task.createdAt));
  reports.forEach((report) => push(report, "Laporan tugas dikirim", report.description || "Laporan", "submitted", report.createdAt));
  requests.forEach((request) => {
    const labels = { leave: "Pengajuan izin/cuti", "attendance-correction": "Pengajuan koreksi", overtime: "Pengajuan lembur", offsite: "Pengajuan absensi luar lokasi" };
    push(request, labels[request.type] || "Pengajuan baru", request.reason || request.type || "", request.status || "pending", request.createdAt);
  });
  registrations.forEach((registration) => push(registration, "Registrasi karyawan baru", registration.name || registration.email || "", "review", registration.createdAt));

  return entries
    .sort((a, b) => b.time - a.time)
    .slice(0, limit)
    .map(({ title, detail, status, time, businessId }) => ({
      title,
      detail: businessNames.get(businessId) ? `${detail} · ${businessNames.get(businessId)}` : detail,
      time: new Date(time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      status,
    }));
}

function buildViewModel({ businesses, employees, attendanceToday, attendanceWeek, schedulesToday, schedulesWeek, registrations, requests, tasks, reports, today }) {
  const expectedToday = new Set(schedulesToday.filter((schedule) => schedule.status !== "cancelled").map((schedule) => schedule.userId));
  if (!expectedToday.size) employees.forEach((employee) => expectedToday.add(employee.id));
  const attendance = countAttendance(attendanceToday, expectedToday);
  const taskSummary = countTasks(tasks, reports, today);
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const pendingRegistrations = registrations.length;

  return {
    generatedAt: new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    metrics: {
      attendancePercent: attendance.percent,
      attendanceHadir: attendance.hadir,
      late: attendance.late,
      alpa: attendance.alpa,
      people: employees.length,
      businesses: businesses.filter((business) => business.status !== "inactive").length,
      runningTasks: taskSummary.running,
      overdueTasks: taskSummary.overdue,
      pendingReviews: taskSummary.pendingReviews,
      pendingRegistrations,
      pendingRequests: pendingRequests.length,
    },
    chartSeries: buildChartSeries(attendanceWeek, schedulesWeek, today),
    businessHealth: buildBusinessHealth(businesses, employees, attendanceToday, schedulesToday, tasks, today),
    activity: buildRecentActivity({ tasks, reports, requests, registrations, businesses }),
    quickActions: { registrations: pendingRegistrations, reports: taskSummary.pendingReviews },
  };
}

export async function loadOwnerDashboardData(profile) {
  const organizationId = profile.organizationId;
  const today = toDateKey(new Date());
  const from = shiftDateKey(today, -6);

  const [businesses, employees, attendanceToday, attendanceWeek, schedulesToday, schedulesWeek, registrations, requests, tasks, reports] = await Promise.all([
    safeList(() => listBusinessesForOrganization(organizationId), "businesses"),
    safeList(() => listEmployees(organizationId), "employees"),
    safeList(() => listAttendanceForOrganization(organizationId, { date: today }), "attendance today"),
    safeList(() => listAttendanceForOrganization(organizationId, { from, to: today }), "attendance week"),
    safeList(() => listSchedules({ organizationId, from: today, to: today }), "schedules today"),
    safeList(() => listSchedules({ organizationId, from, to: today }), "schedules week"),
    safeList(() => listRegistrations(organizationId), "registrations"),
    safeList(() => listOperationalRequestsForOrganization(organizationId), "requests"),
    safeList(() => listTasksForOrganization(organizationId), "tasks"),
    safeList(() => listTaskReportsForOrganization(organizationId), "reports"),
  ]);

  const scopedBusinesses = profile.selectedBusinessId
    ? businesses.filter((business) => business.id === profile.selectedBusinessId)
    : businesses;
  const scopedEmployees = profile.selectedBusinessId
    ? employees.filter((employee) => employee.businessIds?.includes(profile.selectedBusinessId))
    : employees;
  const inScope = (item) => !profile.selectedBusinessId || item.businessId === profile.selectedBusinessId;

  return buildViewModel({
    businesses: scopedBusinesses,
    employees: scopedEmployees,
    attendanceToday: attendanceToday.filter(inScope),
    attendanceWeek: attendanceWeek.filter(inScope),
    schedulesToday: schedulesToday.filter(inScope),
    schedulesWeek: schedulesWeek.filter(inScope),
    registrations: registrations.filter(inScope),
    requests: requests.filter(inScope),
    tasks: tasks.filter(inScope),
    reports: reports.filter(inScope),
    today,
  });
}

export async function loadAdminDashboardData(profile) {
  const organizationId = profile.organizationId;
  const today = toDateKey(new Date());
  const from = shiftDateKey(today, -6);
  const businessIds = (profile.businessIds || []).filter((id) => !profile.selectedBusinessId || id === profile.selectedBusinessId);

  const businesses = (await Promise.all(businessIds.map((id) => safeList(() => getBusiness(id), `business ${id}`))))
    .filter((business) => business && business.status !== "inactive");
  const memberships = await safeList(() => listMembershipsForUser(profile.uid, organizationId), "memberships");
  const permissionByBusiness = new Map(memberships.map((membership) => [membership.businessId, new Set(membership.permissions || [])]));

  const fetchPerBusiness = (callback, label) => Promise.all(businessIds.map((businessId) => safeList(() => callback(businessId), `${label} ${businessId}`)));

  const [employeeGroups, attendanceTodayGroups, attendanceWeekGroups, schedulesTodayGroups, schedulesWeekGroups, registrationGroups, requestGroups, taskGroups, reportGroups] = await Promise.all([
    fetchPerBusiness((businessId) => listEmployeesForBusiness(organizationId, businessId), "employees"),
    fetchPerBusiness((businessId) => listAttendanceForOrganization(organizationId, { businessId, date: today }), "attendance today"),
    fetchPerBusiness((businessId) => listAttendanceForOrganization(organizationId, { businessId, from, to: today }), "attendance week"),
    fetchPerBusiness((businessId) => listSchedules({ organizationId, businessId, from: today, to: today }), "schedules today"),
    fetchPerBusiness((businessId) => listSchedules({ organizationId, businessId, from, to: today }), "schedules week"),
    fetchPerBusiness((businessId) => listRegistrationsForBusiness(organizationId, businessId), "registrations"),
    fetchPerBusiness((businessId) => listOperationalRequestsForBusiness(organizationId, businessId), "requests"),
    fetchPerBusiness((businessId) => listTasksForBusiness(organizationId, businessId), "tasks"),
    fetchPerBusiness((businessId) => listTaskReportsForBusiness(organizationId, businessId), "reports"),
  ]);

  const flatten = (groups) => groups.flat();
  const employees = flatten(employeeGroups);
  const attendanceToday = flatten(attendanceTodayGroups);
  const attendanceWeek = flatten(attendanceWeekGroups);
  const schedulesToday = flatten(schedulesTodayGroups);
  const schedulesWeek = flatten(schedulesWeekGroups);
  const registrations = flatten(registrationGroups);
  const requests = flatten(requestGroups);
  let tasks = flatten(taskGroups);
  let reports = flatten(reportGroups);

  if (![...permissionByBusiness.values()].some((permissions) => permissions.has("manageTasks"))) tasks = [];
  if (![...permissionByBusiness.values()].some((permissions) => permissions.has("reviewSubmissions"))) reports = [];

  return buildViewModel({
    businesses,
    employees,
    attendanceToday,
    attendanceWeek,
    schedulesToday,
    schedulesWeek,
    registrations,
    requests,
    tasks,
    reports,
    today,
  });
}
