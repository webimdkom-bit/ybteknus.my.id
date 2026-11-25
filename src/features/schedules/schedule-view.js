import { getBusiness, listBusinessesForOrganization, listEmployeesForBusiness } from "../../lib/firestore/repositories.js";
import { addShift, assignShiftBulk, listShifts } from "./schedule-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";
import { getDateKey } from "../../lib/utils/time.js";

export async function openScheduleManager({ profile, onClose }) {
  const organizationId = profile.organizationId;
  let businessId = profile.businessIds?.[0] || null;
  let currentShifts = [];
  const overlay = document.createElement("div");
  overlay.className = "schedule-overlay";
  overlay.innerHTML = `
    <section class="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
      <div class="schedule-modal-head"><div><p class="eyebrow">WORK SCHEDULES</p><h2 id="schedule-title">Shift & jadwal</h2><p>Buat pola kerja dan tetapkan jadwal individual dengan tanggal efektif.</p></div><button class="icon-button schedule-close" aria-label="Tutup">×</button></div>
      <div class="schedule-layout">
        <div class="schedule-column">
          <form class="shift-form" id="shift-form">
            <h3>Buat shift</h3>
            <div class="field"><label for="shift-name">Nama shift</label><input id="shift-name" name="name" placeholder="Shift pagi" required /></div>
            <div class="field"><label for="shift-business">Bisnis</label><select id="shift-business" name="businessId" required><option value="">Memuat bisnis...</option></select></div>
            <div class="schedule-fields"><div class="field"><label for="shift-start">Jam masuk</label><input id="shift-start" name="startTime" type="time" value="08:00" required /></div><div class="field"><label for="shift-end">Jam pulang</label><input id="shift-end" name="endTime" type="time" value="17:00" required /></div></div>
            <div class="schedule-fields"><div class="field"><label for="shift-break">Istirahat (menit)</label><input id="shift-break" name="breakMinutes" type="number" min="0" value="60" /></div><div class="field"><label for="shift-tolerance">Toleransi (menit)</label><input id="shift-tolerance" name="toleranceMinutes" type="number" min="0" value="15" /></div></div>
            <div class="field"><label>Hari kerja</label><div class="weekday-list">${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day, index) => `<label><input type="checkbox" name="workDays" value="${["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][index]}" ${index < 5 ? "checked" : ""} />${day}</label>`).join("")}</div></div>
            <p class="schedule-error" role="alert"></p><button class="primary-button" type="submit">Simpan shift <span>→</span></button>
          </form>
          <form class="shift-form assignment-form" id="assignment-form">
            <h3>Tetapkan jadwal karyawan</h3>
            <p class="field-hint">Jadwal yang ditetapkan langsung dipakai karyawan untuk check-in/check-out pada tanggal tersebut.</p>
            <div class="field"><label>Karyawan <span>(karyawan sesuai bisnis)</span></label><div class="task-assignee-list" id="assign-employees"><p class="task-empty">Memuat karyawan...</p></div></div>
            <div class="field"><label for="assign-shift">Shift</label><select id="assign-shift" required><option value="">Pilih shift</option></select></div>
            <div class="schedule-fields"><div class="field"><label for="assign-date">Tanggal jadwal</label><input id="assign-date" type="date" required /></div><div class="field"><label for="assign-effective">Tanggal efektif</label><input id="assign-effective" type="date" required /></div></div>
            <p class="schedule-error" role="alert"></p><p class="schedule-message" role="status"></p><button class="primary-button" type="submit">Tetapkan jadwal <span>→</span></button>
          </form>
        </div>
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
  const employeeList = overlay.querySelector("#assign-employees");
  const shiftSelect = overlay.querySelector("#assign-shift");
  const dateInput = overlay.querySelector("#assign-date");
  const effectiveInput = overlay.querySelector("#assign-effective");
  const today = getDateKey();
  dateInput.value = today;
  effectiveInput.value = today;

  const businesses = profile.role === "owner"
    ? await listBusinessesForOrganization(organizationId)
    : (await Promise.all((profile.businessIds || []).map((id) => getBusiness(id)))).filter(Boolean);
  const visibleBusinesses = businesses.filter((business) => business.status !== "inactive");
  businessSelect.innerHTML = visibleBusinesses.length
    ? `<option value="">Pilih bisnis</option>${visibleBusinesses.map((business) => `<option value="${business.id}">${business.name}</option>`).join("")}`
    : `<option value="">Belum ada bisnis tersedia</option>`;
  if (businessId && visibleBusinesses.some((business) => business.id === businessId)) businessSelect.value = businessId;

  const loadShifts = async () => {
    try {
      currentShifts = businessId ? await listShifts(organizationId, businessId) : [];
      count.textContent = currentShifts.length;
      list.innerHTML = currentShifts.length
        ? currentShifts.map((shift) => `<div class="shift-row"><div><strong>${shift.name}</strong><span>${shift.startTime} – ${shift.endTime} · toleransi ${shift.toleranceMinutes}m</span></div><b>${shift.workDays?.length || 0} hari</b></div>`).join("")
        : `<p class="shift-empty">Belum ada shift untuk bisnis ini.</p>`;
      shiftSelect.innerHTML = currentShifts.length
        ? currentShifts.map((shift) => `<option value="${shift.id}">${shift.name} · ${shift.startTime}–${shift.endTime}</option>`).join("")
        : `<option value="">Belum ada shift</option>`;
      if (businessId) {
        const employees = await listEmployeesForBusiness(organizationId, businessId);
        employeeList.innerHTML = employees.length
          ? employees.map((employee) => `<label class="task-assignee-option"><input type="checkbox" value="${employee.id}" data-assign-employee="${employee.id}" /><span>${escapeHtml(employee.displayName || employee.email || "Tanpa nama")}</span></label>`).join("")
          : `<p class="task-empty">Belum ada karyawan pada bisnis ini.</p>`;
      } else {
        employeeList.innerHTML = `<p class="task-empty">Pilih bisnis terlebih dahulu.</p>`;
      }
    } catch (error) { list.innerHTML = `<p class="shift-error">${error.message}</p>`; }
  };
  businessSelect.addEventListener("change", () => { businessId = businessSelect.value || null; loadShifts(); });
  await loadShifts();

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

  overlay.querySelector("#assignment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".schedule-error");
    const message = form.querySelector(".schedule-message");
    const userIds = [...employeeList.querySelectorAll("[data-assign-employee]:checked")].map((input) => input.value);
    const shiftId = shiftSelect.value;
    if (!userIds.length || !shiftId || !dateInput.value || !effectiveInput.value) {
      error.textContent = "Pilih minimal satu karyawan, shift, tanggal, dan tanggal efektif.";
      return;
    }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const result = await assignShiftBulk({ organizationId, businessId, userIds, shiftId, date: dateInput.value, effectiveFrom: effectiveInput.value, assignedBy: profile.uid });
      const names = new Map([...employeeList.querySelectorAll("[data-assign-employee]")].map((input) => [input.value, input.parentElement.textContent.trim()]));
      result.created.forEach((schedule) => logAuditSafe({ profile, action: "schedule_assigned", targetType: "schedule", targetId: schedule.id, businessId, metadata: { userId: schedule.userId, shiftId, date: schedule.date, effectiveFrom: schedule.effectiveFrom, batchId: result.batchId } }));
      if (result.created.length) {
        notifySafe({ id: `schedule_bulk_${result.batchId}`, type: NOTIFICATION_TYPES.scheduleAssigned, title: "Jadwal kerja ditetapkan", body: `${dateInput.value} · berlaku sejak ${effectiveInput.value}`, organizationId, businessId, targetType: "schedule", targetId: result.created[0].id, userIds: result.created.map((schedule) => schedule.userId) });
      }
      const skipped = result.skipped.map((item) => `${names.get(item.userId) || item.userId}: ${item.reason}`).join(" · ");
      message.textContent = `${result.created.length} jadwal ditetapkan.${skipped ? ` Dilewati: ${skipped}` : ""}`;
      error.textContent = "";
      employeeList.querySelectorAll("[data-assign-employee]").forEach((input) => { input.checked = false; });
    } catch (assignmentError) { error.textContent = assignmentError.message; }
    submit.disabled = false;
  });
}
