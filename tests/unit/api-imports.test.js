import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiDir = fileURLToPath(new URL("../../api/", import.meta.url));
const handlers = readdirSync(apiDir).filter((name) => name.endsWith(".js"));

describe("Vercel API handlers", () => {
  it("has all 8 endpoints", () => {
    expect(handlers.sort()).toEqual([
      "audit-log.js",
      "file-access.js",
      "file-delete.js",
      "file-metadata.js",
      "file-upload.js",
      "health.js",
      "notify.js",
      "provision-user.js",
    ]);
  });

  it.each(handlers)("imports %s without resolution errors", async (name) => {
    const module = await import(new URL(`../../api/${name}`, import.meta.url).href);
    expect(typeof module.default).toBe("function");
  }, 20000);
});
