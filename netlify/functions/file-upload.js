import { verifyFirebaseToken } from "./_shared/auth";
import { generateUploadSignature } from "./_shared/cloudinary";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  const decoded = await verifyFirebaseToken(event.headers?.authorization);
  const uid = decoded?.uid;
  if (!uid) {
    return { statusCode: 401, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Unauthorized." }) };
  }

  const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
  const taskId = String(body.taskId || "").trim();
  const fileName = String(body.fileName || "").trim();
  if (!taskId || !fileName) {
    return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "taskId dan fileName wajib diisi." }) };
  }

  const publicId = `evidence/${uid}/${taskId}/${fileName}`.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const folder = `tasks/${uid}`;
  const signature = await generateUploadSignature({ publicId, folder });

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...signature, taskId, fileName }),
  };
};
