import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const main = read("../../src/main.js");
const view = read("../../src/features/tasks/task-view.js");
const css = read("../../src/styles/main.css");

describe("owner full-page task workspace", () => {
  it("renders tasks as a dashboard page with the app chrome intact", () => {
    expect(main).toContain("async function renderTaskPage(profile)");
    expect(main).toContain('<main class="dashboard task-page-dashboard" id="tasks">');
    expect(main).toContain('<div class="breadcrumb"><span>Workspace</span><i data-lucide="chevron-down"></i><strong>Tugas</strong></div>');
    expect(main).toContain("if (profile.role === \"owner\") renderTaskPage(profile)");
    expect(main).toContain("wireDashboardChrome();");
    expect(main).toContain("activeTaskPage?.close();");
  });

  it("mounts the task manager and detail panel outside the modal layer", () => {
    expect(view).toContain("pageMode = false, onClose = null");
    expect(view).toContain('overlay.className = pageMode ? "task-overlay task-page" : "task-overlay"');
    expect(view).toContain('(mount || document.body).append(overlay)');
    expect(view).toContain("data-task-page-detail");
    expect(view).toContain("detailMount: pageMode ? overlay.querySelector(\"[data-task-page-detail]\") : null");
    expect(view).toContain("(detailMount || document.body).append(overlay)");
    expect(view).toContain("return { close };");
    expect(view).toContain("if (!pageMode && event.target === overlay) close();");
  });

  it("uses full-width page styles while keeping modal styles by default", () => {
    expect(css).toContain(".task-overlay.task-page { position: static;");
    expect(css).toContain(".task-overlay.task-page .task-layout { grid-template-columns:");
    expect(css).toContain(".task-page-detail { position: sticky;");
    expect(css).toContain(".task-detail-overlay.task-detail-page .task-detail-modal");
    expect(css).toContain(".task-photo-viewer[hidden] { display: none; }");
  });
});
