import { describe, expect, it } from "vitest";
import { calculateDistanceMeters, getLocationStatus } from "../../src/lib/utils/geo.js";

describe("shared geo helpers", () => {
  it("returns zero distance for identical coordinates", () => {
    expect(calculateDistanceMeters(-6.9, 107.6, -6.9, 107.6)).toBeCloseTo(0, 5);
  });

  it("approximates one degree of latitude", () => {
    const distance = calculateDistanceMeters(0, 0, 1, 0);
    expect(distance).toBeGreaterThan(110000);
    expect(distance).toBeLessThan(112000);
  });

  it("classifies location validity", () => {
    expect(getLocationStatus({ distanceMeters: 50, radiusMeters: 100, accuracy: 20 })).toBe("valid");
    expect(getLocationStatus({ distanceMeters: 150, radiusMeters: 100, accuracy: 20 })).toBe("outside-radius");
    expect(getLocationStatus({ distanceMeters: 50, radiusMeters: 100, accuracy: 200 })).toBe("low-accuracy");
  });
});
