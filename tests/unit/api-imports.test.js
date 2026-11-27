import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import notifyHandler from "../../api/notify.js";

const apiDir = fileURLToPath(new URL("../../api/", import.meta.url));
const handlers = readdirSync(apiDir).filter((name) => name.endsWith(".js"));

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vercel API handlers", () => {
  it("has all 13 endpoints", () => {
    expect(handlers.sort()).toEqual([
      "attendance-correction.js",
      "attendance-review.js",
      "attendance.js",
      "audit-log.js",
      "file-access.js",
      "file-delete.js",
      "file-metadata.js",
      "file-upload.js",
      "health.js",
      "notify.js",
      "profile-upload.js",
      "provision-user.js",
      "switch-organization.js",
    ]);
  });

  it.each(handlers)("imports %s without resolution errors", async (name) => {
    const module = await import(new URL(`../../api/${name}`, import.meta.url).href);
    expect(typeof module.default).toBe("function");
  }, 20000);

  it("rejects cron GET on notify without a valid CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const res = createResponse();
    await notifyHandler({ method: "GET", headers: { authorization: "Bearer wrong" } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Unauthorized." });
  });
});
