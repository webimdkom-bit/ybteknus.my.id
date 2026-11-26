import { hoursLabel } from "../attendance/worked-hours.js";

const COLUMNS = [
  { key: "date", label: "Tanggal" },
  { key: "employee", label: "Karyawan" },
  { key: "business", label: "Bisnis" },
  { key: "shift", label: "Shift" },
  { key: "checkIn", label: "Check-in" },
  { key: "checkOut", label: "Check-out" },
  { key: "status", label: "Status" },
  { key: "lateMinutes", label: "Telat (menit)" },
  { key: "workedHours", label: "Total jam" },
  { key: "earlyMinutes", label: "Pulang awal (menit)" },
  { key: "locationStatus", label: "Lokasi" },
];

const SUMMARY_COLUMNS = [
  { key: "employee", label: "Karyawan" },
  { key: "business", label: "Bisnis" },
  { key: "workedDays", label: "Hari kerja" },
  { key: "totalHoursLabel", label: "Total jam" },
  { key: "absoluteHoursLabel", label: "Jam absolut" },
  { key: "overtimeHoursLabel", label: "Lembur approved" },
];

export function reportFilename(extension, from, to) {
  return `laporan-absensi-${from}-sd-${to}.${extension}`;
}

function summaryRows(employeeSummaries = []) {
  return employeeSummaries.map((item) => Object.fromEntries(SUMMARY_COLUMNS.map((column) => [column.label, item[column.key]])));
}

function periodRows(employeeSummaries = [], period) {
  return employeeSummaries.flatMap((item) => (item[period] || []).map((entry) => ({
    Karyawan: item.employee,
    Bisnis: item.business,
    Periode: entry.label,
    Hari: entry.days,
    "Jam absolut": hoursLabel(entry.absoluteMinutes),
    "Lembur approved": hoursLabel(entry.overtimeMinutes),
    "Total jam": entry.labelHours,
  })));
}

export async function exportAttendanceExcel({ rows, employeeSummaries = [], from, to }) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows.map((row) => Object.fromEntries(COLUMNS.map((column) => [column.label, row[column.key]])))),
    "Absensi",
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows(employeeSummaries)), "Rekap karyawan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(periodRows(employeeSummaries, "weeks")), "Rekap mingguan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(periodRows(employeeSummaries, "months")), "Rekap bulanan");
  XLSX.writeFile(workbook, reportFilename("xlsx", from, to));
}

export async function exportAttendancePdf({ rows, employeeSummaries = [], from, to, title = "Laporan Absensi" }) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const { autoTable } = autoTableModule;
  const renderTable = typeof autoTable === "function" ? autoTable : autoTableModule.default;
  if (typeof renderTable !== "function") throw new Error("Modul PDF tidak tersedia.");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Periode: ${from} s/d ${to}`, 14, 22);
  renderTable(doc, {
    startY: 26,
    head: [SUMMARY_COLUMNS.map((column) => column.label)],
    body: employeeSummaries.map((item) => SUMMARY_COLUMNS.map((column) => item[column.key])),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [52, 74, 35] },
  });
  let detailY = (doc.lastAutoTable?.finalY || 40) + 12;
  if (detailY > 165) {
    doc.addPage();
    detailY = 16;
  }
  doc.setFontSize(11);
  doc.text("Detail absensi", 14, detailY - 4);
  renderTable(doc, {
    startY: detailY,
    head: [COLUMNS.map((column) => column.label)],
    body: rows.map((row) => COLUMNS.map((column) => row[column.key])),
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: [52, 74, 35] },
  });
  doc.save(reportFilename("pdf", from, to));
}
