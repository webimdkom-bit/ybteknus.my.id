import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calculateWorkedDay, hoursLabel, hoursValue, monthKey, summarizeRows, weekKey } from "../../src/features/attendance/worked-hours.js";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("worked hours", () => {
  it("calculates absolute minutes from punches", () => {
    expect(calculateWorkedDay({ checkIn: "08:00", checkOut: "17:00" })).toMatchObject({
      absoluteMinutes: 540,
      overtimeApprovedMinutes: 0,
      payableMinutes: 540,
      hasCompletePunch: true,
      crossesMidnight: false,
    });
  });

  it("adds approved overtime only outside the punched span", () => {
    const overtime = [{ startTime: "17:00", endTime: "19:00", durationMinutes: 120 }];
    expect(calculateWorkedDay({ checkIn: "08:00", checkOut: "17:00", approvedOvertime: overtime })).toMatchObject({
      absoluteMinutes: 540,
      overtimeApprovedMinutes: 120,
      overtimeOverlapMinutes: 0,
      payableMinutes: 660,
    });
    expect(calculateWorkedDay({ checkIn: "08:00", checkOut: "19:00", approvedOvertime: overtime })).toMatchObject({
      overtimeApprovedMinutes: 0,
      overtimeOverlapMinutes: 120,
      payableMinutes: 660,
    });
  });

  it("returns zero for incomplete punches and supports midnight checkout", () => {
    expect(calculateWorkedDay({ checkIn: "08:00", checkOut: "" }).payableMinutes).toBe(0);
    expect(calculateWorkedDay({ checkIn: "22:00", checkOut: "01:00" })).toMatchObject({
      absoluteMinutes: 180,
      crossesMidnight: true,
      payableMinutes: 180,
    });
  });

  it("formats hours and derives Jakarta period keys", () => {
    expect(hoursValue(570)).toBe(9.5);
    expect(hoursLabel(570)).toBe("9j 30m");
    expect(monthKey("2026-11-26")).toBe("2026-11");
    expect(weekKey("2026-11-26")).toBe("2026-W48");
  });
});

describe("employee summaries", () => {
  it("groups rows into day, week, and month totals", () => {
    const rows = [
      { employeeId: "u1", employee: "Putri", businessId: "b1", business: "A", date: "2026-11-24", status: "hadir", absoluteMinutes: 480, overtimeApprovedMinutes: 60, payableMinutes: 540 },
      { employeeId: "u1", employee: "Putri", businessId: "b1", business: "A", date: "2026-11-26", status: "terlambat", absoluteMinutes: 510, overtimeApprovedMinutes: 0, payableMinutes: 510 },
      { employeeId: "u2", employee: "Anton", businessId: "b1", business: "A", date: "2026-11-26", status: "alpa", absoluteMinutes: 0, overtimeApprovedMinutes: 0, payableMinutes: 0 },
    ];
    const summaries = summarizeRows(rows);
    const putri = summaries.find((item) => item.employeeId === "u1");
    const anton = summaries.find((item) => item.employeeId === "u2");
    expect(putri).toMatchObject({
      employee: "Putri",
      workedDays: 2,
      absoluteMinutes: 990,
      overtimeMinutes: 60,
      totalMinutes: 1050,
      totalHours: 17.5,
    });
    expect(putri.days).toHaveLength(2);
    expect(putri.weeks[0]).toMatchObject({ key: "2026-W48", days: 2, minutes: 1050 });
    expect(putri.months[0]).toMatchObject({ key: "2026-11", days: 2, minutes: 1050 });
    expect(anton.totalMinutes).toBe(0);
  });
});

describe("export wiring", () => {
  it("uses the named autoTable export", () => {
    const service = read("../../src/features/reports/export-service.js");
    expect(service).toContain("import(\"jspdf-autotable\")");
    expect(service).toContain("{ autoTable }");
    expect(service).not.toContain("autoTableModule.default || autoTableModule");
  });
});
