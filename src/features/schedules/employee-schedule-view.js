import { getBusiness, listEmployeeSchedules, listShifts } from "../../lib/firestore/repositories.js";
import { getDateKey, formatInAppZone } from "../../lib/utils/time.js";
import { groupEmployeeSchedules, weekdayKey } from "./schedule-calculations.js";
import { escapeHtml, setRegionBusy } from "../../lib/utils/html.js";

const WEEKDAY_LABELS = Object.freeze({
  sunday: "Minggu",
  monday: "Senin",
  tuesday: "Selasa",
  wednesday: "Rabu",
  thursday: "Kamis",
  friday: "Jumat",
  saturday: "Sabtu",
});

function scheduleDateLabel(date) {
  const value = `${String(date ?? "").slice(0, 10)}T00:00:00Z`;
  const formatted = formatInAppZone(value, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return formatted === "-" ? String(date || "-") : formatted;
}

export async function openEmployeeScheduleViewer({ profile }) {
  const organizationId = profile.organizationId;
  const overlay = document.createElement("div");
  overlay.className = "schedule-overlay employee-schedule-overlay";
  overlay.innerHTML = `<section class="schedule-modal employee-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="employee-schedule-title">
    <div class="schedule-modal-head"><div><p class="eyebrow">MY SCHEDULES</p><h2 id="employee-schedule-title">Jadwal kerja saya</h2><p>Semua shift aktif dan akan datang yang ditetapkan kepada Anda.</p></div><button class="icon-button schedule-close" aria-label="Tutup">×</button></div>
    <div class="employee-schedule-toolbar"><div class="employee-schedule-summary" data-employee-schedule-summary><strong>0 jadwal</strong><span>Memuat jadwal...</span></div><div class="field"><label for="employee-schedule-month">Bulan</label><select id="employee-schedule-month" data-employee-schedule-month><option value="">Semua bulan</option></select></div></div>
    <p class="schedule-error" role="alert"></p>
    <div class="employee-schedule-list" data-employee-schedule-list><div class="role-empty-state"><strong>Memuat jadwal...</strong><span>Mengumpulkan jadwal yang sudah ditetapkan.</span></div></div>
  </section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".schedule-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const error = overlay.querySelector(".schedule-error");
  const summary = overlay.querySelector("[data-employee-schedule-summary]");
  const monthSelect = overlay.querySelector("[data-employee-schedule-month]");
  const list = overlay.querySelector("[data-employee-schedule-list]");
  const restoreBusy = setRegionBusy(list);
  let grouped = { total: 0, months: [] };

  const render = () => {
    const selectedMonth = monthSelect.value;
    const months = selectedMonth ? grouped.months.filter((month) => month.key === selectedMonth) : grouped.months;
    const total = months.reduce((sum, month) => sum + month.count, 0);
    summary.innerHTML = `<strong>${total} jadwal</strong><span>${selectedMonth ? months[0]?.label || "Bulan terpilih" : "Aktif dan akan datang"}</span>`;
    if (!total) {
      list.innerHTML = `<div class="role-empty-state"><strong>Belum ada jadwal.</strong><span>Jadwal yang ditetapkan Owner atau Admin akan muncul di sini.</span></div>`;
      return;
    }
    list.innerHTML = months.map((month) => `<section class="employee-schedule-month"><div class="shift-list-head"><h3>${escapeHtml(month.label)}</h3><span class="shift-count">${month.count}</span></div>${month.schedules.map((schedule) => {
      const shiftName = shiftMap.get(schedule.shiftId)?.name || "Shift tidak ditemukan";
      const startTime = shiftMap.get(schedule.shiftId)?.startTime || "";
      const endTime = shiftMap.get(schedule.shiftId)?.endTime || "";
      const businessName = businessMap.get(schedule.businessId) || "Bisnis";
      const dayLabel = WEEKDAY_LABELS[weekdayKey(schedule.date)] || "";
      const timeLabel = startTime && endTime ? ` · ${escapeHtml(startTime)}–${escapeHtml(endTime)}` : "";
      return `<div class="shift-row employee-schedule-row"><div><strong>${scheduleDateLabel(schedule.date)}</strong><span>${escapeHtml(shiftName)}${timeLabel} · ${escapeHtml(businessName)}${dayLabel ? ` · ${escapeHtml(dayLabel)}` : ""}</span></div><b class="status-pill done">Aktif</b></div>`;
    }).join("")}</section>`).join("");
  };

  const shiftMap = new Map();
  const businessMap = new Map();
  monthSelect.addEventListener("change", render);

  try {
    const schedules = await listEmployeeSchedules(profile.uid);
    const businessIds = [...new Set(schedules.map((schedule) => schedule.businessId).filter(Boolean))];
    const [shiftGroups, businessRecords] = await Promise.all([
      Promise.all(businessIds.map((id) => listShifts(organizationId, id).catch(() => []))),
      Promise.all(businessIds.map((id) => getBusiness(id).catch(() => null))),
    ]);
    shiftGroups.flat().forEach((shift) => shiftMap.set(shift.id, shift));
    businessRecords.filter(Boolean).forEach((business) => businessMap.set(business.id, business.name));
    grouped = groupEmployeeSchedules({ schedules, from: getDateKey() });
    monthSelect.innerHTML = `<option value="">Semua bulan</option>${grouped.months.map((month) => `<option value="${month.key}">${escapeHtml(month.label)}</option>`).join("")}`;
    render();
  } catch (loadError) {
    error.textContent = loadError.message;
    summary.innerHTML = `<strong>0 jadwal</strong><span>Gagal memuat</span>`;
    list.innerHTML = `<div class="role-empty-state"><strong>Jadwal belum tersedia.</strong><span>${escapeHtml(loadError.message)}</span></div>`;
  } finally {
    restoreBusy();
  }
}
