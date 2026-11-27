export const APP_TIME_ZONE = "Asia/Jakarta";

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function jakartaNow() {
  const current = new Date();
  const date = Object.fromEntries(dateParts.formatToParts(current).map((part) => [part.type, part.value]));
  const time = Object.fromEntries(timeParts.formatToParts(current).map((part) => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}T${time.hour}:${time.minute}:${time.second}+07:00`;
}

function clockMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesBetweenJakarta(startDate, startTime, endDate, endTime) {
  const start = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  if (start == null || end == null) return NaN;
  const from = String(startDate ?? "");
  const to = String(endDate ?? "");
  let dayOffset = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const diff = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
    dayOffset = diff > 0 ? diff : 0;
  }
  if (!dayOffset && end < start) dayOffset = 1;
  return Math.max(0, end + dayOffset * 1440 - start);
}
