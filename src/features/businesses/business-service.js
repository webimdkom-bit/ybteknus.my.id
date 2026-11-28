import { createBusiness, listBusinessesForOrganization } from "../../lib/firestore/repositories.js";
import { normalizeBusinessStatus } from "../../lib/utils/business.js";
import { auth } from "../../lib/firebase/firebase.js";

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

export async function deleteOwnerBusiness({ businessId }) {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) throw new Error("Sesi tidak ditemukan.");
  const response = await fetch("/api/provision-user", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "delete-business", businessId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal menghapus bisnis.");
  return data;
}

export { listBusinessesForOrganization };
