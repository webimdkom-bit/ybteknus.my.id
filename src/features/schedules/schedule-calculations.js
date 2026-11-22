export function calculateAttendanceTiming({ scheduledStart, scheduledEnd, toleranceMinutes = 0, checkIn, checkOut, now }) {
  const start = toMinutes(scheduledStart);
  const end = toMinutes(scheduledEnd);
  const actualIn = checkIn == null ? null : toMinutes(checkIn);
  const actualOut = checkOut == null ? null : toMinutes(checkOut);
  const tolerance = Number(toleranceMinutes) || 0;
  const actualLateMinutes = actualIn == null ? null : Math.max(0, actualIn - start);
  const lateAfterToleranceMinutes = actualIn == null ? null : Math.max(0, actualIn - start - tolerance);
  const earlyDepartureMinutes = actualOut == null ? null : Math.max(0, end - actualOut);

  return {
    actualLateMinutes,
    lateAfterToleranceMinutes,
    earlyDepartureMinutes,
    status: getAttendanceStatus({ actualIn, actualOut, lateAfterToleranceMinutes, earlyDepartureMinutes, end, now }),
  };
}

export function getAttendanceStatus({ actualIn, actualOut, lateAfterToleranceMinutes, earlyDepartureMinutes, end, now = currentMinutes() }) {
  if (actualIn == null) return now > end ? "alpa" : "belum lengkap";
  if (actualOut == null) return "belum lengkap";
  if (lateAfterToleranceMinutes > 0 && earlyDepartureMinutes > 0) return "terlambat dan pulang lebih awal";
  if (lateAfterToleranceMinutes > 0) return "terlambat";
  if (earlyDepartureMinutes > 0) return "pulang lebih awal";
  return "hadir";
}

export function toMinutes(value) {
  if (typeof value === "number") return value;
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) throw new Error("Waktu harus menggunakan format HH:mm.");
  return hours * 60 + minutes;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
