const ACTIVE = "active";
const INACTIVE = "inactive";
const TRUE_STRINGS = new Set(["true", "1", "yes"]);

export function normalizeBusinessStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === INACTIVE ? INACTIVE : ACTIVE;
}

export function normalizeAcceptingRegistrations(value) {
  if (value === undefined) return true;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return TRUE_STRINGS.has(value.trim().toLowerCase());
  return false;
}

export function normalizeBusinessFields(data = {}) {
  return {
    ...data,
    status: normalizeBusinessStatus(data.status),
    acceptingRegistrations: normalizeAcceptingRegistrations(data.acceptingRegistrations),
  };
}

export function normalizeBusinessChanges(changes = {}) {
  const result = { ...changes };
  if (Object.prototype.hasOwnProperty.call(result, "status")) {
    result.status = normalizeBusinessStatus(result.status);
  }
  if (Object.prototype.hasOwnProperty.call(result, "acceptingRegistrations")) {
    result.acceptingRegistrations = normalizeAcceptingRegistrations(result.acceptingRegistrations);
  }
  return result;
}

export function isBusinessActive(business) {
  return normalizeBusinessStatus(business?.status) === ACTIVE;
}

export function isAcceptingRegistrations(business) {
  return normalizeAcceptingRegistrations(business?.acceptingRegistrations) === true;
}

export const BUSINESS_STATUS = Object.freeze({ ACTIVE, INACTIVE });
