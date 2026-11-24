import { createBusiness, listBusinessesForOrganization } from "../../lib/firestore/repositories.js";
import { normalizeBusinessStatus } from "../../lib/utils/business.js";

export function getBusinessSummary(business) {
  return {
    id: business.id,
    name: business.name,
    city: business.city || "Lokasi belum diatur",
    status: normalizeBusinessStatus(business.status),
  };
}

export async function createOwnerBusiness({ organizationId, name, city }) {
  return createBusiness({
    organizationId,
    name,
    city,
    slug: name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    acceptingRegistrations: true,
  });
}

export { listBusinessesForOrganization };
