import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canAccessFile, isSameOrganization } from "../../server/shared/access.js";

const rules = readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8");

const owner = { uid: "owner1", role: "owner", organizationId: "orgA", businessIds: [] };
const employee = { uid: "emp1", role: "employee", organizationId: "orgA", businessIds: ["b1"] };
const admin = { uid: "admin1", role: "admin", organizationId: "orgA", businessIds: ["b1"] };
const file = { organizationId: "orgA", businessId: "b1", uploadedBy: "emp1" };

describe("cross-tenant file isolation", () => {
  it("same-organization owner can access any file", () => {
    expect(canAccessFile(owner, file)).toBe(true);
  });

  it("owner from another organization is denied", () => {
    expect(canAccessFile({ ...owner, organizationId: "orgB" }, file)).toBe(false);
    expect(isSameOrganization({ ...owner, organizationId: "orgB" }, file.organizationId)).toBe(false);
  });

  it("employee can access only own uploads", () => {
    expect(canAccessFile(employee, file)).toBe(true);
    expect(canAccessFile({ ...employee, uid: "emp2" }, file)).toBe(false);
  });

  it("admin can access only assigned business in same organization", () => {
    expect(canAccessFile(admin, file)).toBe(true);
    expect(canAccessFile({ ...admin, businessIds: ["b2"] }, file)).toBe(false);
    expect(canAccessFile({ ...admin, organizationId: "orgB" }, file)).toBe(false);
  });

  it("denies unknown actor or file", () => {
    expect(canAccessFile(null, file)).toBe(false);
    expect(canAccessFile(owner, null)).toBe(false);
    expect(canAccessFile({ ...owner, businessIds: undefined }, { ...file, businessId: null })).toBe(true);
  });
});

describe("Firestore rules isolation clauses", () => {
  it("membership reads require same organization for owner", () => {
    expect(rules).toContain("isOwner() && resource.data.organizationId == currentUser().organizationId");
  });

  it("request reviews require same organization", () => {
    expect(rules).toContain("canReviewRequest(resource.data.businessId, resource.data.type)");
    expect(rules).toContain("&& sameOrganization(resource.data.organizationId)));");
  });

  it("allows assignees to save their own task evidence photo", () => {
    expect(rules).toContain("['status', 'checklistByUser', 'evidenceByUser', 'progressByUser', 'progress', 'timeStatus', 'updatedAt']");
  });

  it("unknown collections are denied by default", () => {
    expect(rules).toContain("match /{collection}/{documentId} {\n      allow read, create, update, delete: if false;");
  });

  it("enforces active account status", () => {
    expect(rules).toContain("function activeUser() {\n      return signedIn() && currentUser().status == 'active';\n    }");
    expect(rules).toMatch(/function isOwner\(\) \{\n      return activeUser\(\)/);
    expect(rules).toMatch(/function isAdmin\(\) \{\n      return activeUser\(\)/);
    expect(rules).toContain("function sameOrganization(organizationId) {\n      return activeUser()");
  });

  it("requires same organization on owner writes", () => {
    const branches = ["allow create: if (isOwner() || adminHasPermission", "allow update: if (isOwner() || adminHasPermission", "allow delete: if (isOwner() || adminHasPermission"];
    branches.forEach((needle) => expect(rules).toContain(needle));
    expect(rules).toContain("allow delete: if isOwner()\n        && sameOrganization(resource.data.organizationId);");
    expect(rules).toContain("request.resource.data.organizationId == resource.data.organizationId");
  });

  it("still allows pending self-registration and own profile reads", () => {
    expect(rules).toContain("ownUser(userId)\n          && request.resource.data.role == 'employee'\n          && request.resource.data.status == 'pending'");
    expect(rules).toContain("allow read: if ownUser(userId)");
  });
});
