import { describe, expect, it } from "vitest";
import { buildTaskPayload } from "../../src/features/tasks/task-payload.js";

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
