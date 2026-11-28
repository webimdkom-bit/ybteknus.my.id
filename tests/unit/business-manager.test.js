import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const view = read("../../src/features/businesses/business-view.js");
const service = read("../../src/features/businesses/business-service.js");
const endpoint = read("../../api/business-delete.js");
const audit = read("../../api/audit-log.js");
const css = read("../../src/styles/main.css");

describe("owner business deletion", () => {
  it("asks for the owner password before deleting", () => {
    expect(view).toContain("data-delete-business");
    expect(view).toContain("data-delete-confirm");
    expect(view).toContain("data-delete-password");
    expect(view).toContain("EmailAuthProvider.credential(user.email, password)");
    expect(view).toContain("reauthenticateWithCredential(user,");
    expect(view).toContain("Password owner tidak benar.");
    expect(view).toContain("Riwayat absensi, tugas, dan laporan tetap tersimpan.");
    expect(css).toContain(".business-delete-confirm[hidden] { display: none; }");
  });

  it("uses a fresh token for the delete request", () => {
    expect(service).toContain('fetch("/api/business-delete"');
    expect(service).toContain("getIdToken(true)");
    expect(endpoint).toContain("decoded.auth_time");
    expect(endpoint).toContain("FRESH_AUTH_SECONDS");
  });

  it("lets only an active owner delete their own business", () => {
    expect(endpoint).toContain("actor.role !== \"owner\"");
    expect(endpoint).toContain("business.organizationId !== actor.organizationId");
    expect(endpoint).toContain('db.collection("businesses").doc(businessId)');
    expect(endpoint).toContain('where("businessId", "==", businessId)');
    expect(endpoint).toContain('where("businessIds", "array-contains", businessId)');
    expect(endpoint).toContain("selectedBusinessId = null");
    expect(endpoint).toContain('action: "business_deleted"');
    expect(endpoint).not.toContain("collection(\"attendance\")");
    expect(audit).toContain('"business_deleted"');
  });
});
