import { verifyFirebaseToken } from "../server/shared/auth.js";
import { generateUploadSignature } from "../server/shared/cloudinary.js";
import { parseBody, requirePost, sendJson } from "../server/shared/http.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const decoded = await verifyFirebaseToken(req.headers?.authorization).catch(() => null);
  const uid = decoded?.uid;
  if (!uid) return sendJson(res, 401, { error: "Unauthorized." });

  const body = parseBody(req);
  const fileName = String(body.fileName || "").trim().slice(0, 120);
  if (!fileName) return sendJson(res, 400, { error: "fileName wajib diisi." });

  const publicId = `profile/${uid}/${fileName}`.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const folder = `profiles/${uid}`;
  const signature = await generateUploadSignature({ publicId, folder, resourceType: "image" });
  return sendJson(res, 200, { ...signature, uid });
}
