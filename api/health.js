import { sendJson } from "../server/shared/http.js";

export default async function handler(req, res) {
  return sendJson(res, 200, { status: "ok" });
}
