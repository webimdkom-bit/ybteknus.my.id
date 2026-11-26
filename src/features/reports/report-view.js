import { getDateKey } from "../attendance/attendance-service.js";
import { getBusiness, listBusinessesForOrganization, listEmployees, listEmployeesForBusiness } from "../../lib/firestore/repositories.js";
import { exportAttendanceExcel, exportAttendancePdf } from "./export-service.js";
import { buildAttendanceReport } from "./report-service.js";
import { escapeHtml, setBusy } from "../../lib/utils/html.js";

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

export async function openReportViewer({ profile }) {
  const today = getDateKey(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const overlay = document.createElement("div");
  overlay.className = "report-overlay";
  overlay.innerHTML = `<section class="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
    <div class="report-modal-head"><div><p class="eyebrow">ATTENDANCE REPORTS</p><h2 id="report-title">Laporan absensi</h2><p>Rekap kehadiran dan jam kerja per karyawan, bisnis, atau seluruh bisnis.</p></div><button class="icon-button report-close" aria-label="Tutup">×</button></div>
    <form class="report-filters">
      <div class="field"><label for="report-from">Dari tanggal</label><input id="report-from" name="from" type="date" value="${today}" required /></div>
      <div class="field"><label for="report-to">Sampai tanggal</label><input id="report-to" name="to" type="date" value="${today}" required /></div>
      <div class="field"><label for="report-business">Bisnis</label><select id="report-business"><option value="">Memuat bisnis...</option></select></div>
      <div class="field report-employee-field"><label>Karyawan</label><div class="task-assignee-list report-employee-list" data-report-employee-list><p class="task-empty">Memuat karyawan...</p></div><small class="field-hint">Tanpa pilihan = semua karyawan.</small></div>
      <div class="report-filter-actions"><button type="button" class="secondary-button" data-report-preset="daily">Hari ini</button><button type="button" class="secondary-button" data-report-preset="monthly">Bulan ini</button><button class="primary-button" type="submit">Muat laporan</button></div>
    </form>
    <p class="report-error" role="alert"></p>
    <div class="report-summary" data-report-summary></div>
    <div class="report-employee-summary" data-report-employee-summary></div>
    <div class="report-table-wrap" data-report-table><div class="role-empty-state"><strong>Belum ada data.</strong><span>Pilih periode lalu klik "Muat laporan".</span></div></div>
    <div class="report-actions"><button class="secondary-button" data-export="pdf" disabled>Ekspor PDF</button><button class="secondary-button" data-export="excel" disabled>Ekspor Excel</button></div>
  </section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".report-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const form = overlay.querySelector(".report-filters");
  const fromInput = overlay.querySelector("#report-from");
  const toInput = overlay.querySelector("#report-to");
  const businessSelect = overlay.querySelector("#report-business");
  const employeeList = overlay.querySelector("[data-report-employee-list]");
  const error = overlay.querySelector(".report-error");
  const summary = overlay.querySelector("[data-report-summary]");
  const employeeSummary = overlay.querySelector("[data-report-employee-summary]");
  const table = overlay.querySelector("[data-report-table]");
  const pdfButton = overlay.querySelector('[data-export="pdf"]');
  const excelButton = overlay.querySelector('[data-export="excel"]');
  let current = null;
  const selectedEmployeeIds = new Set();

  const businessRecords = profile.role === "owner"
    ? await listBusinessesForOrganization(profile.organizationId).catch(() => [])
    : (await Promise.all((profile.businessIds || []).map((id) => getBusiness(id).catch(() => null)))).filter(Boolean);
  const visibleBusinesses = businessRecords.filter((business) => business.status !== "inactive");
  businessSelect.innerHTML = `<option value="">Semua bisnis</option>${visibleBusinesses.map((business) => `<option value="${business.id}">${escapeHtml(business.name)}</option>`).join("")}`;

  const renderEmployeeChoices = (employees) => {
    if (!employees.length) {
      employeeList.innerHTML = `<p class="task-empty">Belum ada karyawan pada bisnis ini.</p>`;
      return;
    }
    employeeList.innerHTML = employees.map((employee) => {
      const selected = selectedEmployeeIds.has(employee.id);
      return `<label class="task-assignee-option"><input type="checkbox" value="${employee.id}" data-report-employee="${employee.id}" ${selected ? "checked" : ""} /><span>${escapeHtml(employee.displayName || employee.email)}</span></label>`;
    }).join("");
    employeeList.querySelectorAll("[data-report-employee]").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) selectedEmployeeIds.add(input.value);
      else selectedEmployeeIds.delete(input.value);
    }));
  };

  const loadEmployeeChoices = async () => {
    employeeList.innerHTML = `<p class="task-empty">Memuat karyawan...</p>`;
    const businessId = businessSelect.value;
    const scopes = profile.role === "owner"
      ? (businessId ? [businessId] : [])
      : (businessId ? [businessId] : (profile.businessIds || []));
    let employees;
    try {
      if (profile.role === "owner" && !businessId) employees = await listEmployees(profile.organizationId);
      else employees = (await Promise.all(scopes.map((scope) => listEmployeesForBusiness(profile.organizationId, scope)))).flat();
    } catch (loadError) {
      employeeList.innerHTML = `<p class="task-empty">Gagal memuat karyawan.</p>`;
      error.textContent = loadError.message;
      return;
    }
    const unique = [...new Map(employees.map((employee) => [employee.id, employee])).values()];
    [...selectedEmployeeIds].forEach((id) => { if (!unique.some((employee) => employee.id === id)) selectedEmployeeIds.delete(id); });
    renderEmployeeChoices(unique);
  };

  const periodChips = (entries) => (entries.length
    ? `<div class="report-chips">${entries.slice(0, 12).map((entry) => `<span class="report-chip">${escapeHtml(entry.label)} · ${escapeHtml(entry.labelHours)} · ${entry.days}h</span>`).join("")}${entries.length > 12 ? `<span class="report-chip">+${entries.length - 12} lagi</span>` : ""}</div>`
    : `<span class="report-chip">Tidak ada data</span>`);

  overlay.querySelectorAll("[data-report-preset]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.reportPreset === "daily") {
      fromInput.value = today;
      toInput.value = today;
    } else {
      fromInput.value = monthStart;
      toInput.value = today;
    }
  }));
  businessSelect.addEventListener("change", loadEmployeeChoices);

  const load = async () => {
    error.textContent = "";
    const from = fromInput.value;
    const to = toInput.value;
    if (!from || !to || from > to) {
      error.textContent = "Periode tidak valid.";
      return;
    }
    summary.textContent = "Memuat laporan...";
    employeeSummary.textContent = "";
    table.innerHTML = `<div class="role-empty-state"><strong>Memuat data...</strong><span>Mengumpulkan absensi dan jam kerja karyawan.</span></div>`;
    pdfButton.disabled = true;
    excelButton.disabled = true;
    try {
      const report = await buildAttendanceReport({
        profile,
        from,
        to,
        businessId: businessSelect.value,
        userIds: [...selectedEmployeeIds],
      });
      current = report;
      const { summary: totals, rows, employeeSummaries } = report;
      summary.innerHTML = [
        ["TOTAL DATA", totals.total],
        ["KARYAWAN", totals.employees],
        ["TOTAL JAM", totals.totalHoursLabel],
        ["JAM ABSOLUT", totals.absoluteHoursLabel],
        ["LEMBUR", totals.overtimeHoursLabel],
        ["HADIR", totals.hadir],
        ["TERLAMBAT", totals.terlambat],
        ["ALPA", totals.alpa],
      ].map(([label, value]) => `<div class="report-stat"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
      employeeSummary.innerHTML = employeeSummaries.length
        ? `<div class="report-employee-summary-head"><strong>Ringkasan per karyawan</strong><span>Klik baris untuk rincian hari, minggu, dan bulan</span></div>${employeeSummaries.map((item) => `<details class="report-summary-row"><summary><span>${escapeHtml(item.employee)}</span><span>${escapeHtml(item.business)}</span><span>${item.workedDays} hari</span><strong>${escapeHtml(item.totalHoursLabel)}</strong><span>Lembur ${escapeHtml(item.overtimeHoursLabel)}</span></summary><div class="report-summary-breakdown"><div><strong>Harian</strong>${periodChips(item.days)}</div><div><strong>Mingguan</strong>${periodChips(item.weeks)}</div><div><strong>Bulanan</strong>${periodChips(item.months)}</div></div></details>`).join("")}`
        : "";
      table.innerHTML = rows.length
        ? `<table class="report-table"><thead><tr><th>Tanggal</th><th>Karyawan</th><th>Bisnis</th><th>Shift</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>Telat</th><th>Total jam</th></tr></thead><tbody>${rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.employee)}</td><td>${escapeHtml(row.business)}</td><td>${escapeHtml(row.shift)}</td><td>${escapeHtml(row.checkIn)}</td><td>${escapeHtml(row.checkOut)}</td><td>${escapeHtml(row.status)}</td><td>${row.lateMinutes}m</td><td>${escapeHtml(row.workedHours)}</td></tr>`).join("")}</tbody></table>${rows.length > 100 ? `<p class="report-note">Menampilkan 100 dari ${rows.length} baris. Ekspor untuk data lengkap.</p>` : ""}`
        : `<div class="role-empty-state"><strong>Tidak ada data absensi.</strong><span>Coba periode atau filter lain.</span></div>`;
      renderEmployeeChoices(report.employees);
      if (report.errors?.length) error.textContent = report.errors.join(" ");
      pdfButton.disabled = !rows.length;
      excelButton.disabled = !rows.length;
    } catch (loadError) {
      error.textContent = loadError.message;
      summary.textContent = "";
    }
  };

  form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
  pdfButton.addEventListener("click", async () => {
    if (!current) return;
    const report = current;
    const restore = setBusy(pdfButton, "Menyiapkan PDF...");
    try {
      await nextFrame();
      await exportAttendancePdf({ rows: report.rows, employeeSummaries: report.employeeSummaries, from: report.from, to: report.to });
    } catch (exportError) { error.textContent = exportError.message; }
    finally { restore(); }
  });
  excelButton.addEventListener("click", async () => {
    if (!current) return;
    const report = current;
    const restore = setBusy(excelButton, "Menyiapkan Excel...");
    try {
      await nextFrame();
      await exportAttendanceExcel({ rows: report.rows, employeeSummaries: report.employeeSummaries, from: report.from, to: report.to });
    } catch (exportError) { error.textContent = exportError.message; }
    finally { restore(); }
  });
  await loadEmployeeChoices();
  await load();
}
