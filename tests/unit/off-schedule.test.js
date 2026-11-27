import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const attendanceApi = read("../../api/attendance.js");
const attendanceReviewApi = read("../../api/attendance-review.js");
const attendanceView = read("../../src/features/attendance/attendance-view.js");
const requestView = read("../../src/features/requests/request-view.js");
const reportService = read("../../src/features/reports/report-service.js");
const dashboardService = read("../../src/features/dashboard/dashboard-service.js");
const auditLog = read("../../api/audit-log.js");
const main = read("../../src/main.js");

describe("off-schedule attendance flow", () => {
  it("flags attendance without a resolved shift and records the check-in date", () => {
    expect(attendanceApi).toContain('const scheduleStatus = shift ? "scheduled" : "unscheduled"');
    expect(attendanceApi).toContain('reviewStatus: type === "check-out" && scheduleStatus === "unscheduled" ? "pending" : "none"');
    expect(attendanceApi).toContain("workDate");
    expect(attendanceApi).toContain("minutesBetweenJakarta");
  });

  it("requires a reason for off-schedule check-out and creates an auto overtime request", () => {
    expect(attendanceApi).toContain("Absen di luar jadwal memerlukan keterangan.");
    expect(attendanceApi).toContain('type: "overtime"');
    expect(attendanceApi).toContain('source: "auto"');
    expect(attendanceApi).toContain("attendanceIds: [checkInEvent.id, attendanceRef.id]");
    expect(attendanceApi).toContain("offschedule_overtime_auto_created");
    expect(attendanceApi).toContain("await batch.commit()");
  });

  it("gates the review endpoint by membership permission and syncs attendance", () => {
    expect(attendanceReviewApi).toContain('request.source !== "auto"');
    expect(attendanceReviewApi).toContain("memberships");
    expect(attendanceReviewApi).toContain('includes("manageOvertime")');
    expect(attendanceReviewApi).toContain("reviewStatus: status");
    expect(attendanceReviewApi).toContain("offschedule_reviewed");
  });

  it("collects a reason in the UI and surfaces the auto overtime notice", () => {
    expect(attendanceView).toContain("data-attendance-reason");
    expect(attendanceView).toContain("attendance-notice");
    expect(attendanceView).toContain("Pengajuan lembur otomatis");
  });

  it("syncs auto overtime approval from the request reviewer", () => {
    expect(requestView).toContain('request.source === "auto"');
    expect(requestView).toContain("submitAttendanceReview({ requestId: request.id");
    expect(requestView).toContain("AUTO · di luar jadwal");
  });

  it("shows off-schedule status and zeroes payable time when rejected", () => {
    expect(reportService).toContain('di luar jadwal · ${detail}');
    expect(reportService).toContain("const payableMinutes = rejected ? 0 : worked.payableMinutes");
    expect(reportService).toContain("(event.workDate || event.attendanceDate) === date");
  });

  it("excludes off-schedule punches from attendance metrics without falling back to all employees", () => {
    expect(dashboardService).toContain("unscheduled += 1");
    expect(dashboardService).toContain("unscheduled: attendance.unscheduled");
    expect(dashboardService).not.toContain("employees.forEach((employee) => expectedToday.add(employee.id))");
    expect(main).toContain("${metrics.unscheduled} di luar jadwal");
  });

  it("registers the new audit actions", () => {
    expect(auditLog).toContain("offschedule_overtime_auto_created");
    expect(auditLog).toContain("offschedule_reviewed");
  });
});
