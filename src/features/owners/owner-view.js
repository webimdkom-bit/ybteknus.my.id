import { signOutUser } from "../auth/auth-service.js";
import { createOwnerAccount, deactivateOwner, listOwners } from "./owner-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { escapeHtml } from "../../lib/utils/html.js";

export async function openOwnerManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "owner-overlay";
  overlay.innerHTML = `
    <section class="owner-modal" role="dialog" aria-modal="true" aria-labelledby="owner-title">
      <div class="owner-modal-head"><div><p class="eyebrow">COMPANY ACCESS</p><h2 id="owner-title">Owner management</h2><p>Kelola siapa yang dapat mengatur seluruh operasional perusahaan.</p></div><button class="icon-button owner-close" aria-label="Tutup">×</button></div>
      <div class="owner-manager-grid">
        <form class="owner-form" id="owner-form">
          <h3>Tambah Owner</h3><p class="owner-form-copy">Akun baru akan menerima link untuk membuat password melalui email.</p>
          <div class="field"><label for="owner-name">Nama lengkap</label><input id="owner-name" name="name" placeholder="Nama Owner" required /></div>
          <div class="field"><label for="owner-email">Email perusahaan</label><input id="owner-email" name="email" type="email" placeholder="owner@perusahaan.com" required /></div>
          <p class="owner-form-message" role="status"></p><p class="owner-error" role="alert"></p><button class="primary-button" type="submit">Tambah Owner <span>→</span></button>
        </form>
        <div class="owner-list-wrap"><div class="owner-list-heading"><h3>Daftar Owner</h3><span class="owner-count">0</span></div><div class="managed-owner-list"><p class="owner-empty">Memuat Owner...</p></div></div>
      </div>
    </section>
  `;
  document.body.append(overlay);

  const close = () => overlay.remove();
  overlay.querySelector(".owner-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const list = overlay.querySelector(".managed-owner-list");
  const count = overlay.querySelector(".owner-count");
  const loadOwners = async () => {
    try {
      const owners = await listOwners(profile.organizationId);
      count.textContent = owners.filter((owner) => owner.status === "active").length;
      list.innerHTML = owners.length ? owners.map((owner) => ownerRow(owner, profile.uid)).join("") : `<p class="owner-empty">Belum ada Owner.</p>`;
      list.querySelectorAll("[data-deactivate-owner]").forEach((button) => button.addEventListener("click", async () => {
        const owner = owners.find((item) => item.id === button.dataset.deactivateOwner);
        const activeOwners = owners.filter((item) => item.status === "active");
        if (!owner || activeOwners.length <= 1) {
          overlay.querySelector(".owner-form-message").textContent = "Tambahkan Owner pengganti terlebih dahulu. Owner terakhir tidak dapat dihapus.";
          return;
        }
        if (!window.confirm(`Nonaktifkan akses Owner ${owner.displayName || owner.email}?`)) return;
        button.disabled = true;
        try {
          await deactivateOwner(owner.id);
          logAuditSafe({ profile, action: "account_deactivated", targetType: "user", targetId: owner.id, metadata: { role: "owner", email: owner.email } });
          if (owner.id === profile.uid) {
            await signOutUser();
            return;
          }
          await loadOwners();
        } catch (error) {
          button.disabled = false;
          overlay.querySelector(".owner-form-message").textContent = error.message;
        }
      }));
    } catch (error) {
      list.innerHTML = `<p class="owner-error">${error.message}</p>`;
    }
  };

  await loadOwners();
  overlay.querySelector("#owner-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type=submit]");
    const message = form.querySelector(".owner-form-message");
    const error = form.querySelector(".owner-error");
    submit.disabled = true;
    message.textContent = "";
    error.textContent = "";
    try {
      const data = Object.fromEntries(new FormData(form));
      await createOwnerAccount({ organizationId: profile.organizationId, ...data });
      logAuditSafe({ profile, action: "owner_created", targetType: "user", metadata: { name: data.name, email: data.email } });
      form.reset();
      message.textContent = "Owner berhasil dibuat. Link setup password telah dikirim ke email tersebut.";
      await loadOwners();
    } catch (submissionError) {
      error.textContent = humanizeOwnerError(submissionError);
    } finally {
      submit.disabled = false;
    }
  });
}

function ownerRow(owner, currentUserId) {
  const active = owner.status === "active";
  return `<article class="managed-owner-row ${active ? "" : "is-inactive"}"><div class="owner-row-mark">${escapeHtml((owner.displayName || owner.email || "O").slice(0, 1)).toUpperCase()}</div><div class="managed-owner-info"><strong>${escapeHtml(owner.displayName || "Tanpa nama")}${owner.id === currentUserId ? " <small>(Anda)</small>" : ""}</strong><span>${escapeHtml(owner.email || "Email tidak tersedia")}</span></div><div class="owner-status">${active ? "Aktif" : "Nonaktif"}</div>${active ? `<button class="remove-owner" data-deactivate-owner="${owner.id}">Hapus akses</button>` : ""}</article>`;
}

function humanizeOwnerError(error) {
  const messages = {
    "auth/email-already-in-use": "Email tersebut sudah memiliki akun.",
    "auth/invalid-email": "Format email belum benar.",
    "auth/operation-not-allowed": "Email/password authentication belum aktif di Firebase.",
  };
  return messages[error?.code] || error?.message || "Owner gagal dibuat. Coba lagi.";
}
