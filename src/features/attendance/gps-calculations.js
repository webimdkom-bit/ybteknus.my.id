export { calculateDistanceMeters, getLocationStatus } from "../../lib/utils/geo.js";

export function parseGoogleMapsCoordinates(url) {
  const match = String(url || "").match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}
