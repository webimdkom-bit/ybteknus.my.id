import { auth } from "../../lib/firebase/firebase.js";

export async function provisionUser({ role, name, email, organizationId, access = [] }) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sesi tidak ditemukan.");
  const response = await fetch("/api/provision-user", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ role, name, email, organizationId, access }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal membuat akun.");
  return data;
}
