import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../server/shared/admin.js";
import { verifyFirebaseToken } from "../server/shared/auth.js";
import { generateUploadSignature } from "../server/shared/cloudinary.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const taskId = String(body.taskId || "").trim();
  const fileName = String(body.fileName || "").trim().slice(0, 120);
  const resourceType = body.resourceType === "raw" ? "raw" : body.resourceType === "image" ? "image" : null;
  if (!taskId || !fileName || !resourceType) return sendJson(res, 400, { error: "taskId, fileName, dan resourceType wajib diisi." });

  const db = getFirestore(getAdminApp());
  const [taskSnapshot, actorSnapshot] = await Promise.all([
    db.collection("tasks").doc(taskId).get(),
    db.collection("users").doc(uid).get(),
  ]);
  if (!taskSnapshot.exists) return sendJson(res, 404, { error: "Tugas tidak ditemukan." });
  const task = taskSnapshot.data();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor || actor.organizationId !== task.organizationId) return sendJson(res, 403, { error: "Tugas di luar jangkauan." });
  const allowed = actor.role === "owner"
    || (task.assignedTo || []).includes(uid)
    || (actor.role === "admin" && actor.businessIds?.includes(task.businessId));
  if (!allowed) return sendJson(res, 403, { error: "Anda tidak ditugaskan pada tugas ini." });

  const publicId = `evidence/${uid}/${taskId}/${fileName}`.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const folder = `tasks/${uid}`;
  const signature = await generateUploadSignature({ publicId, folder, resourceType });
  return sendJson(res, 200, { ...signature, taskId, fileName });
}
