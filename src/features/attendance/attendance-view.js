import { getBusiness, getDailyReport, listBusinessesForOrganization } from "../../lib/firestore/repositories.js";
import { getDailyAttendance, parseGoogleMapsCoordinates, recordGpsAttendance, saveBusinessLocation } from "./attendance-service.js";
import { logAuditSafe } from "../audit-trail/index.js";
import { getDateKey } from "../../lib/utils/time.js";
import { isDailyReportReady } from "../../lib/utils/daily-report.js";
import { openDailyReportViewer } from "../reports/daily-report-view.js";

export async function openLocationSettings({ profile }) {
  const businesses = await listBusinessesForOrganization(profile.organizationId);
  const visibleBusinesses = profile.role === "owner" ? businesses : businesses.filter((business) => profile.businessIds?.includes(business.id));
  const overlay = createOverlay();
  overlay.innerHTML = `
    <section class="attendance-modal" role="dialog" aria-modal="true" aria-labelledby="location-title">
      <div class="attendance-modal-head"><div><p class="eyebrow">BUSINESS SETTINGS</p><h2 id="location-title">Lokasi absensi</h2><p>Atur titik kantor dan batas radius check-in.</p></div><button class="icon-button attendance-close" aria-label="Tutup">×</button></div>
      <form class="location-form" id="location-form">
        <div class="field"><label for="location-business">Pilih bisnis</label><select id="location-business" required><option value="">Pilih bisnis</option>${visibleBusinesses.map((business) => `<option value="${business.id}">${business.name}</option>`).join("")}</select></div>
        <div class="field"><label for="location-name">Nama lokasi</label><input id="location-name" name="name" placeholder="Kantor pusat" required /></div>
        <div class="field"><label for="location-url">Link Google Maps <span>(opsional)</span></label><input id="location-url" name="googleMapsUrl" type="url" placeholder="https://maps.google.com/..." /><small class="field-hint">Link dengan format pin @latitude,longitude akan diambil otomatis.</small></div>
        <div class="location-coordinate-grid"><div class="field"><label for="location-latitude">Latitude</label><input id="location-latitude" name="latitude" type="number" step="any" placeholder="-6.200000" required /></div><div class="field"><label for="location-longitude">Longitude</label><input id="location-longitude" name="longitude" type="number" step="any" placeholder="106.816666" required /></div></div>
        <div class="field"><label for="location-radius">Radius absensi (meter)</label><input id="location-radius" name="radiusMeters" type="number" min="10" max="5000" value="100" required /><small class="field-hint">Rekomendasi kantor: 50–100 meter.</small></div>
        <label class="location-active"><input name="isActive" type="checkbox" checked /> Lokasi aktif untuk absensi</label>
        <p class="attendance-error" role="alert"></p><button class="primary-button" type="submit">Simpan lokasi <span>→</span></button>
      </form>
    </section>
  `;
  const close = () => overlay.remove();
  overlay.querySelector(".attendance-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  const businessSelect = overlay.querySelector("#location-business");
  const loadBusiness = async () => {
    if (!businessSelect.value) return;
    const business = await getBusiness(businessSelect.value);
    const location = business?.location;
    if (!location) return;
    ["name", "latitude", "longitude", "radiusMeters", "googleMapsUrl"].forEach((field) => { const input = overlay.querySelector(`[name=${field}]`); if (input) input.value = location[field] ?? ""; });
    overlay.querySelector("[name=isActive]").checked = location.isActive !== false;
  };
  businessSelect.addEventListener("change", loadBusiness);
  if (visibleBusinesses.length === 1) { businessSelect.value = visibleBusinesses[0].id; await loadBusiness(); }
  overlay.querySelector("[name=googleMapsUrl]").addEventListener("change", (event) => {
    const coordinates = parseGoogleMapsCoordinates(event.target.value);
    if (coordinates) { overlay.querySelector("[name=latitude]").value = coordinates.latitude; overlay.querySelector("[name=longitude]").value = coordinates.longitude; }
  });
  overlay.querySelector("#location-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".attendance-error");
    try {
      if (!businessSelect.value) throw new Error("Pilih bisnis terlebih dahulu.");
      const data = Object.fromEntries(new FormData(form));
      await saveBusinessLocation(businessSelect.value, { ...data, isActive: form.querySelector("[name=isActive]").checked });
      logAuditSafe({ profile, action: "business_location_changed", targetType: "business", targetId: businessSelect.value, businessId: businessSelect.value, metadata: { radiusMeters: data.radiusMeters, isActive: form.querySelector("[name=isActive]").checked } });
      close();
    } catch (submissionError) { error.textContent = submissionError.message; }
  });
}

export async function openAttendancePanel({ profile }) {
  const businessId = profile.businessIds?.[0];
  const overlay = createOverlay();
  overlay.innerHTML = `
    <section class="attendance-modal attendance-checkin-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-title">
      <div class="attendance-modal-head"><div><p class="eyebrow">TODAY'S ATTENDANCE</p><h2 id="attendance-title">Absensi hari ini</h2><p>GPS akan digunakan untuk memvalidasi lokasi Anda.</p></div><button class="icon-button attendance-close" aria-label="Tutup">×</button></div>
      <div class="gps-status"><div class="gps-orb">GPS</div><div><strong>Location check</strong><span>Pastikan izin lokasi browser aktif.</span></div></div>
      <div class="attendance-action-grid"><button class="primary-button" data-attendance-type="check-in">Check-in <span>→</span></button><button class="secondary-button" data-attendance-type="check-out">Check-out <span>→</span></button></div>
      <div class="attendance-report-actions"><button class="text-button" data-attendance-daily-report>Buka laporan harian</button></div>
      <p class="attendance-result" role="status">Belum ada aktivitas hari ini.</p><p class="attendance-error" role="alert"></p>
    </section>
  `;
  const close = () => overlay.remove();
  overlay.querySelector(".attendance-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  const attendanceButtons = overlay.querySelectorAll("[data-attendance-type]");
  const result = overlay.querySelector(".attendance-result");
  const refreshAttendanceState = async () => {
    if (!businessId) {
      attendanceButtons.forEach((button) => { button.disabled = true; });
      overlay.querySelector(".attendance-error").textContent = "Akun Anda belum memiliki bisnis aktif.";
      return;
    }
    try {
      const [dailyAttendance, dailyReport] = await Promise.all([
        getDailyAttendance({ userId: profile.uid, businessId }),
        getDailyReport(profile.uid, getDateKey()),
      ]);
      const reportReady = isDailyReportReady(dailyReport?.status);
      const checkInButton = overlay.querySelector('[data-attendance-type="check-in"]');
      const checkOutButton = overlay.querySelector('[data-attendance-type="check-out"]');
      checkInButton.disabled = Boolean(dailyAttendance.checkIn);
      checkOutButton.disabled = !dailyAttendance.checkIn || Boolean(dailyAttendance.checkOut) || !reportReady;
      if (dailyAttendance.checkOut) result.textContent = `Check-out ${dailyAttendance.checkOut.recordedTime || "tercatat"}. Status: ${dailyAttendance.checkOut.attendanceStatus || "tercatat"}.`;
      else if (dailyAttendance.checkIn && !reportReady) result.textContent = `Check-in ${dailyAttendance.checkIn.recordedTime || "tercatat"}. Kirim laporan harian sebelum check-out.`;
      else if (dailyAttendance.checkIn) result.textContent = `Check-in ${dailyAttendance.checkIn.recordedTime || "tercatat"}. Menunggu check-out.`;
      else result.textContent = "Belum ada aktivitas hari ini.";
    } catch (error) {
      overlay.querySelector(".attendance-error").textContent = error.message;
    }
  };
  overlay.querySelector("[data-attendance-daily-report]")?.addEventListener("click", () => openDailyReportViewer({ profile }));
  attendanceButtons.forEach((button) => button.addEventListener("click", async () => {
    const error = overlay.querySelector(".attendance-error");
    error.textContent = "";
    if (!businessId) { error.textContent = "Akun Anda belum memiliki bisnis aktif."; return; }
    button.disabled = true;
    button.textContent = "Mencari lokasi...";
    try {
      const attendance = await recordGpsAttendance({ userId: profile.uid, organizationId: profile.organizationId, businessId, type: button.dataset.attendanceType });
      result.textContent = `${attendance.type === "check-in" ? "Check-in" : "Check-out"} berhasil. Jarak Anda ${attendance.distanceMeters}m dari titik kantor.`;
      result.classList.add("is-success");
    } catch (attendanceError) { error.textContent = attendanceError.message; }
    button.innerHTML = `${button.dataset.attendanceType === "check-in" ? "Check-in" : "Check-out"} <span>→</span>`;
    await refreshAttendanceState();
  }));
  refreshAttendanceState();
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "attendance-overlay";
  document.body.append(overlay);
  return overlay;
}
