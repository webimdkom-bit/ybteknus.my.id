import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isScheduleEffective, pickActiveSchedule } from "../../src/features/schedules/schedule-calculations.js";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const service = read("../../src/features/schedules/schedule-service.js");
const repositories = read("../../src/lib/firestore/repositories.js");
const view = read("../../src/features/schedules/schedule-view.js");

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

describe("bulk schedule assignment wiring", () => {
  it("provides a bulk service with conflict skipping", () => {
    expect(service).toContain("export async function assignShiftBulk(");
    expect(service).toContain("Sudah memiliki jadwal aktif pada tanggal ini.");
    expect(service).toContain("createSchedulesBatch(");
  });

  it("uses deterministic ids in a transaction", () => {
    expect(repositories).toContain("runTransaction");
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

  it("uses deterministic notifications", () => {
    expect(view).toContain("id: `schedule_bulk_${result.batchId}`");
  });
});
