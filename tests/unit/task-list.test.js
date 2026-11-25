import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const view = read("../../src/features/tasks/task-view.js");
const repositories = read("../../src/lib/firestore/repositories.js");
const audit = read("../../api/audit-log.js");
const indexes = read("../../firebase/indexes/firestore.indexes.json");

describe("task list wiring", () => {
  it("allows archive audit actions", () => {
    expect(audit).toContain('"task_archived"');
    expect(audit).toContain('"task_restored"');
  });

  it("has archive and restore actions", () => {
    expect(view).toContain("data-task-archive");
    expect(view).toContain("data-task-restore");
    expect(view).toContain("archiveTask(");
    expect(view).toContain("restoreTask(");
  });

  it("has search, filters, sort, and archive view", () => {
    expect(view).toContain('class="task-list-search"');
    expect(view).toContain('class="task-list-view"');
    expect(view).toContain('class="task-list-status"');
    expect(view).toContain('class="task-list-priority"');
    expect(view).toContain('class="task-list-business"');
    expect(view).toContain('class="task-list-sort"');
    expect(view).toContain('<option value="archived">Arsip</option>');
  });

  it("passes max to owner/admin task queries", () => {
    expect(view).toContain("listTasksForOrganization(profile.organizationId, max)");
    expect(view).toContain("listTasksForBusiness(profile.organizationId, businessId, max)");
  });

  it("uses datetime-local deadline fields", () => {
    expect(view).toContain('type="datetime-local"');
    expect(view).toContain("toDateTimeLocalValue(task.deadline)");
  });

  it("has a redesigned assignee picker with search and chips", () => {
    expect(view).toContain('class="task-assignee-search"');
    expect(view).toContain("data-assignee-selected");
    expect(view).toContain("task-assignee-chip");
    expect(view).toContain("data-assignee-all");
    expect(view).toContain("data-assignee-none");
  });

  it("has paging indexes for tasks", () => {
    const parsed = JSON.parse(indexes);
    const has = (a, b) => parsed.indexes.some((index) => index.collectionGroup === "tasks" && index.fields[0]?.fieldPath === a && index.fields[1]?.fieldPath === b);
    expect(has("organizationId", "createdAt")).toBe(true);
    expect(has("organizationId", "businessId")).toBe(true);
  });

  it("has archive helpers in repository", () => {
    expect(repositories).toContain("export function archiveTask(");
    expect(repositories).toContain("export function restoreTask(");
  });
});
