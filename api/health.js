import { sendJson } from "../server/shared/http.js";
import { isCloudinaryConfigured } from "../server/shared/cloudinary.js";

export default async function handler(req, res) {
  return sendJson(res, 200, { status: "ok", cloudinary: isCloudinaryConfigured() ? "configured" : "missing" });
}
