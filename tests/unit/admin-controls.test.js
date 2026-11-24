import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const service = readSource("../../src/features/admins/admin-service.js");
const view = readSource("../../src/features/admins/admin-view.js");
const audit = readSource("../../api/audit-log.js");

describe("admin reactivation", () => {
  it("provides an activateAdmin service that sets status active", () => {
    expect(service).toContain("export function activateAdmin(userId)");
    expect(service).toContain('updateUserProfile(userId, { status: "active" })');
  });

  it("renders an Aktifkan button for inactive admins", () => {
    expect(view).toContain('data-activate-admin="${admin.id}"');
    expect(view).toContain(">Aktifkan</button>");
  });

  it("wires the Aktifkan button to activateAdmin and audit", () => {
    expect(view).toContain("querySelectorAll(\"[data-activate-admin]\")");
    expect(view).toContain("await activateAdmin(button.dataset.activateAdmin)");
    expect(view).toContain('action: "admin_activated"');
  });

  it("allows admin_activated in the audit API", () => {
    expect(audit).toContain('"admin_activated"');
  });
});
