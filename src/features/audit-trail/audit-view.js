import { listAuditLogs } from "../../lib/firestore/repositories.js";
import { formatInAppZone } from "../../lib/utils/time.js";

export async function openAuditViewer({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "audit-overlay";
  overlay.innerHTML = `<section class="audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-title"><div class="audit-modal-head"><div><p class="eyebrow">AUDIT TRAIL</p><h2 id="audit-title">Aktivitas penting</h2><p>Riwayat perubahan sensitif bersifat permanen dan tidak dapat diubah.</p></div><button class="icon-button audit-close" aria-label="Tutup">×</button></div><div class="audit-list"><p class="audit-empty">Memuat aktivitas...</p></div></section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".audit-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const list = overlay.querySelector(".audit-list");
  try {
    const logs = profile.role === "admin"
      ? (await Promise.all((profile.businessIds || []).map((id) => listAuditLogs(profile.organizationId, { businessId: id })))).flat()
      : await listAuditLogs(profile.organizationId);
    list.innerHTML = logs.length
      ? `<div class="audit-table"><div class="audit-header"><span>AKSI</span><span>AKTOR</span><span>TARGET</span><span>WAKTU</span></div>${logs.map((log) => `<div class="audit-row"><div class="audit-action"><strong>${escapeHtml(log.action)}</strong><span>${escapeHtml(log.targetType)}${log.targetId ? ` · ${escapeHtml(log.targetId)}` : ""}</span></div><span class="audit-actor">${escapeHtml(log.actorName || log.actorId || "-")}<small>${escapeHtml(log.actorRole || "")}</small></span><span class="audit-target">${escapeHtml(log.businessId || log.organizationId || "-")}<small>${escapeHtml(Object.entries(log.metadata || {}).map(([key, value]) => `${key}: ${value}`).join(", "))}</small></span><span class="audit-time">${formatAuditTime(log.timestamp)}</span></div>`).join("")}</div>`
      : `<div class="role-empty-state"><strong>Belum ada aktivitas tercatat.</strong><span>Perubahan penting akan muncul di sini.</span></div>`;
  } catch (error) {
    list.innerHTML = `<p class="audit-error">${escapeHtml(error.message)}</p>`;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatAuditTime(value) {
  if (!value) return "-";
  return formatInAppZone(value, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
