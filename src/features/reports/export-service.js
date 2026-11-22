const COLUMNS = [
  { key: "date", label: "Tanggal" },
  { key: "employee", label: "Karyawan" },
  { key: "business", label: "Bisnis" },
  { key: "shift", label: "Shift" },
  { key: "checkIn", label: "Check-in" },
  { key: "checkOut", label: "Check-out" },
  { key: "status", label: "Status" },
  { key: "lateMinutes", label: "Telat (menit)" },
  { key: "earlyMinutes", label: "Pulang awal (menit)" },
  { key: "locationStatus", label: "Lokasi" },
];

export function reportFilename(extension, from, to) {
  return `laporan-absensi-${from}-sd-${to}.${extension}`;
}

export async function exportAttendanceExcel({ rows, from, to }) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows.map((row) => Object.fromEntries(COLUMNS.map((column) => [column.label, row[column.key]]))));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Absensi");
  XLSX.writeFile(workbook, reportFilename("xlsx", from, to));
}

export async function exportAttendancePdf({ rows, from, to, title = "Laporan Absensi" }) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default || autoTableModule;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Periode: ${from} s/d ${to}`, 14, 22);
  autoTable(doc, {
    startY: 26,
    head: [COLUMNS.map((column) => column.label)],
    body: rows.map((row) => COLUMNS.map((column) => row[column.key])),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [52, 74, 35] },
  });
  doc.save(reportFilename("pdf", from, to));
}
