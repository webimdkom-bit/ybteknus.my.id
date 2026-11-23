export function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body;
}

export function requirePost(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return false;
  }
  return true;
}
