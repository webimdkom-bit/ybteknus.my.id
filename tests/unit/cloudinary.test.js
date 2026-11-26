import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isCloudinaryConfigured } from "../../server/shared/cloudinary.js";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const cloudinary = read("../../server/shared/cloudinary.js");
const uploadService = read("../../src/features/files/file-upload-service.js");
const upload = read("../../api/file-upload.js");
const access = read("../../api/file-access.js");
const remove = read("../../api/file-delete.js");
const health = read("../../api/health.js");
const audit = read("../../api/audit-log.js");

describe("Cloudinary wiring", () => {
  it("uses v2 SDK directly instead of cloudinary.v2", () => {
    expect(cloudinary).toContain("cloudinary.config(");
    expect(cloudinary).toContain("cloudinary.utils.api_sign_request(");
    expect(cloudinary).not.toContain("cloudinary.v2");
    expect(upload).not.toContain("cloudinary.v2");
    expect(access).not.toContain("cloudinary.v2");
    expect(remove).not.toContain("cloudinary.v2");
  });

  it("reports missing configuration instead of throwing", () => {
    const previous = {
      cloud: process.env.CLOUDINARY_CLOUD_NAME,
      key: process.env.CLOUDINARY_API_KEY,
      secret: process.env.CLOUDINARY_API_SECRET,
    };
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    expect(isCloudinaryConfigured()).toBe(false);
    process.env.CLOUDINARY_CLOUD_NAME = previous.cloud;
    process.env.CLOUDINARY_API_KEY = previous.key;
    process.env.CLOUDINARY_API_SECRET = previous.secret;
  });

  it("exposes Cloudinary status through health", () => {
    expect(health).toContain('isCloudinaryConfigured() ? "configured" : "missing"');
    expect(upload).toContain("Cloudinary belum dikonfigurasi.");
    expect(access).toContain("Cloudinary belum dikonfigurasi.");
    expect(remove).toContain("Cloudinary belum dikonfigurasi.");
  });

  it("sends api_key for signed uploads", () => {
    expect(cloudinary).toContain("apiKey: process.env.CLOUDINARY_API_KEY");
    expect(uploadService).toContain('formData.append("api_key", signature.apiKey)');
  });

  it("reports upload progress", () => {
    expect(uploadService).toContain("request.upload.onprogress");
    expect(uploadService).toContain("onProgress(");
  });
});

describe("employee audit allowances", () => {
  it("allows employee report, task completion, and daily report actions", () => {
    expect(audit).toContain('"task_completed"');
    expect(audit).toContain('"daily_report_submitted"');
    expect(audit).toContain('"task_progress_updated"');
    expect(audit).toContain('task: "tasks"');
    expect(audit).toContain('dailyReport: "dailyReports"');
    expect(audit).toContain('file: "files"');
  });
});
