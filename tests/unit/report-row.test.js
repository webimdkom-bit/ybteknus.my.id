import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const reportService = readFileSync(fileURLToPath(new URL("../../src/features/reports/report-service.js", import.meta.url)), "utf8");

describe("attendance report rows with incomplete punches", () => {
  it("does not read recordedTime from a missing check-in", () => {
    expect(reportService).toContain("function eventTime(event) {");
    expect(reportService).toContain('if (!event) return "";');
    expect(reportService).toContain("const inTime = eventTime(checkIn);");
  });

  it("pairs a legacy cross-midnight check-out with the previous day's check-in", () => {
    expect(reportService).toContain("function previousDateKey(date)");
    expect(reportService).toContain("const pairedCheckInDate = (event) => {");
    expect(reportService).toContain("return paired ? paired === date : (event.workDate || event.attendanceDate) === date;");
  });
});
