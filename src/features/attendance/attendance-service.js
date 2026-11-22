import { createAttendance, getBusiness, getShift, listAttendance, listEmployeeSchedules, listOperationalRequestsForUser, updateBusiness } from "../../lib/firestore/repositories.js";
import { calculateDistanceMeters, getLocationStatus, parseGoogleMapsCoordinates } from "./gps-calculations.js";
import { calculateAttendanceTiming } from "../schedules/schedule-calculations.js";

export const DEFAULT_RADIUS_METERS = 100;
export const MAX_ACCEPTED_ACCURACY_METERS = 150;

export async function saveBusinessLocation(businessId, location) {
  validateLocation(location);
  await updateBusiness(businessId, {
    location: {
      name: location.name.trim(),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      radiusMeters: Number(location.radiusMeters),
      googleMapsUrl: location.googleMapsUrl?.trim() || "",
      isActive: location.isActive !== false,
    },
  });
}

export async function recordGpsAttendance({ userId, organizationId, businessId, type }) {
  if (!userId || !organizationId || !businessId || !["check-in", "check-out"].includes(type)) {
    throw new Error("Data absensi belum lengkap.");
  }
  const dailyAttendance = await getDailyAttendance({ userId, businessId });
  if (type === "check-in" && dailyAttendance.checkIn) throw new Error("Anda sudah melakukan check-in hari ini.");
  if (type === "check-out" && !dailyAttendance.checkIn) throw new Error("Check-in belum tercatat hari ini.");
  if (type === "check-out" && dailyAttendance.checkOut) throw new Error("Anda sudah melakukan check-out hari ini.");

  const business = await getBusiness(businessId);
  if (!business?.location?.isActive) throw new Error("Lokasi absensi bisnis belum aktif.");
  const position = await getCurrentPosition();
  const { latitude, longitude, accuracy } = position.coords;
  const distanceMeters = calculateDistanceMeters(latitude, longitude, business.location.latitude, business.location.longitude);
  const radiusMeters = Number(business.location.radiusMeters) || DEFAULT_RADIUS_METERS;
  const locationStatus = getLocationStatus({ distanceMeters, radiusMeters, accuracy });
  const now = new Date();
  const attendanceDate = getDateKey(now);
  const recordedTime = getTimeKey(now);
  const offsite = locationStatus === "valid" ? null : await getApprovedOffsiteRequest({ userId, businessId, date: attendanceDate, type });
  if (locationStatus !== "valid" && !offsite) {
    throw new Error(locationStatus === "low-accuracy"
      ? `Akurasi GPS terlalu rendah (${Math.round(accuracy)}m). Coba ke area terbuka lalu ulangi.`
      : `Anda berada ${Math.round(distanceMeters)}m dari lokasi absensi. Batasnya ${radiusMeters}m.`);
  }
  const effectiveLocationStatus = offsite ? "offsite-approved" : locationStatus;
  const shift = await getEmployeeShift({ userId, organizationId, businessId, date: attendanceDate });
  const timing = shift ? calculateAttendanceTiming({
    scheduledStart: shift.startTime,
    scheduledEnd: shift.endTime,
    toleranceMinutes: shift.toleranceMinutes,
    checkIn: type === "check-in" ? recordedTime : getEventTime(dailyAttendance.checkIn),
    checkOut: type === "check-out" ? recordedTime : null,
    now,
  }) : null;

  return createAttendance({
    userId,
    organizationId,
    businessId,
    type,
    latitude,
    longitude,
    accuracyMeters: Math.round(accuracy),
    distanceMeters: Math.round(distanceMeters),
    locationStatus: effectiveLocationStatus,
    offsiteRequestId: offsite?.id || null,
    attendanceDate,
    recordedTime,
    attendanceStatus: timing?.status || (type === "check-in" ? "belum lengkap" : "tercatat"),
    lateMinutes: timing?.lateAfterToleranceMinutes || 0,
    earlyDepartureMinutes: timing?.earlyDepartureMinutes || 0,
    scheduledStart: shift?.startTime || null,
    scheduledEnd: shift?.endTime || null,
    toleranceMinutes: shift?.toleranceMinutes || 0,
    clientRecordedAt: now.toISOString(),
  });
}

async function getApprovedOffsiteRequest({ userId, businessId, date, type }) {
  try {
    const requests = await listOperationalRequestsForUser(userId);
    return requests.find((request) => {
      if (request.type !== "offsite" || request.status !== "approved" || request.businessId !== businessId) return false;
      if (request.startDate && date < request.startDate) return false;
      if (request.endDate && date > request.endDate) return false;
      const actions = request.allowedActions || [];
      return !actions.length || actions.includes(type) || actions.includes("both");
    }) || null;
  } catch (error) {
    console.warn("[attendance] offsite permission:", error?.message || error);
    return null;
  }
}

export async function getDailyAttendance({ userId, businessId, date = getDateKey(new Date()) }) {
  const events = (await listAttendance(userId))
    .filter((event) => event.businessId === businessId && getEventDate(event) === date)
    .sort((a, b) => getEventTime(a).localeCompare(getEventTime(b)));
  return {
    date,
    events,
    checkIn: events.find((event) => event.type === "check-in") || null,
    checkOut: events.find((event) => event.type === "check-out") || null,
  };
}

async function getEmployeeShift({ userId, organizationId, businessId, date }) {
  const schedules = await listEmployeeSchedules(userId);
  const assignment = schedules.find((schedule) => schedule.organizationId === organizationId && schedule.businessId === businessId && schedule.date === date && schedule.status !== "cancelled");
  if (!assignment) return null;
  const shift = await getShift(assignment.shiftId);
  return shift?.businessId === businessId && shift.organizationId === organizationId ? shift : null;
}

function getEventDate(event) {
  return event.attendanceDate || event.clientRecordedAt?.slice(0, 10) || "";
}

function getEventTime(event) {
  return event.recordedTime || event.clientRecordedAt?.slice(11, 16) || "";
}

export function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getTimeKey(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getCurrentPosition() {
  if (!navigator.geolocation) return Promise.reject(new Error("Browser ini tidak mendukung GPS."));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Izin lokasi diperlukan untuk melakukan absensi.")), {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0,
  }));
}

function validateLocation(location) {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const radiusMeters = Number(location.radiusMeters);
  if (!location.name?.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Nama dan koordinat lokasi harus diisi dengan benar.");
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters < 10 || radiusMeters > 5000) throw new Error("Radius harus antara 10 sampai 5000 meter.");
}

export { calculateDistanceMeters, getLocationStatus, parseGoogleMapsCoordinates };
