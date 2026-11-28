import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const view = read("../../src/features/files/file-view.js");
const css = read("../../src/styles/main.css");

describe("owner file manager", () => {
  it("shows source, uploader, and business for every file", () => {
    expect(view).toContain("FILE_SOURCE_LABELS");
    expect(view).toContain("FILE_TARGET_LABELS");
    expect(view).toContain('"task-evidence": "Bukti tugas"');
    expect(view).toContain('"request-evidence": "Bukti pengajuan"');
    expect(view).toContain('"daily-report-evidence": "Lampiran laporan harian"');
    expect(view).toContain("Dari ${escapeHtml(sourceLabel(file))}");
    expect(view).toContain("Dikirim oleh ${escapeHtml(uploader)}");
    expect(view).toContain("Bisnis: ${escapeHtml(business)}");
    expect(view).toContain("Pengirim tidak diketahui");
    expect(view).toContain("Bisnis tidak ditemukan");
    expect(css).toContain(".file-meta { display: block;");
  });

  it("resolves user and business names in bulk", () => {
    expect(view).toContain("const resolveNames = async () =>");
    expect(view).toContain("listEmployees(profile.organizationId)");
    expect(view).toContain("listOwners(profile.organizationId)");
    expect(view).toContain("listAdmins(profile.organizationId)");
    expect(view).toContain("listEmployeesForBusiness(profile.organizationId, id)");
    expect(view).toContain("listBusinessesForOrganization(profile.organizationId)");
    expect(view).toContain("new Map()");
  });

  it("opens previews inline and offers download without a new tab", () => {
    expect(view).toContain('viewer.className = "task-photo-viewer"');
    expect(view).toContain("data-file-viewer-download");
    expect(view).toContain("data-file-download=");
    expect(view).toContain("data-file-open=");
    expect(view).not.toContain("openWithBusy");
    expect(view).not.toContain("window.open");
    expect(view).toContain('<iframe src="${safeUrl(url)}"');
    expect(view).toContain('link.download = file.fileName || "file"');
    expect(css).toContain(".file-viewer-content iframe");
    expect(css).toContain(".file-viewer-actions");
  });
});
