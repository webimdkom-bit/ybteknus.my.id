import { describe, expect, it } from "vitest";
import {
  isAcceptingRegistrations,
  isBusinessActive,
  normalizeAcceptingRegistrations,
  normalizeBusinessChanges,
  normalizeBusinessFields,
  normalizeBusinessStatus,
} from "../../src/lib/utils/business.js";

describe("business field normalization", () => {
  it("normalizes status to active or inactive", () => {
    expect(normalizeBusinessStatus(undefined)).toBe("active");
    expect(normalizeBusinessStatus("ACTIVE")).toBe("active");
    expect(normalizeBusinessStatus("inactive")).toBe("inactive");
    expect(normalizeBusinessStatus("draft")).toBe("active");
  });

  it("normalizes registration flag to a canonical boolean", () => {
    expect(normalizeAcceptingRegistrations(undefined)).toBe(true);
    expect(normalizeAcceptingRegistrations(true)).toBe(true);
    expect(normalizeAcceptingRegistrations("true")).toBe(true);
    expect(normalizeAcceptingRegistrations(1)).toBe(true);
    expect(normalizeAcceptingRegistrations(false)).toBe(false);
    expect(normalizeAcceptingRegistrations("false")).toBe(false);
    expect(normalizeAcceptingRegistrations(null)).toBe(false);
  });

  it("preserves unrelated business fields", () => {
    expect(normalizeBusinessFields({ name: "Cabang", city: "Jakarta", acceptingRegistrations: "false" })).toEqual({
      name: "Cabang",
      city: "Jakarta",
      status: "active",
      acceptingRegistrations: false,
    });
  });

  it("only normalizes fields present in changes", () => {
    expect(normalizeBusinessChanges({ city: "Bandung" })).toEqual({ city: "Bandung" });
    expect(normalizeBusinessChanges({ acceptingRegistrations: "true" })).toEqual({ acceptingRegistrations: true });
  });

  it("exposes consistent predicates", () => {
    expect(isBusinessActive({ status: undefined })).toBe(true);
    expect(isBusinessActive({ status: "inactive" })).toBe(false);
    expect(isAcceptingRegistrations({ acceptingRegistrations: undefined })).toBe(true);
    expect(isAcceptingRegistrations({ acceptingRegistrations: "false" })).toBe(false);
  });
});
