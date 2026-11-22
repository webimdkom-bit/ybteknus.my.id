import { listBusinessesForOrganization } from "../../lib/firestore/repositories.js";
import { approveEmployeeRegistration, listPendingRegistrations, rejectEmployeeRegistration } from "./registration-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";
import { escapeHtml } from "../../lib/utils/html.js";

export async function openRegistrationManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "registration-overlay";
  overlay.innerHTML = `
    <section class="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title">
      <div class="registration-modal-head"><div><p class="eyebrow">PEOPLE INTAKE</p><h2 id="registration-title">Employee registrations</h2><p>Periksa dan setujui pendaftar yang menunggu akses.</p></div><button class="icon-button registration-close" aria-label="Tutup">×</button></div>
      <div class="registration-list"><p class="registration-empty">Memuat pendaftar...</p></div>
    </section>
  `;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".registration-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  const list = overlay.querySelector(".registration-list");
  const businesses = await listBusinessesForOrganization(profile.organizationId);
  const businessNames = new Map(businesses.map((business) => [business.id, business.name]));
  const loadRegistrations = async () => {
    try {
      const registrations = await listPendingRegistrations(profile.organizationId);
      list.innerHTML = registrations.length ? registrations.map((registration) => registrationRow(registration, businessNames)).join("") : `<div class="registration-empty-state"><strong>All clear.</strong><span>Tidak ada registrasi yang menunggu persetujuan.</span></div>`;
      list.querySelectorAll("[data-registration-action]").forEach((button) => button.addEventListener("click", async () => {
        const registration = registrations.find((item) => item.id === button.dataset.registrationId);
        if (!registration) return;
        button.disabled = true;
        try {
          if (button.dataset.registrationAction === "approve") {
            await approveEmployeeRegistration(registration);
            logAuditSafe({ profile, action: "employee_approved", targetType: "registration", targetId: registration.id, businessId: registration.businessId, metadata: { userId: registration.userId, name: registration.name, email: registration.email } });
            notifySafe({ type: NOTIFICATION_TYPES.registrationApproved, title: "Registrasi disetujui", body: `Akun Anda pada ${registration.businessName || "bisnis"} telah disetujui.`, organizationId: registration.organizationId, businessId: registration.businessId, targetType: "registration", targetId: registration.id, userIds: [registration.userId] });
          } else {
            await rejectEmployeeRegistration(registration);
            logAuditSafe({ profile, action: "employee_rejected", targetType: "registration", targetId: registration.id, businessId: registration.businessId, metadata: { userId: registration.userId, name: registration.name, email: registration.email } });
            notifySafe({ type: NOTIFICATION_TYPES.registrationRejected, title: "Registrasi ditolak", body: `Pengajuan akun Anda pada ${registration.businessName || "bisnis"} ditolak.`, organizationId: registration.organizationId, businessId: registration.businessId, targetType: "registration", targetId: registration.id, userIds: [registration.userId] });
          }
          await loadRegistrations();
        } catch (error) {
          button.disabled = false;
          button.closest(".registration-row").querySelector(".registration-error").textContent = error.message;
        }
      }));
    } catch (error) { list.innerHTML = `<p class="registration-error">${escapeHtml(error.message)}</p>`; }
  };
  await loadRegistrations();
}

function registrationRow(registration, businessNames) {
  return `<article class="registration-row"><div class="registration-avatar">${escapeHtml(registration.name.slice(0, 1)).toUpperCase()}</div><div class="registration-person"><strong>${escapeHtml(registration.name)}</strong><span>${escapeHtml(registration.email)}</span><small>${escapeHtml(businessNames.get(registration.businessId) || registration.businessName || "Bisnis")}</small></div><div class="registration-actions"><button class="approve-registration" data-registration-action="approve" data-registration-id="${registration.id}">Approve</button><button class="reject-registration" data-registration-action="reject" data-registration-id="${registration.id}">Reject</button></div><p class="registration-error" role="alert"></p></article>`;
}
