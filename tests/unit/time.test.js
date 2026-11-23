import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, formatInAppZone, getDateKey, getJakartaISO, getJakartaMinutes, getTimeKey } from "../../src/lib/utils/time.js";

describe("Asia/Jakarta time helpers", () => {
  it("uses Asia/Jakarta regardless of host timezone", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Jakarta");
    expect(getDateKey(new Date("2026-11-22T17:30:00Z"))).toBe("2026-11-23");
    expect(getTimeKey(new Date("2026-11-22T17:30:00Z"))).toBe("00:30");
    expect(getJakartaMinutes(new Date("2026-11-22T17:30:00Z"))).toBe(30);
  });

  it("produces Jakarta wall-clock ISO strings", () => {
    expect(getJakartaISO(new Date("2026-11-22T17:30:45Z"))).toBe("2026-11-23T00:30:45+07:00");
  });

  it("formats timestamps in Jakarta timezone", () => {
    const formatted = formatInAppZone("2026-11-22T17:30:00Z", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/00[.:]30/);
  });
});
