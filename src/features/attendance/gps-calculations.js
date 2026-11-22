export function calculateDistanceMeters(latitude, longitude, targetLatitude, targetLongitude) {
  const earthRadius = 6371000;
  const latitudeDelta = toRadians(targetLatitude - latitude);
  const longitudeDelta = toRadians(targetLongitude - longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitude)) * Math.cos(toRadians(targetLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getLocationStatus({ distanceMeters, radiusMeters, accuracy, maxAccuracyMeters = 150 }) {
  if (!Number.isFinite(accuracy) || accuracy > maxAccuracyMeters) return "low-accuracy";
  return distanceMeters <= radiusMeters ? "valid" : "outside-radius";
}

export function parseGoogleMapsCoordinates(url) {
  const match = String(url || "").match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function toRadians(value) { return value * (Math.PI / 180); }
