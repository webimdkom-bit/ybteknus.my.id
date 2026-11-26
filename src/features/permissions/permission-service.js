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

export function canAny(profile, ...permissions) {
  return isOwner(profile) || permissions.some((permission) => profile?.permissions?.includes(permission) === true);
}

export function membershipForBusiness(profile, businessId) {
  if (isOwner(profile)) return { businessId, permissions: [...ADMIN_PERMISSIONS] };
  return (profile?.memberships || []).find((membership) => membership.businessId === businessId
    && membership.status !== "inactive") || null;
}

export function canManageBusinessPermission(profile, businessId, permission) {
  return isOwner(profile) || (membershipForBusiness(profile, businessId)?.permissions || []).includes(permission);
}

export function canReviewRequest(profile, request) {
  if (isOwner(profile) || !request) return true;
  const permission = request.type === "attendance-correction"
    ? "approveCorrections"
    : request.type === "overtime"
      ? "manageOvertime"
      : "approveLeave";
  return canManageBusinessPermission(profile, request.businessId, permission);
}

export function reviewableBusinessIds(profile) {
  if (isOwner(profile)) return profile?.businessIds || [];
  return (profile?.memberships || [])
    .filter((membership) => membership.status !== "inactive")
    .filter((membership) => ["approveLeave", "approveCorrections", "manageOvertime"]
      .some((permission) => (membership.permissions || []).includes(permission)))
    .map((membership) => membership.businessId);
}
