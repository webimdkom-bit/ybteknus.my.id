import { getBusiness, listBusinessesForOrganization, listEmployeesForBusiness, listSchedules } from "../../lib/firestore/repositories.js";
import {
  addShift,
  assignShiftRange,
  deleteScheduleAssignment,
  deleteShiftAssignment,
  listShifts,
  updateScheduleAssignment,
  updateShiftAssignment,
} from "./schedule-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";
import { getDateKey } from "../../lib/utils/time.js";
import { escapeHtml, setBusy, updateBusyLabel } from "../../lib/utils/html.js";
import { canManageBusinessPermission } from "../permissions/permission-service.js";
import { dateSpanDays, eachScheduleDate } from "./schedule-calculations.js";

const WEEKDAY_VALUES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export async function openScheduleManager({ profile, onClose }) {
  const organizationId = profile.organizationId;
  let shiftBusinessId = profile.selectedBusinessId || profile.businessIds?.[0] || null;
  let assignmentBusinessId = "";
  let currentShifts = [];
  let assignmentShifts = [];
  let currentSchedules = [];
  let employeeNames = new Map();
  let editingShiftId = null;
  let editingScheduleId = null;
  const overlay = document.createElement("div");
  overlay.className = "schedule-overlay";
  overlay.innerHTML = `
    <section class="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
      <div class="schedule-modal-head"><div><p class="eyebrow">WORK SCHEDULES</p><h2 id="schedule-title">Shift & jadwal</h2><p>Buat shift, tetapkan jadwal karyawan, lalu ubah atau hapus data yang sudah dibuat.</p></div><button class="icon-button schedule-close" aria-label="Tutup">×</button></div>
      <div class="schedule-layout">
        <div class="schedule-column">
          <form class="shift-form" id="shift-form">
            <h3 data-shift-form-title>Buat shift</h3>
            <input type="hidden" data-shift-id />
            <div class="field"><label for="shift-name">Nama shift</label><input id="shift-name" name="name" placeholder="Shift pagi" required /></div>
            <div class="field"><label for="shift-business">Bisnis</label><select id="shift-business" name="businessId" required><option value="">Memuat bisnis...</option></select></div>
            <div class="schedule-fields"><div class="field"><label for="shift-start">Jam masuk</label><input id="shift-start" name="startTime" type="time" value="08:00" required /></div><div class="field"><label for="shift-end">Jam pulang</label><input id="shift-end" name="endTime" type="time" value="17:00" required /></div></div>
            <div class="schedule-fields"><div class="field"><label for="shift-break">Istirahat (menit)</label><input id="shift-break" name="breakMinutes" type="number" min="0" value="60" /></div><div class="field"><label for="shift-tolerance">Toleransi (menit)</label><input id="shift-tolerance" name="toleranceMinutes" type="number" min="0" value="15" /></div></div>
            <div class="field"><label>Hari kerja</label><div class="weekday-list">${WEEKDAY_LABELS.map((day, index) => `<label><input type="checkbox" name="workDays" value="${WEEKDAY_VALUES[index]}" ${index < 5 ? "checked" : ""} />${day}</label>`).join("")}</div></div>
            <p class="schedule-error" role="alert"></p>
            <div class="shift-form-actions"><button class="primary-button" type="submit" data-shift-submit>Simpan shift <span>→</span></button><button class="secondary-button" type="button" data-shift-cancel hidden>Batal edit</button></div>
          </form>
          <form class="shift-form assignment-form" id="assignment-form">
            <h3>Tetapkan jadwal karyawan</h3>
            <p class="field-hint">Pilih bisnis, karyawan, shift, rentang tanggal, dan hari yang ingin dijadwalkan. Maksimal 31 hari.</p>
            <div class="field"><label for="assign-business">Bisnis</label><select id="assign-business" required><option value="">Memuat bisnis...</option></select></div>
            <div class="field"><label>Karyawan <span>(karyawan sesuai bisnis)</span></label><div class="task-assignee-list" id="assign-employees"><p class="task-empty">Memuat karyawan...</p></div></div>
            <div class="field"><label for="assign-shift">Shift</label><select id="assign-shift" required><option value="">Pilih shift</option></select></div>
            <div class="schedule-fields"><div class="field"><label for="assign-from">Tanggal mulai</label><input id="assign-from" type="date" required /></div><div class="field"><label for="assign-to">Tanggal selesai</label><input id="assign-to" type="date" required /></div></div>
            <div class="field"><label>Hari yang dijadwalkan</label><div class="weekday-list" data-range-weekdays>${WEEKDAY_LABELS.map((day, index) => `<label><input type="checkbox" data-range-weekday value="${WEEKDAY_VALUES[index]}" ${index < 5 ? "checked" : ""} />${day}</label>`).join("")}</div></div>
            <div class="field"><label for="assign-effective">Tanggal efektif</label><input id="assign-effective" type="date" required /></div>
            <p class="field-hint" data-range-preview>Menunggu tanggal...</p>
            <p class="schedule-error" role="alert"></p><p class="schedule-message" role="status"></p><button class="primary-button" type="submit">Tetapkan jadwal <span>→</span></button>
          </form>
          <form class="shift-form schedule-edit-form" data-schedule-editor hidden>
            <h3>Ubah jadwal</h3>
            <input type="hidden" data-schedule-id />
            <div class="field"><label for="schedule-edit-shift">Shift</label><select id="schedule-edit-shift" required><option value="">Pilih shift</option></select></div>
            <div class="schedule-fields"><div class="field"><label for="schedule-edit-date">Tanggal jadwal</label><input id="schedule-edit-date" type="date" required /></div><div class="field"><label for="schedule-edit-effective">Tanggal efektif</label><input id="schedule-edit-effective" type="date" required /></div></div>
            <div class="field"><label for="schedule-edit-status">Status</label><select id="schedule-edit-status"><option value="active">Aktif</option><option value="cancelled">Dibatalkan</option></select></div>
            <p class="schedule-error" role="alert"></p><p class="schedule-message" role="status"></p>
            <div class="shift-form-actions"><button class="primary-button" type="submit">Simpan perubahan <span>→</span></button><button class="secondary-button" type="button" data-schedule-cancel>Batal</button></div>
          </form>
        </div>
        <div class="schedule-list-wrap">
          <div class="shift-list-head"><h3>Shift tersimpan</h3><span class="shift-count">0</span></div>
          <div class="shift-list"><p class="shift-empty">Belum ada shift untuk bisnis ini.</p></div>
          <div class="shift-list-head schedule-list-head"><h3>Jadwal karyawan</h3><span class="schedule-count">0</span></div>
          <div class="schedule-list"><p class="shift-empty">Belum ada jadwal untuk bisnis ini.</p></div>
        </div>
      </div>
    </section>
  `;
  document.body.append(overlay);
  const close = () => { overlay.remove(); onClose?.(); };
  overlay.querySelector(".schedule-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const list = overlay.querySelector(".shift-list");
  const scheduleList = overlay.querySelector(".schedule-list");
  const count = overlay.querySelector(".shift-count");
  const scheduleCount = overlay.querySelector(".schedule-count");
  const businessSelect = overlay.querySelector("#shift-business");
  const assignmentBusinessSelect = overlay.querySelector("#assign-business");
  const employeeList = overlay.querySelector("#assign-employees");
  const shiftSelect = overlay.querySelector("#assign-shift");
  const fromInput = overlay.querySelector("#assign-from");
  const toInput = overlay.querySelector("#assign-to");
  const weekdayInputs = overlay.querySelectorAll("[data-range-weekday]");
  const rangePreview = overlay.querySelector("[data-range-preview]");
  const effectiveInput = overlay.querySelector("#assign-effective");
  const shiftForm = overlay.querySelector("#shift-form");
  const shiftIdInput = overlay.querySelector("[data-shift-id]");
  const shiftTitle = overlay.querySelector("[data-shift-form-title]");
  const shiftSubmit = overlay.querySelector("[data-shift-submit]");
  const shiftCancel = overlay.querySelector("[data-shift-cancel]");
  const scheduleEditor = overlay.querySelector("[data-schedule-editor]");
  const scheduleIdInput = overlay.querySelector("[data-schedule-id]");
  const scheduleEditShift = overlay.querySelector("#schedule-edit-shift");
  const scheduleEditDate = overlay.querySelector("#schedule-edit-date");
  const scheduleEditEffective = overlay.querySelector("#schedule-edit-effective");
  const scheduleEditStatus = overlay.querySelector("#schedule-edit-status");
  const today = getDateKey();
  const addDays = (dateKey, amount) => {
    const value = new Date(`${dateKey}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
  };
  fromInput.value = today;
  toInput.value = addDays(today, 4);
  effectiveInput.value = today;
  const selectedWeekdays = () => [...weekdayInputs].filter((input) => input.checked).map((input) => input.value);
  const selectedEmployeeIds = () => [...employeeList.querySelectorAll("[data-assign-employee]:checked")].map((input) => input.value);
  const updateRangePreview = () => {
    const span = dateSpanDays(fromInput.value, toInput.value);
    const employeeCount = selectedEmployeeIds().length;
    const weekdays = selectedWeekdays();
    if (!span) {
      rangePreview.textContent = "Pilih rentang tanggal yang valid.";
      return;
    }
    if (span > 31) {
      rangePreview.textContent = `Rentang ${span} hari melebihi batas 31 hari.`;
      return;
    }
    if (!weekdays.length) {
      rangePreview.textContent = "Pilih minimal satu hari.";
      return;
    }
    const dates = eachScheduleDate({ from: fromInput.value, to: toInput.value, weekdays, maxDays: 31 });
    rangePreview.textContent = dates.length
      ? `${dates.length} tanggal · ${dates.length * employeeCount} jadwal akan dibuat`
      : "Tidak ada tanggal yang cocok dengan hari yang dipilih.";
  };
  fromInput.addEventListener("input", updateRangePreview);
  toInput.addEventListener("input", updateRangePreview);
  weekdayInputs.forEach((input) => input.addEventListener("change", updateRangePreview));
  employeeList.addEventListener("change", updateRangePreview);

  const businesses = profile.role === "owner"
    ? await listBusinessesForOrganization(organizationId)
    : (await Promise.all((profile.businessIds || []).map((id) => getBusiness(id)))).filter(Boolean);
  const visibleBusinesses = businesses.filter((business) => business.status !== "inactive" && canManageBusinessPermission(profile, business.id, "manageSchedules"));
  const businessOptions = visibleBusinesses.length
    ? `<option value="">Pilih bisnis</option>${visibleBusinesses.map((business) => `<option value="${business.id}">${escapeHtml(business.name)}</option>`).join("")}`
    : `<option value="">Belum ada bisnis tersedia</option>`;
  businessSelect.innerHTML = businessOptions;
  assignmentBusinessSelect.innerHTML = businessOptions;
  if (!shiftBusinessId || !visibleBusinesses.some((business) => business.id === shiftBusinessId)) shiftBusinessId = visibleBusinesses[0]?.id || null;
  if (shiftBusinessId) businessSelect.value = shiftBusinessId;

  const shiftOptions = (shifts = [], withPlaceholder = true) => `${withPlaceholder ? `<option value="">Pilih shift</option>` : ""}${shifts.filter((shift) => shift.status !== "inactive").map((shift) => `<option value="${shift.id}">${escapeHtml(shift.name)} · ${escapeHtml(shift.startTime)}–${escapeHtml(shift.endTime)}</option>`).join("")}`;

  const resetShiftForm = () => {
    editingShiftId = null;
    shiftForm.reset();
    shiftIdInput.value = "";
    shiftTitle.textContent = "Buat shift";
    shiftSubmit.innerHTML = `Simpan shift <span>→</span>`;
    shiftCancel.hidden = true;
    overlay.querySelector("#shift-start").value = "08:00";
    overlay.querySelector("#shift-end").value = "17:00";
    overlay.querySelector("#shift-break").value = "60";
    overlay.querySelector("#shift-tolerance").value = "15";
    shiftForm.querySelectorAll("input[name=workDays]").forEach((input, index) => { input.checked = index < 5; });
    if (shiftBusinessId) shiftForm.querySelector("#shift-business").value = shiftBusinessId;
  };
  resetShiftForm();

  const hideScheduleEditor = () => {
    editingScheduleId = null;
    scheduleEditor.hidden = true;
    scheduleIdInput.value = "";
  };

  const loadShifts = async () => {
    try {
      const shifts = shiftBusinessId ? await listShifts(organizationId, shiftBusinessId) : [];
      currentShifts = shifts;
      count.textContent = currentShifts.length;
      list.innerHTML = currentShifts.length
        ? currentShifts.map((shift) => `<div class="shift-row"><div><strong>${escapeHtml(shift.name)}</strong><span>${escapeHtml(shift.startTime)} – ${escapeHtml(shift.endTime)} · toleransi ${shift.toleranceMinutes || 0}m · istirahat ${shift.breakMinutes || 0}m</span></div><b>${shift.workDays?.length || 0} hari${shift.status === "inactive" ? " · nonaktif" : ""}</b><div class="shift-actions"><button class="secondary-button" type="button" data-shift-edit="${shift.id}">Edit</button><button class="reject-registration" type="button" data-shift-delete="${shift.id}">Hapus</button></div></div>`).join("")
        : `<p class="shift-empty">Belum ada shift untuk bisnis ini.</p>`;
    } catch (error) {
      list.innerHTML = `<p class="shift-error">${escapeHtml(error.message)}</p>`;
    }
  };

  const loadAssignmentData = async () => {
    try {
      const [shifts, schedules, employees] = assignmentBusinessId
        ? await Promise.all([
            listShifts(organizationId, assignmentBusinessId),
            listSchedules({ organizationId, businessId: assignmentBusinessId }),
            listEmployeesForBusiness(organizationId, assignmentBusinessId),
          ])
        : [[], [], []];
      assignmentShifts = shifts;
      currentSchedules = schedules;
      employeeNames = new Map(employees.map((employee) => [employee.id, employee.displayName || employee.email || "Tanpa nama"]));
      scheduleCount.textContent = currentSchedules.length;
      scheduleList.innerHTML = currentSchedules.length
        ? [...currentSchedules].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((schedule) => {
            const shift = assignmentShifts.find((item) => item.id === schedule.shiftId);
            const status = schedule.status || "active";
            return `<div class="shift-row schedule-row"><div><strong>${escapeHtml(employeeNames.get(schedule.userId) || schedule.userId)}</strong><span>${escapeHtml(schedule.date)} · ${escapeHtml(shift?.name || "Shift tidak ditemukan")} · ${escapeHtml(shift ? `${shift.startTime}–${shift.endTime}` : "-")}</span></div><b>${status === "active" ? "Aktif" : "Dibatalkan"}</b><div class="shift-actions"><button class="secondary-button" type="button" data-schedule-edit="${schedule.id}">Edit</button><button class="reject-registration" type="button" data-schedule-delete="${schedule.id}">Hapus</button></div></div>`;
          }).join("")
        : `<p class="shift-empty">${assignmentBusinessId ? "Belum ada jadwal untuk bisnis ini." : "Pilih bisnis terlebih dahulu."}</p>`;
      shiftSelect.innerHTML = shiftOptions(assignmentShifts);
      scheduleEditShift.innerHTML = shiftOptions(assignmentShifts);
      if (editingScheduleId && currentSchedules.some((item) => item.id === editingScheduleId)) {
        const schedule = currentSchedules.find((item) => item.id === editingScheduleId);
        scheduleEditShift.value = schedule.shiftId;
        scheduleEditDate.value = schedule.date;
        scheduleEditEffective.value = schedule.effectiveFrom || schedule.date;
        scheduleEditStatus.value = schedule.status || "active";
      }
      employeeList.innerHTML = employees.length
        ? employees.map((employee) => `<label class="task-assignee-option"><input type="checkbox" value="${employee.id}" data-assign-employee="${employee.id}" /><span>${escapeHtml(employee.displayName || employee.email || "Tanpa nama")}</span></label>`).join("")
        : `<p class="task-empty">${assignmentBusinessId ? "Belum ada karyawan pada bisnis ini." : "Pilih bisnis terlebih dahulu."}</p>`;
      updateRangePreview();
    } catch (error) {
      scheduleList.innerHTML = `<p class="shift-error">${escapeHtml(error.message)}</p>`;
    }
  };

  const loadAll = async () => {
    await Promise.all([loadShifts(), loadAssignmentData()]);
  };

  businessSelect.addEventListener("change", () => {
    shiftBusinessId = businessSelect.value || null;
    resetShiftForm();
    hideScheduleEditor();
    loadShifts();
  });
  assignmentBusinessSelect.addEventListener("change", () => {
    assignmentBusinessId = assignmentBusinessSelect.value || "";
    employeeList.querySelectorAll("[data-assign-employee]").forEach((input) => { input.checked = false; });
    hideScheduleEditor();
    loadAssignmentData();
  });
  shiftCancel.addEventListener("click", resetShiftForm);
  overlay.querySelector("[data-schedule-cancel]").addEventListener("click", hideScheduleEditor);
  await loadAll();

  shiftForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(shiftForm));
    data.workDays = [...shiftForm.querySelectorAll("input[name=workDays]:checked")].map((input) => input.value);
    const error = shiftForm.querySelector(".schedule-error");
    const restore = setBusy(shiftSubmit, editingShiftId ? "Menyimpan perubahan..." : "Menyimpan shift...");
    error.textContent = "";
    try {
      if (!shiftBusinessId) throw new Error("Pilih bisnis terlebih dahulu.");
      if (editingShiftId) {
        await updateShiftAssignment({ organizationId, businessId: shiftBusinessId, shiftId: editingShiftId, fields: data });
        logAuditSafe({ profile, action: "shift_updated", targetType: "shift", targetId: editingShiftId, businessId: shiftBusinessId, metadata: { name: data.name } });
        shiftForm.querySelector(".schedule-message")?.replaceChildren();
      } else {
        const shift = await addShift({ ...data, organizationId, businessId: shiftBusinessId });
        logAuditSafe({ profile, action: "shift_created", targetType: "shift", targetId: shift?.id || null, businessId: shiftBusinessId, metadata: { name: data.name, startTime: data.startTime, endTime: data.endTime } });
        notifySafe({ type: NOTIFICATION_TYPES.scheduleAssigned, title: "Jadwal/shift baru", body: `${data.name} · ${data.startTime}–${data.endTime}`, organizationId, businessId: shiftBusinessId, targetType: "shift", targetId: shift?.id || null, audience: "owner" });
      }
      resetShiftForm();
      await loadAll();
    } catch (submissionError) { error.textContent = submissionError.message; }
    finally { restore(); }
  });

  list.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-shift-edit]");
    const deleteButton = event.target.closest("[data-shift-delete]");
    if (editButton) {
      const shift = currentShifts.find((item) => item.id === editButton.dataset.shiftEdit);
      if (!shift) return;
      editingShiftId = shift.id;
      shiftIdInput.value = shift.id;
      shiftTitle.textContent = "Ubah shift";
      shiftSubmit.innerHTML = `Simpan perubahan <span>→</span>`;
      shiftCancel.hidden = false;
      shiftForm.querySelector("#shift-name").value = shift.name;
      shiftForm.querySelector("#shift-business").value = shiftBusinessId;
      shiftForm.querySelector("#shift-start").value = shift.startTime;
      shiftForm.querySelector("#shift-end").value = shift.endTime;
      shiftForm.querySelector("#shift-break").value = shift.breakMinutes || 0;
      shiftForm.querySelector("#shift-tolerance").value = shift.toleranceMinutes || 0;
      shiftForm.querySelectorAll("input[name=workDays]").forEach((input) => { input.checked = (shift.workDays || []).includes(input.value); });
      shiftForm.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (deleteButton) {
      if (!window.confirm("Hapus shift ini?")) return;
      const restore = setBusy(deleteButton, "Menghapus...");
      try {
        await deleteShiftAssignment({ organizationId, businessId: shiftBusinessId, shiftId: deleteButton.dataset.shiftDelete });
        logAuditSafe({ profile, action: "shift_deleted", targetType: "shift", targetId: deleteButton.dataset.shiftDelete, businessId: shiftBusinessId });
        if (editingShiftId === deleteButton.dataset.shiftDelete) resetShiftForm();
        await loadAll();
      } catch (deleteError) { overlay.querySelector("#shift-form .schedule-error").textContent = deleteError.message; }
      finally { restore(); }
    }
  });

  overlay.querySelector("#assignment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".schedule-error");
    const message = form.querySelector(".schedule-message");
    const userIds = selectedEmployeeIds();
    const shiftId = shiftSelect.value;
    const weekdays = selectedWeekdays();
    if (!assignmentBusinessId) {
      error.textContent = "Pilih bisnis terlebih dahulu.";
      return;
    }
    if (!userIds.length || !shiftId || !fromInput.value || !toInput.value || !effectiveInput.value || !weekdays.length) {
      error.textContent = "Pilih karyawan, shift, rentang tanggal, hari, dan tanggal efektif.";
      return;
    }
    const submit = form.querySelector("button[type=submit]");
    const restore = setBusy(submit, "Menetapkan jadwal...");
    try {
      const result = await assignShiftRange({
        organizationId,
        businessId: assignmentBusinessId,
        userIds,
        shiftId,
        from: fromInput.value,
        to: toInput.value,
        weekdays,
        effectiveFrom: effectiveInput.value,
        assignedBy: profile.uid,
        onProgress: (index, total) => updateBusyLabel(submit, `Menetapkan ${index}/${total}...`),
      });
      logAuditSafe({
        profile,
        action: "schedule_range_assigned",
        targetType: "schedule",
        targetId: result.created[0]?.id || null,
        businessId: assignmentBusinessId,
        metadata: { userIds, from: fromInput.value, to: toInput.value, weekdays, created: result.created.length, skipped: result.skipped.length, batchId: result.batchId },
      });
      if (result.created.length) {
        notifySafe({
          id: `schedule_range_${result.batchId}`,
          type: NOTIFICATION_TYPES.scheduleAssigned,
          title: "Jadwal kerja ditetapkan",
          body: `${fromInput.value} s/d ${toInput.value} · ${result.created.length} jadwal`,
          organizationId,
          businessId: assignmentBusinessId,
          targetType: "schedule",
          targetId: result.created[0].id,
          userIds: result.created.map((schedule) => schedule.userId),
        });
      }
      const skipped = result.skipped.slice(0, 12).map((item) => `${employeeNames.get(item.userId) || item.userId} · ${item.date}: ${item.reason}`).join(" · ");
      const more = result.skipped.length > 12 ? ` · masih ${result.skipped.length - 12} lagi` : "";
      message.textContent = `${result.created.length} jadwal ditetapkan pada ${result.dates.length} tanggal.${skipped ? ` Dilewati: ${skipped}${more}` : ""}`;
      error.textContent = "";
      employeeList.querySelectorAll("[data-assign-employee]").forEach((input) => { input.checked = false; });
      updateRangePreview();
      await loadAll();
    } catch (assignmentError) { error.textContent = assignmentError.message; }
    finally { restore(); }
  });

  scheduleEditor.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingScheduleId) return;
    const error = scheduleEditor.querySelector(".schedule-error");
    const restore = setBusy(scheduleEditor.querySelector("button[type=submit]"), "Menyimpan perubahan...");
    error.textContent = "";
    try {
      await updateScheduleAssignment({
        organizationId,
        businessId: assignmentBusinessId,
        scheduleId: editingScheduleId,
        fields: {
          shiftId: scheduleEditShift.value,
          date: scheduleEditDate.value,
          effectiveFrom: scheduleEditEffective.value,
          status: scheduleEditStatus.value,
        },
      });
      logAuditSafe({ profile, action: "schedule_updated", targetType: "schedule", targetId: editingScheduleId, businessId: assignmentBusinessId });
      scheduleEditor.querySelector(".schedule-message").textContent = "Jadwal diperbarui.";
      hideScheduleEditor();
      await loadAll();
    } catch (updateError) { error.textContent = updateError.message; }
    finally { restore(); }
  });

  scheduleList.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-schedule-edit]");
    const deleteButton = event.target.closest("[data-schedule-delete]");
    if (editButton) {
      const schedule = currentSchedules.find((item) => item.id === editButton.dataset.scheduleEdit);
      if (!schedule) return;
      editingScheduleId = schedule.id;
      scheduleIdInput.value = schedule.id;
      scheduleEditShift.value = schedule.shiftId;
      scheduleEditDate.value = schedule.date;
      scheduleEditEffective.value = schedule.effectiveFrom || schedule.date;
      scheduleEditStatus.value = schedule.status || "active";
      scheduleEditor.hidden = false;
      scheduleEditor.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (deleteButton) {
      if (!window.confirm("Hapus jadwal ini?")) return;
      const restore = setBusy(deleteButton, "Menghapus...");
      try {
        await deleteScheduleAssignment({ organizationId, businessId: assignmentBusinessId, scheduleId: deleteButton.dataset.scheduleDelete });
        logAuditSafe({ profile, action: "schedule_deleted", targetType: "schedule", targetId: deleteButton.dataset.scheduleDelete, businessId: assignmentBusinessId });
        if (editingScheduleId === deleteButton.dataset.scheduleDelete) hideScheduleEditor();
        await loadAll();
      } catch (deleteError) { scheduleEditor.querySelector(".schedule-error").textContent = deleteError.message; }
      finally { restore(); }
    }
  });
}
