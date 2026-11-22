import { auth } from "../../lib/firebase/firebase.js";

export async function logAudit({ profile, action, targetType, targetId, businessId, metadata }) {
  const user = auth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  const response = await fetch("/api/audit-log", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action,
      targetType,
      targetId: targetId || null,
      businessId: businessId || null,
      organizationId: profile?.organizationId,
      metadata: metadata || {},
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Gagal mencatat audit trail.");
  }
  return response.json().catch(() => null);
}

export function logAuditSafe(payload) {
  logAudit(payload).catch((error) => console.warn("[audit]", error?.message || error));
}
