import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./_shared/admin";
import { verifyFirebaseToken } from "./_shared/auth";
import { jakartaNow } from "./_shared/time";

const ALLOWED_ACTIONS = new Set([
  "login", "logout",
  "employee_approved", "employee_rejected",
  "organization_created",
  "task_created", "task_progress_updated", "task_cancelled", "subtask_created",
  "report_submitted", "report_approved", "report_revision_requested",
  "final_report_submitted", "final_report_resubmitted", "final_report_approved", "final_report_revision_requested",
  "file_uploaded",
  "account_status_changed", "account_deactivated", "owner_created",
  "admin_created", "admin_access_changed", "admin_deactivated",
  "business_created", "business_updated", "business_registration_toggled", "business_location_changed",
  "employee_transferred",
  "shift_created", "schedule_assigned",
  "request_submitted", "request_approved", "request_rejected",
  "attendance_corrected", "overtime_reviewed",
]);
const EMPLOYEE_ACTIONS = new Set(["login", "logout", "request_submitted", "report_submitted", "file_uploaded"]);

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  const decoded = await verifyFirebaseToken(event.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) {
    return { statusCode: 401, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Unauthorized." }) };
  }

  const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
  const action = String(body.action || "").trim();
  const targetType = String(body.targetType || "").trim();
  const targetId = String(body.targetId || "").trim();
  if (!ALLOWED_ACTIONS.has(action) || !targetType) {
    return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Aksi audit tidak dikenal." }) };
  }

  const db = getFirestore(getAdminApp());
  const actorSnapshot = await db.collection("users").doc(uid).get();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Profil pengguna tidak ditemukan." }) };
  }

  const organizationId = String(body.organizationId || actor.organizationId || "").trim();
  const businessId = body.businessId ? String(body.businessId).trim() : null;
  const role = actor.role;
  if (!["owner", "admin", "employee"].includes(role)) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Tidak memiliki izin audit." }) };
  }
  if (actor.organizationId !== organizationId) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Organisasi tidak sesuai." }) };
  }
  if (role !== "owner" && businessId && !(actor.businessIds || []).includes(businessId)) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Bisnis di luar jangkauan." }) };
  }
  if (role === "employee") {
    if (!EMPLOYEE_ACTIONS.has(action)) {
      return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Aksi tidak diizinkan untuk employee." }) };
    }
    if (targetId && targetId !== uid) {
      const collection = targetType === "request" ? "requests" : targetType === "taskReport" ? "taskReports" : null;
      if (!collection) {
        return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Target audit tidak valid." }) };
      }
      const target = await db.collection(collection).doc(targetId).get();
      if (!target.exists || target.data().userId !== uid) {
        return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Target audit bukan milik Anda." }) };
      }
    }
  }

  const record = {
    actorId: uid,
    actorName: actor.displayName || actor.email || "",
    actorRole: role,
    organizationId,
    businessId: businessId || null,
    action,
    targetType,
    targetId: targetId || null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    timestamp: jakartaNow(),
  };
  const reference = await db.collection("auditLogs").add(record);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: reference.id, ...record }),
  };
};
