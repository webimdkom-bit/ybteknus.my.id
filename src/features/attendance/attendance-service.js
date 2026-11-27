import { listAttendance, updateBusiness } from "../../lib/firestore/repositories.js";
import { parseGoogleMapsCoordinates } from "./gps-calculations.js";
import { submitAttendance } from "./attendance-api.js";
import { getDateKey, getTimeKey } from "../../lib/utils/time.js";

export { getDateKey, getTimeKey, parseGoogleMapsCoordinates };

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

export async function recordGpsAttendance({ businessId, type, reason }) {
  if (!businessId || !["check-in", "check-out"].includes(type)) throw new Error("Data absensi belum lengkap.");
  const position = await getCurrentPosition();
  const { latitude, longitude, accuracy } = position.coords;
  return submitAttendance({ businessId, type, latitude, longitude, accuracy, reason });
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

function getEventDate(event) {
  return event.workDate || event.attendanceDate || event.clientRecordedAt?.slice(0, 10) || "";
}

function getEventTime(event) {
  return event.recordedTime || event.clientRecordedAt?.slice(11, 16) || "";
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
