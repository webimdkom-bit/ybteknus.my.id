import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dateSpanDays, eachScheduleDate, isScheduleEffective, pickActiveSchedule, weekdayKey } from "../../src/features/schedules/schedule-calculations.js";
import { isValidDateKey } from "../../src/features/schedules/schedule-service.js";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const service = read("../../src/features/schedules/schedule-service.js");
const repositories = read("../../src/lib/firestore/repositories.js");
const view = read("../../src/features/schedules/schedule-view.js");
const audit = read("../../api/audit-log.js");

describe("schedule effective helper", () => {
  it("rejects cancelled and future-effective schedules", () => {
    expect(isScheduleEffective({ date: "2026-11-25", status: "active", effectiveFrom: "2026-11-20" }, "2026-11-25")).toBe(true);
    expect(isScheduleEffective({ date: "2026-11-25", status: "cancelled" }, "2026-11-25")).toBe(false);
    expect(isScheduleEffective({ date: "2026-11-25", effectiveFrom: "2026-11-26" }, "2026-11-25")).toBe(false);
    expect(isScheduleEffective({ date: "2026-11-24", effectiveFrom: "2026-11-20" }, "2026-11-25")).toBe(false);
  });

  it("picks the latest deterministic active schedule", () => {
    const picked = pickActiveSchedule([
      { id: "old", date: "2026-11-25", businessId: "b1", effectiveFrom: "2026-11-20", createdAt: "2026-11-20T00:00:00.000Z" },
      { id: "new", date: "2026-11-25", businessId: "b1", effectiveFrom: "2026-11-25", createdAt: "2026-11-24T00:00:00.000Z" },
      { id: "future", date: "2026-11-25", businessId: "b1", effectiveFrom: "2026-11-26", createdAt: "2026-11-24T01:00:00.000Z" },
    ], { businessId: "b1", date: "2026-11-25" });
    expect(picked?.id).toBe("new");
  });
});

describe("schedule date range", () => {
  it("computes weekday keys and calendar span", () => {
    expect(weekdayKey("2026-11-26")).toBe("thursday");
    expect(weekdayKey("2026-11-28")).toBe("saturday");
    expect(dateSpanDays("2026-11-26", "2026-11-26")).toBe(1);
    expect(dateSpanDays("2026-11-26", "2026-11-27")).toBe(2);
    expect(dateSpanDays("2026-11-30", "2026-11-26")).toBeNull();
  });

  it("expands only selected weekdays and rejects ranges above 31 days", () => {
    expect(eachScheduleDate({ from: "2026-11-23", to: "2026-11-29", weekdays: ["monday", "wednesday", "friday"] }))
      .toEqual(["2026-11-23", "2026-11-25", "2026-11-27"]);
    expect(eachScheduleDate({ from: "2026-01-01", to: "2026-02-05", weekdays: ["monday"] })).toEqual([]);
  });
});

describe("bulk schedule assignment wiring", () => {
  it("provides a bulk service with conflict skipping", () => {
    expect(service).toContain("export async function assignShiftBulk(");
    expect(service).toContain("Sudah memiliki jadwal aktif pada tanggal ini.");
    expect(service).toContain("createSchedulesBatch(");
  });

  it("uses deterministic ids in a batch", () => {
    expect(repositories).toContain("writeBatch(db)");
    expect(repositories).toContain("function scheduleKey(");
  });

  it("uses simple employee checkboxes and reports results", () => {
    expect(view).toContain('class="task-assignee-list" id="assign-employees"');
    expect(view).toContain("data-assign-employee");
    expect(view).toContain("listEmployeesForBusiness(organizationId, businessId)");
    expect(view).not.toContain("data-assignee-all");
    expect(view).not.toContain("data-assignee-none");
    expect(view).toContain("Dilewati:");
  });

  it("uses deterministic range notifications", () => {
    expect(view).toContain("id: `schedule_range_${result.batchId}`");
    expect(audit).toContain('"schedule_range_assigned"');
  });

  it("validates real calendar dates and effective dates", () => {
    expect(isValidDateKey("2026-11-26")).toBe(true);
    expect(isValidDateKey("2026-13-99")).toBe(false);
    expect(service).toContain("Tanggal efektif tidak boleh setelah tanggal jadwal.");
  });

  it("supports range assignment with per-date skips and audit", () => {
    expect(service).toContain("export async function assignShiftRange(");
    expect(service).toContain("Rentang maksimal 31 hari kalender.");
    expect(service).toContain("Sudah memiliki jadwal aktif pada tanggal ini.");
    expect(view).toContain('id="assign-from"');
    expect(view).toContain('id="assign-to"');
    expect(view).toContain("data-range-weekday");
    expect(view).toContain("data-range-preview");
    expect(view).toContain("schedule_range_assigned");
  });

  it("supports editing and deleting shifts and schedules", () => {
    expect(service).toContain("updateShiftAssignment(");
    expect(service).toContain("deleteShiftAssignment(");
    expect(service).toContain("updateScheduleAssignment(");
    expect(service).toContain("deleteScheduleAssignment(");
    expect(repositories).toContain("export async function updateShift(");
    expect(repositories).toContain("export async function deleteShift(");
    expect(repositories).toContain("export async function updateSchedule(");
    expect(repositories).toContain("export async function deleteSchedule(");
    expect(view).toContain("data-shift-edit=");
    expect(view).toContain("data-schedule-edit=");
    expect(view).toContain("Jadwal karyawan");
  });

  it("auto-selects an available business for owners and admins", () => {
    expect(view).toContain("profile.selectedBusinessId || profile.businessIds?.[0] || null");
    expect(view).toContain("visibleBusinesses[0]?.id");
  });
});
