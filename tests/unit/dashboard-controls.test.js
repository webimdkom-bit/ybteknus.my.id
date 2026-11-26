import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { setBusy, updateBusyLabel } from "../../src/lib/utils/html.js";

const main = readFileSync(fileURLToPath(new URL("../../src/main.js", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../../src/styles/main.css", import.meta.url)), "utf8");

describe("dashboard control wiring", () => {
  it("wires owner hero CTA to task manager", () => {
    expect(main).toContain('data-open-tasks><i data-lucide="plus"></i> Buat tugas baru</button>');
  });

  it("wires attendance report and business panel actions", () => {
    expect(main).toContain('data-open-reports><span>Lihat laporan</span>');
    expect(main).toContain('data-open-businesses aria-label="Kelola bisnis"');
    expect(main).toContain('querySelectorAll("[data-open-businesses]")');
    expect(main).toContain('querySelectorAll("[data-open-reports]")');
  });

  it("wires activity filter", () => {
    expect(main).toContain('data-activity-filter aria-label="Filter aktivitas"');
    expect(main).toContain("function wireActivityFilter()");
  });

  it("wires date filters for all dashboard roles", () => {
    expect((main.match(/wireDateFilters\(profile/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(main).toContain("function wireDateFilters(");
  });

  it("points employee schedule link to an existing target", () => {
    expect(main).toContain('href="#employee-schedule"');
    expect(main).toContain('id="employee-schedule"');
  });

  it("uses a time-aware greeting for all dashboards", () => {
    expect(main).not.toContain("Good morning");
    expect((main.match(/\$\{getGreeting\(\)\},<br>/g) || []).length).toBe(3);
  });

  it("marks the dashboard busy while refreshing", () => {
    expect(main).toContain('setRegionBusy(document.querySelector(".dashboard"))');
  });
});

describe("loading motion foundation", () => {
  it("defines reusable busy and reduced-motion styles", () => {
    expect(css).toContain("@keyframes yb-spin");
    expect(css).toContain(".is-busy");
    expect(css).toContain(".is-region-busy");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps mobile modals within the viewport", () => {
    expect(css).toContain(".activity-event > div { min-width: 0; }");
    expect(css).toContain(".daily-report-error:empty, .daily-report-message:empty { display: none; }");
    expect(css).toContain(".daily-report-close { width: 44px");
  });

  it("sets and restores busy control state", () => {
    const classes = new Set();
    const attributes = new Map();
    const button = {
      innerHTML: "Kirim <span>→</span>",
      disabled: false,
      textContent: "",
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
    };
    const restore = setBusy(button, "Mengunggah 0%");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Mengunggah 0%");
    expect(classes.has("is-busy")).toBe(true);
    expect(attributes.get("aria-busy")).toBe("true");
    updateBusyLabel(button, "Mengunggah 50%");
    expect(button.textContent).toBe("Mengunggah 50%");
    restore();
    expect(button.disabled).toBe(false);
    expect(button.innerHTML).toBe("Kirim <span>→</span>");
    expect(classes.has("is-busy")).toBe(false);
    expect(attributes.has("aria-busy")).toBe(false);
  });
});
