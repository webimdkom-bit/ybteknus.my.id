import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const main = readFileSync(fileURLToPath(new URL("../../src/main.js", import.meta.url)), "utf8");

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
});
