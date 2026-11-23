import { listFilesForBusiness, listFilesForUser } from "../../lib/firestore/repositories.js";
import { requestFileAccess, requestFileDeletion } from "../files/file-upload-service.js";
import { escapeHtml } from "../../lib/utils/html.js";

export async function openFileManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "file-overlay";
  overlay.innerHTML = `<section class="file-modal" role="dialog" aria-modal="true" aria-labelledby="file-title"><div class="file-modal-head"><div><p class="eyebrow">FILE MANAGER</p><h2 id="file-title">Dokumen & lampiran</h2><p>Kelola file yang tersimpan di Cloudinary dengan metadata di Firestore.</p></div><button class="icon-button file-close" aria-label="Tutup">×</button></div><div class="file-list"><p class="file-empty">Memuat file...</p></div></section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".file-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const list = overlay.querySelector(".file-list");
  const load = async () => {
    try {
      const files = profile.role === "employee"
        ? await listFilesForUser(profile.uid)
        : (await Promise.all((profile.businessIds || []).map((id) => listFilesForBusiness(profile.organizationId, id)))).flat();
      list.innerHTML = files.length
        ? files.map((file) => `<article class="file-row"><div class="file-icon">${file.resourceType === "image" ? "IMG" : "DOC"}</div><div class="file-copy"><strong>${escapeHtml(file.fileName)}</strong><span>${escapeHtml(file.category || "file")} · ${escapeHtml(file.access || "public")} · ${escapeHtml(String(file.createdAt?.toDate ? file.createdAt.toDate().toLocaleDateString("id-ID") : file.createdAt || "").slice(0, 10))}</span></div><div class="file-actions"><button class="secondary-button" data-file-open="${file.id}">Buka</button>${file.status !== "deleted" && (profile.role === "owner" || file.uploadedBy === profile.uid) ? `<button class="reject-registration" data-file-delete="${file.id}">Hapus</button>` : ""}</div></article>`).join("")
        : `<div class="role-empty-state"><strong>Belum ada file.</strong><span>Lampiran tugas dan dokumen akan tampil di sini.</span></div>`;
      list.querySelectorAll("[data-file-open]").forEach((button) => button.addEventListener("click", async () => {
        try {
          const result = await requestFileAccess(button.dataset.fileOpen);
          if (result?.url) window.open(result.url, "_blank", "noopener,noreferrer");
        } catch (error) { window.alert(error.message); }
      }));
      list.querySelectorAll("[data-file-delete]").forEach((button) => button.addEventListener("click", async () => {
        if (!window.confirm("Hapus file ini dari Cloudinary?")) return;
        try { await requestFileDeletion(button.dataset.fileDelete); await load(); }
        catch (error) { window.alert(error.message); }
      }));
    } catch (error) { list.innerHTML = `<p class="file-error">${escapeHtml(error.message)}</p>`; }
  };
  await load();
}
