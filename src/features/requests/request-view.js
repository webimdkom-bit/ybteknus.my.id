import {
  createOperationalRequest,
  listOperationalRequestsForBusiness,
  listOperationalRequestsForOrganization,
  listOperationalRequestsForUser,
  reviewOperationalRequest,
} from "../../lib/firestore/repositories.js";
import { getBusiness } from "../../lib/firestore/repositories.js";

const REQUEST_TYPES = Object.freeze([
  ["permission", "Izin"],
  ["leave", "Cuti"],
  ["offsite", "Absensi di luar lokasi"],
  ["attendance-correction", "Koreksi absensi"],
  ["overtime", "Lembur"],
]);

export async function openRequestManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "request-overlay";
  overlay.innerHTML = profile.role === "employee" ? employeeRequestMarkup() : reviewRequestMarkup(profile);
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".request-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  if (profile.role === "employee") await setupEmployeeRequests(overlay, profile);
  else await setupRequestReview(overlay, profile);
}

function employeeRequestMarkup() {
  return `<section class="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><div class="request-modal-head"><div><p class="eyebrow">MY REQUESTS</p><h2 id="request-title">Pengajuan</h2><p>Ajukan izin, cuti, koreksi absensi, atau lembur.</p></div><button class="icon-button request-close" aria-label="Tutup">×</button></div><div class="request-layout"><form class="request-form"><div class="field"><label for="request-type">Jenis pengajuan</label><select id="request-type" name="type" required>${REQUEST_TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div><div class="field"><label for="request-business">Bisnis</label><select id="request-business" name="businessId" required><option value="">Memuat bisnis...</option></select></div><div class="request-date-grid"><div class="field"><label for="request-start">Mulai</label><input id="request-start" name="startDate" type="date" required /></div><div class="field"><label for="request-end">Selesai</label><input id="request-end" name="endDate" type="date" required /></div></div><div class="field"><label for="request-reason">Alasan</label><textarea id="request-reason" name="reason" rows="4" placeholder="Jelaskan kebutuhan Anda" required></textarea></div><div class="field"><label for="request-evidence">Link bukti <span>(opsional)</span></label><input id="request-evidence" name="evidenceUrl" type="url" placeholder="https://..." /></div><p class="request-message" role="status"></p><p class="request-error" role="alert"></p><button class="primary-button" type="submit">Kirim pengajuan <span>→</span></button></form><div class="request-history"><h3>Riwayat pengajuan</h3><div class="request-list"><p class="request-empty">Memuat pengajuan...</p></div></div></div></section>`;
}

function reviewRequestMarkup(profile) {
  return `<section class="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><div class="request-modal-head"><div><p class="eyebrow">REQUEST REVIEW</p><h2 id="request-title">Review pengajuan</h2><p>${profile.role === "owner" ? "Review seluruh pengajuan organization." : "Review pengajuan pada bisnis yang ditugaskan."}</p></div><button class="icon-button request-close" aria-label="Tutup">×</button></div><div class="request-list request-review-list"><p class="request-empty">Memuat pengajuan...</p></div></section>`;
}

async function setupEmployeeRequests(overlay, profile) {
  const businessSelect = overlay.querySelector("#request-business");
  const businesses = (await Promise.all((profile.businessIds || []).map((id) => getBusiness(id)))).filter(Boolean);
  businessSelect.innerHTML = businesses.length ? businesses.map((business) => `<option value="${business.id}">${business.name}</option>`).join("") : `<option value="">Belum ada bisnis</option>`;
  const list = overlay.querySelector(".request-list");
  const load = async () => {
    const requests = (await listOperationalRequestsForUser(profile.uid)).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    list.innerHTML = requests.length ? requests.map(requestRow).join("") : `<div class="request-empty-state"><strong>Belum ada pengajuan.</strong><span>Pengajuan Anda akan tampil di sini.</span></div>`;
  };
  await load();
  overlay.querySelector(".request-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".request-error");
    const message = form.querySelector(".request-message");
    error.textContent = "";
    message.textContent = "";
    const data = Object.fromEntries(new FormData(form));
    if (data.endDate < data.startDate) { error.textContent = "Tanggal selesai tidak boleh sebelum tanggal mulai."; return; }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await createOperationalRequest({ ...data, userId: profile.uid, organizationId: profile.organizationId });
      form.reset();
      message.textContent = "Pengajuan berhasil dikirim dan menunggu persetujuan.";
      await load();
    } catch (submissionError) { error.textContent = submissionError.message; }
    submit.disabled = false;
  });
}

async function setupRequestReview(overlay, profile) {
  const list = overlay.querySelector(".request-review-list");
  try {
    const requests = profile.role === "owner"
      ? await listOperationalRequestsForOrganization(profile.organizationId)
      : (await Promise.all((profile.businessIds || []).map((businessId) => listOperationalRequestsForBusiness(profile.organizationId, businessId)))).flat();
    const pending = requests.filter((request) => request.status === "pending");
    list.innerHTML = pending.length ? pending.map((request) => reviewRequestRow(request)).join("") : `<div class="request-empty-state"><strong>All clear.</strong><span>Tidak ada pengajuan yang menunggu review.</span></div>`;
    list.querySelectorAll("[data-request-action]").forEach((button) => button.addEventListener("click", async () => {
      const request = pending.find((item) => item.id === button.dataset.requestId);
      if (!request) return;
      const reviewNote = window.prompt("Catatan review (opsional):", "");
      button.disabled = true;
      try {
        await reviewOperationalRequest(request.id, { status: button.dataset.requestAction, reviewedBy: profile.uid, reviewedAt: new Date().toISOString(), reviewNote: reviewNote || "" });
        await setupRequestReview(overlay, profile);
      } catch (error) { button.closest(".request-row").querySelector(".request-error").textContent = error.message; button.disabled = false; }
    }));
  } catch (error) { list.innerHTML = `<p class="request-error">${error.message}</p>`; }
}

function requestRow(request) {
  const label = REQUEST_TYPES.find(([value]) => value === request.type)?.[1] || request.type;
  return `<article class="request-row"><div class="request-row-mark">${label.slice(0, 1)}</div><div><strong>${label}</strong><span>${request.startDate} – ${request.endDate}</span><small>${request.reason}</small></div><b class="request-status ${request.status}">${request.status}</b></article>`;
}

function reviewRequestRow(request) {
  const label = REQUEST_TYPES.find(([value]) => value === request.type)?.[1] || request.type;
  return `<article class="request-row"><div class="request-row-mark">${label.slice(0, 1)}</div><div><strong>${label}</strong><span>${request.startDate} – ${request.endDate} · ${request.businessId}</span><small>${request.reason}</small></div><div class="request-actions"><button class="approve-registration" data-request-action="approved" data-request-id="${request.id}">Setujui</button><button class="reject-registration" data-request-action="rejected" data-request-id="${request.id}">Tolak</button></div><p class="request-error" role="alert"></p></article>`;
}
