import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const authService = read("../../src/features/auth/auth-service.js");
const authView = read("../../src/features/auth/auth-view.js");
const main = read("../../src/main.js");
const repositories = read("../../src/lib/firestore/repositories.js");
const css = read("../../src/styles/main.css");

describe("authentication session flow", () => {
  it("signs the new employee out after registration", () => {
    expect(authService).toContain("await signOut(auth);");
    expect(authService.indexOf("await signOut(auth);")).toBeGreaterThan(authService.indexOf("notifySafe({ ...payload, audience: \"admins\""));
  });

  it("exposes a live user-profile watcher", () => {
    expect(repositories).toContain("export function watchUserProfile(uid, callback, onError)");
    expect(repositories).toContain("onSnapshot(doc(db, COLLECTIONS.USERS, uid)");
  });

  it("resolves the session from both the observer and the login form", () => {
    expect(main).toContain("async function resolveSession(profile)");
    expect(main).toContain("renderAuthScreen(app, { onAuthenticated: resolveSession })");
    expect(main).toContain("await resolveSession(profile)");
  });

  it("watches a pending profile and advances on approval", () => {
    expect(main).toContain("stopStatusWatcher = watchUserProfile(profile.uid");
    expect(main).toContain('if (fresh.status === "active")');
    expect(main).toContain("onApproved?.(fresh)");
    expect(main).toContain("function stopProfileStatusWatcher()");
  });

  it("calls the callback after a successful login and keeps the submit button usable", () => {
    expect(authView).toContain("export function renderAuthScreen(app, { onAuthenticated } = {})");
    expect(authView).toContain("const profile = await signIn(data.email, data.password)");
    expect(authView).toContain("await onAuthenticated(profile)");
    expect(authView).toContain('submit.querySelector("#auth-submit-label").textContent = mode === "login" ? "Masuk" : "Kirim pendaftaran";');
  });

  it("shows a registration notice on the login screen", () => {
    expect(authView).toContain("export function setAuthNotice(message)");
    expect(authView).toContain("Pendaftaran berhasil. Akun Anda menunggu persetujuan Owner.");
    expect(authView).toContain('class="auth-notice"');
    expect(css).toContain(".auth-notice");
  });
});
