import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const reportService = readFileSync(fileURLToPath(new URL("../../src/features/reports/report-service.js", import.meta.url)), "utf8");
const attendanceService = readFileSync(fileURLToPath(new URL("../../src/features/attendance/attendance-service.js", import.meta.url)), "utf8");
const main = readFileSync(fileURLToPath(new URL("../../src/main.js", import.meta.url)), "utf8");
const reportView = readFileSync(fileURLToPath(new URL("../../src/features/reports/report-view.js", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../../src/styles/main.css", import.meta.url)), "utf8");

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

  it("keeps the owner attendance report readable and explained", () => {
    expect(reportView).toContain("Total jam kerja");
    expect(reportView).toContain("Jam absolut adalah selisih check-in dan check-out apa adanya.");
    expect(reportView).toContain('class="report-status-pill ${reportStatusTone(row.status)}"');
    expect(reportView).toContain("Tidak ada data pada periode ini");
    expect(css).toContain(".report-status-pill.hadir");
    expect(css).toContain(".report-help");
  });
});
