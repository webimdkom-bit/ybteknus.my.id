import { ROLES } from "../../config/constants.js";

export const ADMIN_PERMISSIONS = Object.freeze([
  "manageEmployees",
  "manageSchedules",
  "viewAttendance",
  "approveLeave",
  "approveCorrections",
  "manageOvertime",
  "viewReports",
  "manageTasks",
  "reviewSubmissions",
]);

export function hasRole(profile, ...roles) {
  return Boolean(profile && roles.includes(profile.role));
}

export function isOwner(profile) {
  return hasRole(profile, ROLES.OWNER);
}

export function canAccessBusiness(profile, businessId) {
  if (!profile || profile.status !== "active") return false;
  return isOwner(profile) || profile.businessIds?.includes(businessId) === true;
}

export function can(profile, permission) {
  return isOwner(profile) || profile?.permissions?.includes(permission) === true;
}
