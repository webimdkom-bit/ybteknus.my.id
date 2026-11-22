import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./_shared/admin";
import { verifyFirebaseToken } from "./_shared/auth";
import { generateUploadSignature } from "./_shared/cloudinary";

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
  const taskId = String(body.taskId || "").trim();
  const fileName = String(body.fileName || "").trim().slice(0, 120);
  const resourceType = body.resourceType === "raw" ? "raw" : body.resourceType === "image" ? "image" : null;
  if (!taskId || !fileName || !resourceType) {
    return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "taskId, fileName, dan resourceType wajib diisi." }) };
  }

  const db = getFirestore(getAdminApp());
  const [taskSnapshot, actorSnapshot] = await Promise.all([
    db.collection("tasks").doc(taskId).get(),
    db.collection("users").doc(uid).get(),
  ]);
  if (!taskSnapshot.exists) {
    return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Tugas tidak ditemukan." }) };
  }
  const task = taskSnapshot.data();
  const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
  if (!actor || actor.organizationId !== task.organizationId) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Tugas di luar jangkauan." }) };
  }
  const allowed = actor.role === "owner"
    || (task.assignedTo || []).includes(uid)
    || (actor.role === "admin" && actor.businessIds?.includes(task.businessId));
  if (!allowed) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Anda tidak ditugaskan pada tugas ini." }) };
  }

  const publicId = `evidence/${uid}/${taskId}/${fileName}`.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const folder = `tasks/${uid}`;
  const signature = await generateUploadSignature({ publicId, folder, resourceType });

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...signature, taskId, fileName }),
  };
};
