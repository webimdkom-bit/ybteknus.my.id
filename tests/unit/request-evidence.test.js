import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const view = read("../../src/features/requests/request-view.js");
const uploadApi = read("../../api/file-upload.js");
const uploadService = read("../../src/features/files/file-upload-service.js");
const css = read("../../src/styles/main.css");

describe("request evidence photo", () => {
  it("replaces the link field with an image upload in the request form", () => {
    expect(view).toContain('<input id="request-evidence" type="file" accept="image/*"');
    expect(view).toContain("data-request-evidence-pick");
    expect(view).not.toContain('name="evidenceUrl" type="url"');
    expect(view).toContain("data.evidenceUrl = evidenceUrl");
    expect(view).toContain("requestRequestEvidenceSignature");
    expect(view).toContain("category: \"request-evidence\"");
  });

  it("shows a clickable thumbnail to employees and reviewers", () => {
    expect(view).toContain('safeUrl(request.evidenceUrl)');
    expect(view).toContain('data-request-photos="${escapeHtml(request.id)}"');
    expect(view).toContain("bindRequestPhotoButtons(overlay, requests)");
    expect(view).toContain("bindRequestPhotoButtons(overlay, pending)");
    expect(css).toContain(".request-photo-button");
  });

  it("opens an inline photo viewer without a new tab", () => {
    expect(view).toContain('photoViewer.className = "task-photo-viewer"');
    expect(view).toContain('photoViewer.querySelector(".task-photo-close")');
    expect(view).toContain('overlay.querySelector(".task-photo-viewer").hidden = false');
    expect(view).not.toContain("window.open");
    expect(view).not.toContain('target="_blank"');
    expect(css).toContain(".task-photo-viewer[hidden]");
  });

  it("keeps the photo preview and viewer inside narrow phones", () => {
    expect(css).toContain(".task-report-photos[hidden], .task-photo-list[hidden] { display: none; }");
    expect(css).toContain(".task-photo-list img { max-width: min(320px, 100%);");
    expect(css).toContain("max-height: 90vh; max-height: 90dvh;");
    expect(css).toContain(".file-close, .task-photo-close { width: 44px;");
  });

  it("scopes request upload signatures to the active actor organization and business", () => {
    expect(uploadApi).toContain("const requestId = String(body.requestId");
    expect(uploadApi).toContain("[taskId, reportId, requestId].filter(Boolean).length !== 1");
    expect(uploadApi).toContain("if (requestId) {");
    expect(uploadApi).toContain("actor.organizationId !== organizationId");
    expect(uploadApi).toContain("(actor.businessIds || []).includes(businessId)");
    expect(uploadApi).toContain("evidence/${uid}/requests/${requestId}/${fileName}");
    expect(uploadService).toContain("export async function requestRequestEvidenceSignature");
    expect(uploadService).toContain("resourceType: \"image\"");
  });
});
