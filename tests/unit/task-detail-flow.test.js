import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const payload = read("../../src/features/tasks/task-payload.js");
const view = read("../../src/features/tasks/task-view.js");
const uploadApi = read("../../api/file-upload.js");
const uploadService = read("../../src/features/files/file-upload-service.js");
const dailyView = read("../../src/features/reports/daily-report-view.js");
const css = read("../../src/styles/main.css");

describe("task detail flow", () => {
  it("stores per-item evidence inside checklistByUser", async () => {
    const { buildTaskPayload } = await import("../../src/features/tasks/task-payload.js");
    const result = buildTaskPayload({
      profile: { uid: "owner1", organizationId: "org1" },
      businessId: "b1",
      assigneeIds: ["u1"],
      fields: { title: "Tugas", checklist: "Satu\nDua", checklistPhotoEnabled: "on", evidenceRequired: "photo" },
    });
    expect(result.checklistPhotoEnabled).toBe(true);
    expect(result.checklistByUser.u1[0]).toMatchObject({ id: "item-1", completed: false, evidenceFileId: null, evidenceUrl: null, evidenceAt: null });
    expect(payload).toContain("checklistPhotoEnabled");
  });

  it("gates completion and submission behind checklist, photo, and written requirements", () => {
    expect(view).toContain("data-detail-check");
    expect(view).toContain("data-detail-upload");
    expect(view).toContain('const photoRequired = task.evidenceRequired === "photo" && task.checklistPhotoEnabled');
    expect(view).toContain('const writtenRequired = ["written", "mixed"].includes(task.reportFormat)');
    expect(view).toContain("const canComplete = task.status === \"in-progress\" && allChecked && photosOk");
    expect(view).toContain("const canSubmit = [\"completed\", \"revision\"].includes(task.status)");
    expect(view).toContain("Laporan tertulis wajib diisi.");
  });

  it("uses an upload signature scoped to the checklist item", () => {
    expect(uploadApi).toContain("const checklistItemId = String(body.checklistItemId");
    expect(uploadApi).toContain("Item checklist tidak ditemukan pada tugas ini.");
    expect(uploadApi).toContain("${checklistItemId ? `${checklistItemId}/` : \"\"}");
    expect(uploadService).toContain("checklistItemId })");
  });

  it("renders task reports, checklist photos, and review actions in owner daily report", () => {
    expect(dailyView).toContain("renderDetail(selected, true, taskReports, taskMap)");
    expect(dailyView).toContain("data-task-report-action=\"approved\"");
    expect(dailyView).toContain("data-task-subtask-toggle");
    expect(dailyView).toContain("ACC</button>");
    expect(dailyView).toContain("await reviewTaskReport(");
    expect(dailyView).toContain("data-task-subtask-submit");
    expect(css).toContain(".daily-report-check-item img");
  });
});
