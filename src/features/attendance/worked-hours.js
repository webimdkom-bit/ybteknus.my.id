export function minutesOf(value) {
  const [hours, minutes] = String(value ?? "").split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function hoursValue(minutes) {
  return Math.round((Number(minutes) || 0) / 60 * 100) / 100;
}

export function hoursLabel(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return remainder ? `${hours}j ${remainder}m` : `${hours}j`;
}

export function monthKey(date) {
  const value = String(date ?? "");
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : "";
}

export function weekKey(date) {
  const value = new Date(`${String(date ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return "";
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((value - yearStart) / 86400000 + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function overtimeInterval(record) {
  const start = minutesOf(record?.startTime);
  const rawEnd = minutesOf(record?.endTime);
  if (start == null || rawEnd == null) return null;
  const duration = Number(record?.durationMinutes);
  const length = Number.isFinite(duration) && duration >= 0 ? duration : (rawEnd < start ? rawEnd + 1440 : rawEnd) - start;
  if (!length) return null;
  return { start, end: start + length };
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  return sorted.reduce((merged, interval) => {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
    return merged;
  }, []);
}

export function calculateWorkedDay({ checkIn, checkOut, approvedOvertime = [] }) {
  const start = minutesOf(checkIn);
  const rawEnd = minutesOf(checkOut);
  const crossesMidnight = start != null && rawEnd != null && rawEnd < start;
  const end = rawEnd == null ? null : crossesMidnight ? rawEnd + 1440 : rawEnd;
  const hasCompletePunch = start != null && end != null;
  const absoluteMinutes = hasCompletePunch ? Math.max(0, end - start) : 0;
  const intervals = mergeIntervals((approvedOvertime || []).map(overtimeInterval).filter(Boolean));
  let overtimeApprovedMinutes = 0;
  let overtimeOverlapMinutes = 0;
  intervals.forEach((interval) => {
    const overlap = hasCompletePunch ? Math.max(0, Math.min(interval.end, end) - Math.max(interval.start, start)) : 0;
    overtimeOverlapMinutes += overlap;
    overtimeApprovedMinutes += Math.max(0, interval.end - interval.start - overlap);
  });
  return {
    hasCompletePunch,
    crossesMidnight,
    absoluteMinutes,
    overtimeApprovedMinutes,
    overtimeOverlapMinutes,
    payableMinutes: absoluteMinutes + overtimeApprovedMinutes,
  };
}

export function summarizeRows(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const employeeId = row.employeeId || row.employee || "-";
    let group = groups.get(employeeId);
    if (!group) {
      group = {
        employeeId,
        employee: row.employee || "-",
        businessIds: new Set(),
        businesses: new Set(),
        statusCounts: {},
        totalRows: 0,
        workedDays: 0,
        absoluteMinutes: 0,
        overtimeMinutes: 0,
        totalMinutes: 0,
        days: new Map(),
        weeks: new Map(),
        months: new Map(),
      };
      groups.set(employeeId, group);
    }
    if (row.businessId) group.businessIds.add(row.businessId);
    if (row.business && row.business !== "-") group.businesses.add(row.business);
    group.statusCounts[row.status] = (group.statusCounts[row.status] || 0) + 1;
    group.totalRows += 1;
    if (Number(row.absoluteMinutes) > 0) group.workedDays += 1;
    group.absoluteMinutes += Number(row.absoluteMinutes) || 0;
    group.overtimeMinutes += Number(row.overtimeApprovedMinutes) || 0;
    group.totalMinutes += Number(row.payableMinutes) || 0;
    const addBucket = (map, key, label) => {
      if (!key) return;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { key, label, dates: new Set(), rows: 0, absoluteMinutes: 0, overtimeMinutes: 0, minutes: 0 };
        map.set(key, bucket);
      }
      bucket.dates.add(row.date);
      bucket.rows += 1;
      bucket.absoluteMinutes += Number(row.absoluteMinutes) || 0;
      bucket.overtimeMinutes += Number(row.overtimeApprovedMinutes) || 0;
      bucket.minutes += Number(row.payableMinutes) || 0;
    };
    addBucket(group.days, row.date, row.date);
    addBucket(group.weeks, weekKey(row.date), weekKey(row.date));
    addBucket(group.months, monthKey(row.date), monthKey(row.date));
  });
  const finalize = (map) => [...map.values()]
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      days: bucket.dates.size,
      rows: bucket.rows,
      absoluteMinutes: bucket.absoluteMinutes,
      overtimeMinutes: bucket.overtimeMinutes,
      minutes: bucket.minutes,
      hours: hoursValue(bucket.minutes),
      labelHours: hoursLabel(bucket.minutes),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
  return [...groups.values()]
    .map((group) => ({
      employeeId: group.employeeId,
      employee: group.employee,
      businessIds: [...group.businessIds],
      businesses: [...group.businesses],
      business: [...group.businesses].join(", ") || "-",
      statusCounts: group.statusCounts,
      totalRows: group.totalRows,
      workedDays: group.workedDays,
      absoluteMinutes: group.absoluteMinutes,
      overtimeMinutes: group.overtimeMinutes,
      totalMinutes: group.totalMinutes,
      absoluteHoursLabel: hoursLabel(group.absoluteMinutes),
      overtimeHoursLabel: hoursLabel(group.overtimeMinutes),
      totalHours: hoursValue(group.totalMinutes),
      totalHoursLabel: hoursLabel(group.totalMinutes),
      days: finalize(group.days),
      weeks: finalize(group.weeks),
      months: finalize(group.months),
    }))
    .sort((a, b) => String(a.employee).localeCompare(String(b.employee)));
}
