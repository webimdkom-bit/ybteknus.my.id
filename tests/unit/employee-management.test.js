import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const view = read("../../src/features/employees/employee-view.js");
const main = read("../../src/main.js");
const audit = read("../../api/audit-log.js");

describe("employee management wiring", () => {
  it("adds an Owner Karyawan menu item", () => {
    expect(main).toContain('data-open-employees-owner');
    expect(main).toContain('if (profile.role === "owner") openEmployeeManager({ profile });');
  });

  it("uses all-status employees for Owner and Admin", () => {
    expect(view).toContain("listEmployees(organizationId)");
    expect(view).not.toContain("listEmployeesForBusiness(organizationId, businessId)");
  });

  it("wires employee actions", () => {
    expect(view).toContain("data-toggle-employee");
    expect(view).toContain("data-transfer-employee");
    expect(view).toContain("data-reset-employee");
    expect(view).toContain("data-view-employee-tasks");
    expect(view).toContain("data-give-employee-task");
  });

  it("allows password reset audit", () => {
    expect(audit).toContain('"employee_password_reset"');
  });

  it("uses scoped task manager context", () => {
    expect(view).toContain("openTaskManager({ profile, context:");
    expect(view).toContain("createTaskForAssignees(");
  });
});
