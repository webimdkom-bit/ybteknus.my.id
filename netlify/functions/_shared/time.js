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
