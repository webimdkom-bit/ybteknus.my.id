import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dailyReportKey, isDailyReportEditable, isDailyReportReady } from "../../src/lib/utils/daily-report.js";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const main = read("../../src/main.js");
const rules = read("../../firestore.rules");
const indexes = JSON.parse(read("../../firebase/indexes/firestore.indexes.json"));
const repository = read("../../src/lib/firestore/repositories.js");
const attendance = read("../../src/features/attendance/attendance-view.js");
const attendanceApi = read("../../api/attendance.js");
const correctionApi = read("../../api/attendance-correction.js");
const audit = read("../../api/audit-log.js");
const notifications = read("../../src/features/notifications/notification-service.js");
const dailyView = read("../../src/features/reports/daily-report-view.js");
const fileUploadApi = read("../../api/file-upload.js");
const uploadService = read("../../src/features/files/file-upload-service.js");

describe("daily report helpers", () => {
  it("builds deterministic report keys", () => {
    expect(dailyReportKey("user-1", "2026-11-25")).toBe("user-1_2026-11-25");
  });

  it("recognizes ready and editable states", () => {
    expect(isDailyReportReady("submitted")).toBe(true);
    expect(isDailyReportReady("reviewed")).toBe(true);
    expect(isDailyReportReady("revision")).toBe(false);
    expect(isDailyReportEditable("reviewed")).toBe(false);
    expect(isDailyReportEditable("revision")).toBe(true);
  });
});

describe("daily report wiring", () => {
  it("has menu items for all roles", () => {
    expect(main).toContain('data-open-daily-report');
  });

  it("has Firestore rules and indexes", () => {
    expect(rules).toContain("match /dailyReports/{reportId}");
    const has = (a, b) => indexes.indexes.some((index) => index.collectionGroup === "dailyReports" && index.fields[0]?.fieldPath === a && index.fields[1]?.fieldPath === b);
    expect(has("organizationId", "reportDate")).toBe(true);
    expect(has("organizationId", "businessIds")).toBe(true);
    expect(has("userId", "reportDate")).toBe(true);
  });

  it("has repository helpers", () => {
    expect(repository).toContain("export async function getDailyReport(");
    expect(repository).toContain("export async function saveDailyReport(");
    expect(repository).toContain("export async function syncDailyReportTask(");
    expect(repository).toContain("export async function updateTaskAndDailyReports(");
  });

  it("gates check-out in UI and APIs", () => {
    expect(attendance).toContain("isDailyReportReady(dailyReport?.status)");
    expect(attendance).toContain("data-attendance-daily-report");
    expect(attendanceApi).toContain("Laporan harian belum disubmit.");
    expect(correctionApi).toContain("Laporan harian belum disubmit.");
  });

  it("has audit and notification types", () => {
    expect(audit).toContain('"daily_report_submitted"');
    expect(notifications).toContain("dailyReportSubmitted");
    expect(notifications).toContain("dailyReportReviewed");
    expect(notifications).toContain("dailyReportRevisionRequested");
  });

  it("renders personal and owner daily report modes", () => {
    expect(dailyView).toContain("Laporan harian tim");
    expect(dailyView).toContain("Laporan harian saya");
    expect(dailyView).toContain("data-daily-submit");
    expect(dailyView).toContain("data-daily-review");
  });

  it("reuses file-upload endpoint for daily report attachments", () => {
    expect(fileUploadApi).toContain('body.reportId');
    expect(fileUploadApi).toContain('db.collection("dailyReports")');
    expect(uploadService).toContain('post("/api/file-upload", { reportId, fileName, resourceType })');
  });
});
