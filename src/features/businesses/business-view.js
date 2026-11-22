import { listBusinessesForOrganization, listEmployees, transferEmployee, updateBusiness } from "../../lib/firestore/repositories.js";
import { createOwnerBusiness } from "./business-service.js";

export async function openBusinessManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "business-overlay";
  overlay.innerHTML = `
    <section class="business-modal" role="dialog" aria-modal="true" aria-labelledby="business-title">
      <div class="business-modal-head"><div><p class="eyebrow">OWNER WORKSPACE</p><h2 id="business-title">Your businesses</h2><p>Kelola unit bisnis dalam organization Anda.</p></div><button class="icon-button business-close" aria-label="Tutup">×</button></div>
      <div class="business-manager-grid">
        <form class="business-form" id="business-form">
          <h3 class="business-form-title">Tambah bisnis</h3><p class="business-form-copy">Buat dan kelola unit bisnis dalam organization Anda.</p>
          <div class="field"><label for="business-name">Nama bisnis</label><input id="business-name" name="name" placeholder="Contoh: Kopi Koma" required /></div>
          <div class="field"><label for="business-city">Kota</label><input id="business-city" name="city" placeholder="Bandung" required /></div>
          <p class="business-error" role="alert"></p><button class="primary-button" type="submit"><span class="business-submit-label">Tambah bisnis</span> <span>→</span></button>
        </form>
        <div class="business-list-wrap"><div class="business-list-heading"><h3>Daftar bisnis</h3><span class="business-count">0</span></div><div class="managed-business-list"><p class="business-empty">Memuat bisnis...</p></div></div>
        <div class="employee-transfer-panel"><div><h3>Transfer employee</h3><p class="business-form-copy">Pindahkan employee tanpa mengubah histori absensi dan tugas lama.</p></div><form class="employee-transfer-form"><div class="field"><label for="transfer-employee">Employee</label><select id="transfer-employee" required><option value="">Memuat employee...</option></select></div><div class="field"><label for="transfer-business">Bisnis tujuan</label><select id="transfer-business" required><option value="">Pilih bisnis tujuan</option></select></div><p class="transfer-message" role="status"></p><p class="business-error transfer-error" role="alert"></p><button class="primary-button" type="submit">Transfer employee <span>→</span></button></form></div>
      </div>
    </section>
  `;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".business-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  const list = overlay.querySelector(".managed-business-list");
  const count = overlay.querySelector(".business-count");
  const employeeSelect = overlay.querySelector("#transfer-employee");
  const transferBusinessSelect = overlay.querySelector("#transfer-business");
  let editingBusinessId = null;
  let transferEmployees = [];
  let transferBusinesses = [];
  const loadBusinesses = async () => {
    try {
      const businesses = await listBusinessesForOrganization(profile.organizationId);
      transferBusinesses = businesses;
      transferBusinessSelect.innerHTML = businesses.length ? `<option value="">Pilih bisnis tujuan</option>${businesses.filter((business) => business.status !== "inactive").map((business) => `<option value="${business.id}">${business.name}</option>`).join("")}` : `<option value="">Belum ada bisnis aktif</option>`;
      count.textContent = businesses.length;
      list.innerHTML = businesses.length ? businesses.map((business) => businessRow(business)).join("") : `<p class="business-empty">Belum ada bisnis. Tambahkan bisnis pertama Anda.</p>`;
       list.querySelectorAll("[data-toggle-registration]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        await updateBusiness(button.dataset.toggleRegistration, { acceptingRegistrations: button.dataset.nextValue === "true" });
         await loadBusinesses();
       }));
       list.querySelectorAll("[data-toggle-status]").forEach((button) => button.addEventListener("click", async () => {
         button.disabled = true;
         await updateBusiness(button.dataset.toggleStatus, { status: button.dataset.nextStatus, acceptingRegistrations: button.dataset.nextStatus === "active" });
         await loadBusinesses();
       }));
       list.querySelectorAll("[data-edit-business]").forEach((button) => button.addEventListener("click", () => {
         const business = businesses.find((item) => item.id === button.dataset.editBusiness);
         if (!business) return;
         editingBusinessId = business.id;
         overlay.querySelector(".business-form-title").textContent = "Edit bisnis";
         overlay.querySelector(".business-submit-label").textContent = "Simpan perubahan";
         overlay.querySelector("#business-name").value = business.name || "";
         overlay.querySelector("#business-city").value = business.city || "";
       }));
    } catch (error) { list.innerHTML = `<p class="business-error">${error.message}</p>`; }
  };
  await loadBusinesses();
  try {
    transferEmployees = await listEmployees(profile.organizationId);
    employeeSelect.innerHTML = transferEmployees.length ? `<option value="">Pilih employee</option>${transferEmployees.map((employee) => `<option value="${employee.id}" data-current-business="${employee.businessIds?.[0] || ""}">${employee.displayName || employee.email} · ${transferBusinesses.find((business) => business.id === employee.businessIds?.[0])?.name || "Belum ditempatkan"}</option>`).join("")}` : `<option value="">Belum ada employee</option>`;
  } catch (error) { employeeSelect.innerHTML = `<option value="">Gagal memuat employee</option>`; }
  overlay.querySelector("#business-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".business-error");
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      if (editingBusinessId) await updateBusiness(editingBusinessId, { name: data.name.trim(), city: data.city.trim() });
      else await createOwnerBusiness({ organizationId: profile.organizationId, ...data });
      form.reset();
      error.textContent = "";
      editingBusinessId = null;
      form.querySelector(".business-form-title").textContent = "Tambah bisnis";
      form.querySelector(".business-submit-label").textContent = "Tambah bisnis";
      await loadBusinesses();
    } catch (submissionError) { error.textContent = submissionError.message; }
    submit.disabled = false;
  });
  overlay.querySelector(".employee-transfer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".transfer-error");
    const message = form.querySelector(".transfer-message");
    const employeeOption = employeeSelect.options[employeeSelect.selectedIndex];
    const businessId = transferBusinessSelect.value;
    error.textContent = "";
    message.textContent = "";
    if (!employeeOption?.value || !businessId) { error.textContent = "Pilih employee dan bisnis tujuan."; return; }
    if (employeeOption.dataset.currentBusiness === businessId) { error.textContent = "Employee sudah berada di bisnis tersebut."; return; }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await transferEmployee({ userId: employeeOption.value, organizationId: profile.organizationId, businessId });
      employeeOption.dataset.currentBusiness = businessId;
      message.textContent = `${employeeOption.textContent.split(" · ")[0]} berhasil dipindahkan.`;
    } catch (transferError) { error.textContent = transferError.message; }
    submit.disabled = false;
  });
}

function businessRow(business) {
  const accepting = business.acceptingRegistrations !== false;
  const active = business.status !== "inactive";
  return `<div class="managed-business-row ${active ? "" : "is-inactive"}"><div class="business-row-mark">${business.name.slice(0, 1).toUpperCase()}</div><div class="managed-business-info"><strong>${business.name}</strong><span>${business.city || "Kota belum diatur"} · ${active ? "Aktif" : "Nonaktif"}</span></div><button class="business-edit-button" data-edit-business="${business.id}">Edit</button><button class="registration-toggle ${accepting ? "is-open" : ""}" data-toggle-registration="${business.id}" data-next-value="${!accepting}">${accepting ? "Registrasi terbuka" : "Registrasi ditutup"}</button><button class="business-status-button" data-toggle-status="${business.id}" data-next-status="${active ? "inactive" : "active"}">${active ? "Nonaktifkan" : "Aktifkan"}</button></div>`;
}
