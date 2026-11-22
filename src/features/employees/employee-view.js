import { getBusiness, listEmployeesForBusiness, updateUserProfile } from "../../lib/firestore/repositories.js";
import { logAuditSafe } from "../audit-trail/index.js";

export async function openEmployeeManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "registration-overlay employee-manager-overlay";
  overlay.innerHTML = `<section class="registration-modal employee-manager-modal" role="dialog" aria-modal="true" aria-labelledby="employee-manager-title"><div class="registration-modal-head"><div><p class="eyebrow">TEAM OPERATIONS</p><h2 id="employee-manager-title">Employee management</h2><p>Lihat dan kelola employee pada bisnis yang menjadi tanggung jawab Anda.</p></div><button class="icon-button registration-close" aria-label="Tutup">×</button></div><div class="employee-manager-list"><p class="registration-empty">Memuat employee...</p></div></section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".registration-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  const list = overlay.querySelector(".employee-manager-list");
  try {
    const businesses = (await Promise.all((profile.businessIds || []).map((businessId) => getBusiness(businessId)))).filter(Boolean);
    const groups = await Promise.all(businesses.map(async (business) => ({ business, employees: await listEmployeesForBusiness(profile.organizationId, business.id) })));
    const employees = groups.flatMap(({ business, employees: items }) => items.map((employee) => ({ employee, business })));
    list.innerHTML = employees.length ? employees.map(({ employee, business }) => employeeRow(employee, business)).join("") : `<div class="registration-empty-state"><strong>Belum ada employee.</strong><span>Employee pada bisnis Anda akan tampil di sini.</span></div>`;
    list.querySelectorAll("[data-toggle-employee]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await updateUserProfile(button.dataset.toggleEmployee, { status: button.dataset.nextStatus });
        logAuditSafe({ profile, action: "account_status_changed", targetType: "user", targetId: button.dataset.toggleEmployee, metadata: { status: button.dataset.nextStatus } });
        button.closest(".employee-management-row").querySelector(".employee-status").textContent = button.dataset.nextStatus === "active" ? "Aktif" : "Nonaktif";
        button.textContent = button.dataset.nextStatus === "active" ? "Nonaktifkan" : "Aktifkan";
        button.dataset.nextStatus = button.dataset.nextStatus === "active" ? "inactive" : "active";
      } catch (error) {
        button.closest(".employee-management-row").querySelector(".registration-error").textContent = error.message;
      }
      button.disabled = false;
    }));
  } catch (error) { list.innerHTML = `<p class="registration-error">${error.message}</p>`; }
}

function employeeRow(employee, business) {
  const active = employee.status === "active";
  return `<article class="employee-management-row"><div class="registration-avatar">${(employee.displayName || employee.email || "E").slice(0, 1).toUpperCase()}</div><div class="registration-person"><strong>${employee.displayName || "Tanpa nama"}</strong><span>${employee.email || "Email tidak tersedia"}</span><small>${business.name}</small></div><span class="employee-status">${active ? "Aktif" : "Nonaktif"}</span><button class="approve-registration" data-toggle-employee="${employee.id}" data-next-status="${active ? "inactive" : "active"}">${active ? "Nonaktifkan" : "Aktifkan"}</button><p class="registration-error" role="alert"></p></article>`;
}
