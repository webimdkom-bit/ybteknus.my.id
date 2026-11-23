import { auth } from "../../lib/firebase/firebase.js";

async function post(endpoint, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sesi tidak ditemukan.");
  const token = await user.getIdToken();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
  return data;
}

export function switchOrganization(organizationId) {
  return post("/api/switch-organization", { organizationId });
}
