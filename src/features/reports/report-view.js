import { getDateKey } from "../attendance/attendance-service.js";
import { listBusinessesForOrganization } from "../../lib/firestore/repositories.js";
import { exportAttendanceExcel, exportAttendancePdf } from "./export-service.js";
import { buildAttendanceReport } from "./report-service.js";

export async function openReportViewer({ profile }) {
  const today = getDateKey(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const overlay = document.createElement("div");
  overlay.className = "report-overlay";
  overlay.innerHTML = `<section class="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
    <div class="report-modal-head"><div><p class="eyebrow">ATTENDANCE REPORTS</p><h2 id="report-title">Laporan absensi</h2><p>Rekap kehadiran harian/bulanan per karyawan, bisnis, atau seluruh bisnis.</p></div><button class="icon-button report-close" aria-label="Tutup">×</button></div>
    <form class="report-filters">
      <div class="field"><label for="report-from">Dari tanggal</label><input id="report-from" name="from" type="date" value="${today}" required /></div>
      <div class="field"><label for="report-to">Sampai tanggal</label><input id="report-to" name="to" type="date" value="${today}" required /></div>
      <div class="field"><label for="report-business">Bisnis</label><select id="report-business"><option value="">Semua bisnis</option></select></div>
      <div class="field"><label for="report-employee">Karyawan</label><select id="report-employee"><option value="">Semua karyawan</option></select></div>
      <div class="report-filter-actions"><button type="button" class="secondary-button" data-report-preset="daily">Hari ini</button><button type="button" class="secondary-button" data-report-preset="monthly">Bulan ini</button><button class="primary-button" type="submit">Muat laporan</button></div>
    </form>
    <p class="report-error" role="alert"></p>
    <div class="report-summary" data-report-summary></div>
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
  const employeeSelect = overlay.querySelector("#report-employee");
  const error = overlay.querySelector(".report-error");
  const summary = overlay.querySelector("[data-report-summary]");
  const table = overlay.querySelector("[data-report-table]");
  const pdfButton = overlay.querySelector('[data-export="pdf"]');
  const excelButton = overlay.querySelector('[data-export="excel"]');
  let current = null;

  try {
    const businesses = profile.role === "owner" ? await listBusinessesForOrganization(profile.organizationId) : [];
    businessSelect.innerHTML = `<option value="">Semua bisnis</option>${businesses.map((business) => `<option value="${business.id}">${escapeHtml(business.name)}</option>`).join("")}`;
  } catch (loadError) {
    error.textContent = loadError.message;
  }

  overlay.querySelectorAll("[data-report-preset]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.reportPreset === "daily") {
      fromInput.value = today;
      toInput.value = today;
    } else {
      fromInput.value = monthStart;
      toInput.value = today;
    }
  }));

  const load = async () => {
    error.textContent = "";
    const from = fromInput.value;
    const to = toInput.value;
    if (!from || !to || from > to) {
      error.textContent = "Periode tidak valid.";
      return;
    }
    summary.textContent = "Memuat laporan...";
    table.innerHTML = `<div class="role-empty-state"><strong>Memuat data...</strong><span>Mengumpulkan absensi karyawan.</span></div>`;
    pdfButton.disabled = true;
    excelButton.disabled = true;
    try {
      const report = await buildAttendanceReport({ profile, from, to, businessId: businessSelect.value, userId: employeeSelect.value });
      current = report;
      const { summary: totals, rows } = report;
      summary.innerHTML = `<div class="report-stat"><span>TOTAL DATA</span><strong>${totals.total}</strong></div><div class="report-stat"><span>KARYAWAN</span><strong>${totals.employees}</strong></div><div class="report-stat"><span>HADIR</span><strong>${totals.hadir}</strong></div><div class="report-stat"><span>TERLAMBAT</span><strong>${totals.terlambat}</strong></div><div class="report-stat"><span>ALPA</span><strong>${totals.alpa}</strong></div>`;
      table.innerHTML = rows.length
        ? `<table class="report-table"><thead><tr><th>Tanggal</th><th>Karyawan</th><th>Bisnis</th><th>Shift</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>Telat</th></tr></thead><tbody>${rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.employee)}</td><td>${escapeHtml(row.business)}</td><td>${escapeHtml(row.shift)}</td><td>${escapeHtml(row.checkIn)}</td><td>${escapeHtml(row.checkOut)}</td><td>${escapeHtml(row.status)}</td><td>${row.lateMinutes}m</td></tr>`).join("")}</tbody></table>${rows.length > 100 ? `<p class="report-note">Menampilkan 100 dari ${rows.length} baris. Ekspor untuk data lengkap.</p>` : ""}`
        : `<div class="role-empty-state"><strong>Tidak ada data absensi.</strong><span>Coba periode atau filter lain.</span></div>`;
      employeeSelect.innerHTML = `<option value="">Semua karyawan</option>${report.employees.map((employee) => `<option value="${employee.id}" ${employee.id === employeeSelect.value ? "selected" : ""}>${escapeHtml(employee.displayName || employee.email)}</option>`).join("")}`;
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
    pdfButton.disabled = true;
    try { await exportAttendancePdf({ rows: current.rows, from: current.from, to: current.to }); }
    catch (exportError) { error.textContent = exportError.message; }
    pdfButton.disabled = false;
  });
  excelButton.addEventListener("click", async () => {
    if (!current) return;
    excelButton.disabled = true;
    try { await exportAttendanceExcel({ rows: current.rows, from: current.from, to: current.to }); }
    catch (exportError) { error.textContent = exportError.message; }
    excelButton.disabled = false;
  });
  await load();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
