export function isSameOrganization(actor, organizationId) {
  return Boolean(actor?.organizationId && actor.organizationId === organizationId);
}

export function canAccessFile(actor, file) {
  if (!actor || !file || !isSameOrganization(actor, file.organizationId)) return false;
  if (actor.role === "owner") return true;
  if (actor.uid && file.uploadedBy === actor.uid) return true;
  return actor.role === "admin"
    && Boolean(file.businessId)
    && (actor.businessIds || []).includes(file.businessId);
}
