import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const reportService = readFileSync(fileURLToPath(new URL("../../src/features/reports/report-service.js", import.meta.url)), "utf8");
const attendanceService = readFileSync(fileURLToPath(new URL("../../src/features/attendance/attendance-service.js", import.meta.url)), "utf8");
const main = readFileSync(fileURLToPath(new URL("../../src/main.js", import.meta.url)), "utf8");

describe("attendance report rows with incomplete punches", () => {
  it("does not read recordedTime from a missing check-in", () => {
    expect(reportService).toContain("function eventTime(event) {");
    expect(reportService).toContain('if (!event) return "";');
    expect(reportService).toContain("const inTime = eventTime(checkIn);");
  });

  it("guards every client-side attendance time helper", () => {
    expect(attendanceService).toContain("function getEventTime(event) {");
    expect(attendanceService).toContain('if (!event) return "";');
    expect(main).toContain("function getAttendanceTime(event) {");
    expect(main).toContain('if (!event) return "";');
  });

  it("pairs a legacy cross-midnight check-out with the previous day's check-in", () => {
    expect(reportService).toContain("function previousDateKey(date)");
    expect(reportService).toContain("const pairedCheckInDate = (event) => {");
    expect(reportService).toContain("return paired ? paired === date : (event.workDate || event.attendanceDate) === date;");
  });
});
