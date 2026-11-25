import { describe, expect, it } from "vitest";
import { buildTaskPayload } from "../../src/features/tasks/task-payload.js";
import { formatTaskDeadline, getDeadlineDate, getTimeStatus, normalizeDeadline } from "../../src/features/tasks/task-status.js";

describe("task payload", () => {
  const profile = { uid: "owner1", organizationId: "org1" };

  it("builds a canonical payload with defaults", () => {
    const payload = buildTaskPayload({
      profile,
      businessId: "b1",
      assigneeIds: ["u1", "u2", "u1"],
      fields: { title: "Tugas", description: "Deskripsi", deadline: "2026-11-30" },
    });
    expect(payload.organizationId).toBe("org1");
    expect(payload.businessId).toBe("b1");
    expect(payload.assignedTo).toEqual(["u1", "u2"]);
    expect(payload.priority).toBe("normal");
    expect(payload.reportFormat).toBe("written");
    expect(payload.evidenceRequired).toBe("none");
    expect(payload.assignedBy).toBe("owner1");
    expect(payload.createdBy).toBe("owner1");
    expect(payload.parentTaskId).toBeNull();
    expect(payload.rootTaskId).toBeNull();
  });

  it("normalizes deadline with time", () => {
    expect(normalizeDeadline("2026-11-30")).toBe("2026-11-30T17:00:00+07:00");
    expect(normalizeDeadline("2026-11-30T09:30")).toBe("2026-11-30T09:30:00+07:00");
    expect(getDeadlineDate("2026-11-30T09:30:00+07:00")).toBe("2026-11-30");
    expect(formatTaskDeadline("2026-11-30T09:30:00+07:00")).toContain("09:30");
  });

  it("computes on-time and overdue with hours", () => {
    expect(getTimeStatus({ deadline: "2026-11-30T09:00", status: "assigned", now: new Date("2026-11-30T08:59:00+07:00") })).toBe("pending");
    expect(getTimeStatus({ deadline: "2026-11-30T09:00", status: "assigned", now: new Date("2026-11-30T09:01:00+07:00") })).toBe("overdue");
    expect(getTimeStatus({ deadline: "2026-11-30T09:00", submittedAt: "2026-11-30T08:30:00+07:00", status: "submitted" })).toBe("on-time");
    expect(getTimeStatus({ deadline: "2026-11-30T09:00", submittedAt: "2026-11-30T09:30:00+07:00", status: "submitted" })).toBe("late");
  });

  it("builds per-assignee checklist and progress", () => {
    const payload = buildTaskPayload({
      profile,
      businessId: "b1",
      assigneeIds: ["u1", "u2"],
      fields: { title: "Tugas", deadline: "2026-11-30", checklist: "Satu\nDua\n" },
    });
    expect(payload.checklist.map((item) => item.label)).toEqual(["Satu", "Dua"]);
    expect(payload.checklistByUser.u1).toHaveLength(2);
    expect(payload.progressByUser).toEqual({ u1: 0, u2: 0 });
  });
});
