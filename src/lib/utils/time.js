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

function partsOf(formatter, date) {
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

export function getDateKey(date = new Date()) {
  const parts = partsOf(dateParts, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTimeKey(date = new Date()) {
  const parts = partsOf(timeParts, date);
  return `${parts.hour}:${parts.minute}`;
}

export function getJakartaISO(date = new Date()) {
  const parts = partsOf(timeParts, date);
  return `${getDateKey(date)}T${parts.hour}:${parts.minute}:${parts.second}+07:00`;
}

export function getJakartaMinutes(date = new Date()) {
  const [hours, minutes] = getTimeKey(date).split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatInAppZone(value, options = {}) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, ...options }).format(date);
}
