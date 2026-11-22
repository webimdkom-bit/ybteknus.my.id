import { getBusiness, listBusinessesForOrganization } from "../../lib/firestore/repositories.js";
import { addShift, listShifts } from "./schedule-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";

export async function openScheduleManager({ profile, onClose }) {
  const organizationId = profile.organizationId;
  let businessId = profile.businessIds?.[0] || null;
  const overlay = document.createElement("div");
  overlay.className = "schedule-overlay";
  overlay.innerHTML = `
    <section class="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
      <div class="schedule-modal-head"><div><p class="eyebrow">WORK SCHEDULES</p><h2 id="schedule-title">Shift & jadwal</h2><p>Buat pola kerja yang bisa dipakai untuk perhitungan absensi.</p></div><button class="icon-button schedule-close" aria-label="Tutup">×</button></div>
      <div class="schedule-layout">
        <form class="shift-form" id="shift-form">
          <div class="field"><label for="shift-name">Nama shift</label><input id="shift-name" name="name" placeholder="Shift pagi" required /></div>
          <div class="field"><label for="shift-business">Bisnis</label><select id="shift-business" name="businessId" required><option value="">Memuat bisnis...</option></select></div>
          <div class="schedule-fields"><div class="field"><label for="shift-start">Jam masuk</label><input id="shift-start" name="startTime" type="time" value="08:00" required /></div><div class="field"><label for="shift-end">Jam pulang</label><input id="shift-end" name="endTime" type="time" value="17:00" required /></div></div>
          <div class="schedule-fields"><div class="field"><label for="shift-break">Istirahat (menit)</label><input id="shift-break" name="breakMinutes" type="number" min="0" value="60" /></div><div class="field"><label for="shift-tolerance">Toleransi (menit)</label><input id="shift-tolerance" name="toleranceMinutes" type="number" min="0" value="15" /></div></div>
          <div class="field"><label>Hari kerja</label><div class="weekday-list">${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day, index) => `<label><input type="checkbox" name="workDays" value="${["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][index]}" ${index < 5 ? "checked" : ""} />${day}</label>`).join("")}</div></div>
          <p class="schedule-error" role="alert"></p><button class="primary-button" type="submit">Simpan shift <span>→</span></button>
        </form>
        <div class="shift-list-wrap"><div class="shift-list-head"><h3>Shift tersimpan</h3><span class="shift-count">0</span></div><div class="shift-list"><p class="shift-empty">Belum ada shift untuk bisnis ini.</p></div></div>
      </div>
    </section>
  `;
  document.body.append(overlay);
  const close = () => { overlay.remove(); onClose?.(); };
  overlay.querySelector(".schedule-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  const list = overlay.querySelector(".shift-list");
  const count = overlay.querySelector(".shift-count");
  const businessSelect = overlay.querySelector("#shift-business");
  const businesses = profile.role === "owner"
    ? await listBusinessesForOrganization(organizationId)
    : (await Promise.all((profile.businessIds || []).map((businessId) => getBusiness(businessId)))).filter(Boolean);
  const visibleBusinesses = businesses.filter((business) => business.status !== "inactive");
  businessSelect.innerHTML = visibleBusinesses.length
    ? `<option value="">Pilih bisnis</option>${visibleBusinesses.map((business) => `<option value="${business.id}">${business.name}</option>`).join("")}`
    : `<option value="">Belum ada bisnis tersedia</option>`;
  if (businessId && visibleBusinesses.some((business) => business.id === businessId)) businessSelect.value = businessId;
  businessSelect.addEventListener("change", () => { businessId = businessSelect.value || null; loadShifts(); });
  const loadShifts = async () => {
    try {
      const shifts = businessId ? await listShifts(organizationId, businessId) : [];
      count.textContent = shifts.length;
      list.innerHTML = shifts.length ? shifts.map((shift) => `<div class="shift-row"><div><strong>${shift.name}</strong><span>${shift.startTime} – ${shift.endTime} · toleransi ${shift.toleranceMinutes}m</span></div><b>${shift.workDays?.length || 0} hari</b></div>`).join("") : `<p class="shift-empty">Belum ada shift untuk bisnis ini.</p>`;
    } catch (error) { list.innerHTML = `<p class="shift-error">${error.message}</p>`; }
  };
  loadShifts();
  overlay.querySelector("#shift-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    data.workDays = [...form.querySelectorAll("input[name=workDays]:checked")].map((input) => input.value);
    const error = form.querySelector(".schedule-error");
    try {
      if (!businessId) throw new Error("Pilih bisnis terlebih dahulu.");
      const shift = await addShift({ ...data, organizationId, businessId });
      logAuditSafe({ profile, action: "shift_created", targetType: "shift", targetId: shift?.id || null, businessId, metadata: { name: data.name, startTime: data.startTime, endTime: data.endTime } });
      notifySafe({ type: NOTIFICATION_TYPES.scheduleAssigned, title: "Jadwal/shift baru", body: `${data.name} · ${data.startTime}–${data.endTime}`, organizationId, businessId, targetType: "shift", targetId: shift?.id || null, audience: "owner" });
      form.reset();
      form.querySelector("#shift-start").value = "08:00";
      form.querySelector("#shift-end").value = "17:00";
      form.querySelectorAll("input[name=workDays]").forEach((input, index) => { input.checked = index < 5; });
      error.textContent = "";
      await loadShifts();
    } catch (submissionError) { error.textContent = submissionError.message; }
  });
}
