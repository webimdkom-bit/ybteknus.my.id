import { describe, expect, it } from "vitest";
import { calculateAttendanceTiming, getAttendanceStatus, toMinutes } from "../../src/features/schedules/schedule-calculations.js";
import { calculateDistanceMeters, getLocationStatus, parseGoogleMapsCoordinates } from "../../src/features/attendance/gps-calculations.js";

describe("schedule calculations", () => {
  it("converts HH:mm to minutes", () => {
    expect(toMinutes("08:30")).toBe(510);
    expect(toMinutes(90)).toBe(90);
  });

  it("rejects invalid time format", () => {
    expect(() => toMinutes("25:00")).toThrow();
    expect(() => toMinutes("08:99")).toThrow();
  });

  it("maps attendance status correctly", () => {
    expect(getAttendanceStatus({ actualIn: null, actualOut: null, end: 540, now: 600 })).toBe("alpa");
    expect(getAttendanceStatus({ actualIn: 480, actualOut: null, end: 540 })).toBe("belum lengkap");
    expect(getAttendanceStatus({ actualIn: 480, actualOut: 1020, lateAfterToleranceMinutes: 0, earlyDepartureMinutes: 0, end: 1020 })).toBe("hadir");
    expect(getAttendanceStatus({ actualIn: 500, actualOut: 1020, lateAfterToleranceMinutes: 10, earlyDepartureMinutes: 0, end: 1020 })).toBe("terlambat");
    expect(getAttendanceStatus({ actualIn: 480, actualOut: 980, lateAfterToleranceMinutes: 0, earlyDepartureMinutes: 40, end: 1020 })).toBe("pulang lebih awal");
    expect(getAttendanceStatus({ actualIn: 500, actualOut: 980, lateAfterToleranceMinutes: 10, earlyDepartureMinutes: 40, end: 1020 })).toBe("terlambat dan pulang lebih awal");
  });

  it("calculates late time after tolerance", () => {
    const result = calculateAttendanceTiming({
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
      toleranceMinutes: 15,
      checkIn: "08:20",
      checkOut: "17:00",
      now: new Date(),
    });
    expect(result.actualLateMinutes).toBe(20);
    expect(result.lateAfterToleranceMinutes).toBe(5);
    expect(result.status).toBe("terlambat");
  });
});

describe("GPS calculations", () => {
  it("returns zero distance for the same point", () => {
    expect(calculateDistanceMeters(-6.9, 107.6, -6.9, 107.6)).toBeCloseTo(0, 5);
  });

  it("approximates one degree of latitude", () => {
    const distance = calculateDistanceMeters(0, 0, 1, 0);
    expect(distance).toBeGreaterThan(110000);
    expect(distance).toBeLessThan(112000);
  });

  it("classifies location status", () => {
    expect(getLocationStatus({ distanceMeters: 50, radiusMeters: 100, accuracy: 20 })).toBe("valid");
    expect(getLocationStatus({ distanceMeters: 150, radiusMeters: 100, accuracy: 20 })).toBe("outside-radius");
    expect(getLocationStatus({ distanceMeters: 50, radiusMeters: 100, accuracy: 200 })).toBe("low-accuracy");
  });

  it("parses Google Maps coordinates", () => {
    expect(parseGoogleMapsCoordinates("https://maps.google.com/?q=-6.9,107.6/@-6.91,107.61,17z")).toEqual({ latitude: -6.91, longitude: 107.61 });
    expect(parseGoogleMapsCoordinates("invalid")).toBeNull();
  });
});
