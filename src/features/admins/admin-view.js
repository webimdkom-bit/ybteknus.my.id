import { listBusinessesForOrganization, listMembershipsForUser } from "../../lib/firestore/repositories.js";
import { activateAdmin, ADMIN_PERMISSION_OPTIONS, createAdminAccount, deactivateAdmin, listAdmins, updateAdminAccess } from "./admin-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { escapeHtml } from "../../lib/utils/html.js";

export async function openAdminManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "owner-overlay admin-overlay";
  overlay.innerHTML = `
    <section class="owner-modal admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <div class="owner-modal-head"><div><p class="eyebrow">OPERATIONS ACCESS</p><h2 id="admin-title">Admin management</h2><p>Buat Admin dan atur bisnis serta permission yang dapat mereka kelola.</p></div><button class="icon-button owner-close" aria-label="Tutup">×</button></div>
      <div class="owner-manager-grid">
        <form class="owner-form admin-form" id="admin-form">
          <h3 class="admin-form-title">Tambah Admin</h3><p class="owner-form-copy">Akun baru menerima link untuk membuat password melalui email.</p>
          <div class="field"><label for="admin-name">Nama lengkap</label><input id="admin-name" name="name" placeholder="Nama Admin" required /></div>
          <div class="field"><label for="admin-email">Email perusahaan</label><input id="admin-email" name="email" type="email" placeholder="admin@perusahaan.com" required /></div>
          <div class="admin-access-options"><p class="field-label">Akses bisnis dan permission</p><div class="admin-business-list"><p class="owner-empty">Memuat bisnis...</p></div></div>
          <p class="owner-form-message" role="status"></p><p class="owner-error" role="alert"></p><button class="primary-button" type="submit"><span class="admin-submit-label">Tambah Admin</span> <span>→</span></button>
        </form>
        <div class="owner-list-wrap"><div class="owner-list-heading"><h3>Daftar Admin</h3><span class="owner-count">0</span></div><div class="managed-owner-list admin-list"><p class="owner-empty">Memuat Admin...</p></div></div>
      </div>
    </section>
  `;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".owner-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const form = overlay.querySelector("#admin-form");
  const businessList = overlay.querySelector(".admin-business-list");
  const adminList = overlay.querySelector(".admin-list");
  const count = overlay.querySelector(".owner-count");
  const businesses = await listBusinessesForOrganization(profile.organizationId);
  renderBusinessAccessOptions(businessList, businesses);
  let admins = [];
  let editingAdmin = null;

  const loadAdmins = async () => {
    try {
      admins = await listAdmins(profile.organizationId);
      count.textContent = admins.filter((admin) => admin.status === "active").length;
      adminList.innerHTML = admins.length ? admins.map((admin) => adminRow(admin, businesses)).join("") : `<p class="owner-empty">Belum ada Admin.</p>`;
      adminList.querySelectorAll("[data-edit-admin]").forEach((button) => button.addEventListener("click", async () => {
        editingAdmin = admins.find((admin) => admin.id === button.dataset.editAdmin);
        if (editingAdmin) {
          const memberships = await listMembershipsForUser(editingAdmin.id, profile.organizationId);
          fillAdminForm(editingAdmin, businesses, memberships, form, businessList, overlay);
        }
      }));
      adminList.querySelectorAll("[data-deactivate-admin]").forEach((button) => button.addEventListener("click", async () => {
        if (!window.confirm("Nonaktifkan akses Admin ini?")) return;
        button.disabled = true;
         try {
           await deactivateAdmin(button.dataset.deactivateAdmin);
           logAuditSafe({ profile, action: "admin_deactivated", targetType: "user", targetId: button.dataset.deactivateAdmin });
           await loadAdmins();
         }
        catch (error) { overlay.querySelector(".owner-error").textContent = error.message; button.disabled = false; }
      }));
      adminList.querySelectorAll("[data-activate-admin]").forEach((button) => button.addEventListener("click", async () => {
        if (!window.confirm("Aktifkan kembali akses Admin ini?")) return;
        button.disabled = true;
        try {
          await activateAdmin(button.dataset.activateAdmin);
          logAuditSafe({ profile, action: "admin_activated", targetType: "user", targetId: button.dataset.activateAdmin });
          await loadAdmins();
        } catch (error) { overlay.querySelector(".owner-error").textContent = error.message; button.disabled = false; }
      }));
    } catch (error) { adminList.innerHTML = `<p class="owner-error">${error.message}</p>`; }
  };

  await loadAdmins();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button[type=submit]");
    const message = form.querySelector(".owner-form-message");
    const error = form.querySelector(".owner-error");
    const access = collectAccess(businessList);
    if (!access.length) { error.textContent = "Pilih minimal satu bisnis untuk Admin."; return; }
    submit.disabled = true;
    message.textContent = "";
    error.textContent = "";
    try {
      const data = Object.fromEntries(new FormData(form));
      if (editingAdmin) {
        await updateAdminAccess({ userId: editingAdmin.id, organizationId: profile.organizationId, access });
        logAuditSafe({ profile, action: "admin_access_changed", targetType: "membership", targetId: editingAdmin.id, metadata: { access } });
        message.textContent = "Akses Admin diperbarui.";
      } else {
        await createAdminAccount({ organizationId: profile.organizationId, ...data, access });
        logAuditSafe({ profile, action: "admin_created", targetType: "user", metadata: { name: data.name, email: data.email, access } });
        message.textContent = "Admin berhasil dibuat. Link setup password telah dikirim.";
      }
      resetAdminForm(form, businessList, businesses, overlay);
      editingAdmin = null;
      await loadAdmins();
    } catch (submissionError) { error.textContent = humanizeAdminError(submissionError); }
    submit.disabled = false;
  });
}

function renderBusinessAccessOptions(container, businesses, selected = []) {
  const selectedMap = new Map(selected.map((item) => [item.businessId, item.permissions || []]));
  container.innerHTML = businesses.length ? businesses.map((business) => {
    const permissions = selectedMap.get(business.id) || [];
    return `<fieldset class="admin-business-access"><label class="admin-business-check"><input type="checkbox" data-admin-business="${business.id}" ${selectedMap.has(business.id) ? "checked" : ""} /> <strong>${business.name}</strong><span>${business.city || "Kota belum diatur"}</span></label><div class="admin-permission-grid">${ADMIN_PERMISSION_OPTIONS.map((permission) => `<label><input type="checkbox" data-admin-permission="${permission.id}" data-permission-business="${business.id}" ${permissions.includes(permission.id) ? "checked" : ""} ${selectedMap.has(business.id) ? "" : "disabled"} />${permission.label}</label>`).join("")}</div></fieldset>`;
  }).join("") : `<p class="owner-empty">Belum ada bisnis aktif.</p>`;
  container.querySelectorAll("[data-admin-business]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    container.querySelectorAll(`[data-permission-business="${checkbox.dataset.adminBusiness}"]`).forEach((permission) => { permission.disabled = !checkbox.checked; });
  }));
}

function collectAccess(container) {
  return [...container.querySelectorAll("[data-admin-business]:checked")].map((business) => ({
    businessId: business.dataset.adminBusiness,
    permissions: [...container.querySelectorAll(`[data-permission-business="${business.dataset.adminBusiness}"]:checked`)].map((permission) => permission.dataset.adminPermission),
  }));
}

function fillAdminForm(admin, businesses, memberships, form, businessList, overlay) {
  form.querySelector("#admin-name").value = admin.displayName || "";
  form.querySelector("#admin-email").value = admin.email || "";
  form.querySelector("#admin-email").disabled = true;
  form.querySelector(".admin-form-title").textContent = "Atur akses Admin";
  form.querySelector(".admin-submit-label").textContent = "Simpan akses";
  const selected = memberships.filter((membership) => membership.role === "admin").map((membership) => ({ businessId: membership.businessId, permissions: membership.permissions || [] }));
  renderBusinessAccessOptions(businessList, businesses, selected);
  overlay.querySelector(".owner-form-message").textContent = "Pilih ulang bisnis dan permission untuk Admin ini.";
}

function resetAdminForm(form, businessList, businesses, overlay) {
  form.reset();
  form.querySelector("#admin-email").disabled = false;
  form.querySelector(".admin-form-title").textContent = "Tambah Admin";
  form.querySelector(".admin-submit-label").textContent = "Tambah Admin";
  renderBusinessAccessOptions(businessList, businesses);
  overlay.querySelector(".owner-form-message").textContent = "";
}

function adminRow(admin, businesses) {
  const names = (admin.businessIds || []).map((id) => businesses.find((business) => business.id === id)?.name || "Bisnis").join(", ");
  return `<article class="managed-owner-row ${admin.status === "active" ? "" : "is-inactive"}"><div class="owner-row-mark">${escapeHtml((admin.displayName || admin.email || "A").slice(0, 1)).toUpperCase()}</div><div class="managed-owner-info"><strong>${escapeHtml(admin.displayName || "Tanpa nama")}</strong><span>${escapeHtml(admin.email || "Email tidak tersedia")}</span><small>${escapeHtml(names || "Belum ada bisnis")}</small></div><div class="owner-status">${admin.status === "active" ? "Aktif" : "Nonaktif"}</div>${admin.status === "active" ? `<button class="remove-owner" data-edit-admin="${admin.id}">Atur akses</button><button class="remove-owner" data-deactivate-admin="${admin.id}">Nonaktifkan</button>` : `<button class="remove-owner" data-activate-admin="${admin.id}">Aktifkan</button>`}</article>`;
}

function humanizeAdminError(error) {
  const messages = {
    "auth/email-already-in-use": "Email tersebut sudah memiliki akun.",
    "auth/invalid-email": "Format email belum benar.",
    "auth/operation-not-allowed": "Email/password authentication belum aktif di Firebase.",
  };
  return messages[error?.code] || error?.message || "Admin gagal dibuat. Coba lagi.";
}
