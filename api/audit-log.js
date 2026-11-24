import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { assertActiveActor } from "../server/shared/actor.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { jakartaNow } from "../server/shared/time.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

const ALLOWED_ACTIONS = new Set([
  "login", "logout",
  "employee_approved", "employee_rejected",
  "organization_created",
  "task_created", "task_progress_updated", "task_cancelled", "subtask_created",
  "report_submitted", "report_approved", "report_revision_requested",
  "final_report_submitted", "final_report_resubmitted", "final_report_approved", "final_report_revision_requested",
  "file_uploaded", "file_deleted",
  "account_status_changed", "account_deactivated", "owner_created",
  "admin_created", "admin_access_changed", "admin_deactivated",
  "business_created", "business_updated", "business_registration_toggled", "business_location_changed",
  "employee_transferred",
  "shift_created", "schedule_assigned",
  "request_submitted", "request_approved", "request_rejected",
  "attendance_corrected", "attendance_recorded", "overtime_reviewed",
]);
const EMPLOYEE_ACTIONS = new Set(["login", "logout", "request_submitted", "report_submitted", "file_uploaded"]);

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const action = String(body.action || "").trim();
  const targetType = String(body.targetType || "").trim();
  const targetId = String(body.targetId || "").trim();
  if (!ALLOWED_ACTIONS.has(action) || !targetType) return sendJson(res, 400, { error: "Aksi audit tidak dikenal." });

  const db = getFirestore(getAdminApp());
  const actor = await assertActiveActor(uid);
  if (!actor) return sendJson(res, 403, { error: "Akun tidak aktif." });

  const organizationId = String(body.organizationId || actor.organizationId || "").trim();
  const businessId = body.businessId ? String(body.businessId).trim() : null;
  const role = actor.role;
  if (!["owner", "admin", "employee"].includes(role)) return sendJson(res, 403, { error: "Tidak memiliki izin audit." });
  if (actor.organizationId !== organizationId) return sendJson(res, 403, { error: "Organisasi tidak sesuai." });
  if (role !== "owner" && businessId && !(actor.businessIds || []).includes(businessId)) return sendJson(res, 403, { error: "Bisnis di luar jangkauan." });
  if (role === "employee") {
    if (!EMPLOYEE_ACTIONS.has(action)) return sendJson(res, 403, { error: "Aksi tidak diizinkan untuk employee." });
    if (targetId && targetId !== uid) {
      const collection = targetType === "request" ? "requests" : targetType === "taskReport" ? "taskReports" : null;
      if (!collection) return sendJson(res, 403, { error: "Target audit tidak valid." });
      const target = await db.collection(collection).doc(targetId).get();
      if (!target.exists || target.data().userId !== uid) return sendJson(res, 403, { error: "Target audit bukan milik Anda." });
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
  return sendJson(res, 200, { id: reference.id, ...record });
}
