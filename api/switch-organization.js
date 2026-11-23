import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const organizationId = String(body.organizationId || "").trim();
  if (!organizationId) return sendJson(res, 400, { error: "organizationId wajib diisi." });

  const db = getFirestore(getAdminApp());
  const actorSnapshot = await db.collection("users").doc(uid).get();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor || actor.status !== "active") return sendJson(res, 403, { error: "Akun tidak aktif." });
  if (actor.role !== "owner") return sendJson(res, 403, { error: "Hanya Owner yang dapat berpindah Organization." });

  const targetSnapshot = await db.collection("organizations").doc(organizationId).get();
  if (!targetSnapshot.exists || targetSnapshot.data().status === "inactive") return sendJson(res, 404, { error: "Organization tidak ditemukan." });
  if (targetSnapshot.data().ownerId !== uid) return sendJson(res, 403, { error: "Organization bukan milik Anda." });
  if (actor.organizationId === organizationId) return sendJson(res, 200, { organizationId, name: targetSnapshot.data().name, unchanged: true });

  const previousOrganizationId = actor.organizationId || null;
  await db.collection("users").doc(uid).update({
    organizationId,
    businessIds: [],
    permissions: [],
    updatedAt: jakartaNow(),
  });
  await db.collection("auditLogs").add({
    actorId: uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: "owner",
    organizationId,
    businessId: null,
    action: "organization_switched",
    targetType: "organization",
    targetId: organizationId,
    metadata: { fromOrganizationId: previousOrganizationId, toOrganizationId: organizationId, name: targetSnapshot.data().name || "" },
    timestamp: jakartaNow(),
  });

  return sendJson(res, 200, { organizationId, name: targetSnapshot.data().name || "", previousOrganizationId });
}
