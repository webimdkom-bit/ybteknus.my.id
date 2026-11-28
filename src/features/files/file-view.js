import {
  listAdmins,
  listBusinessesForOrganization,
  listEmployees,
  listEmployeesForBusiness,
  listFilesForBusiness,
  listFilesForOrganization,
  listFilesForUser,
  listOwners,
} from "../../lib/firestore/repositories.js";
import { requestFileAccess, requestFileDeletion } from "../files/file-upload-service.js";
import { escapeHtml, safeUrl, setBusy } from "../../lib/utils/html.js";
import { canAccessBusiness } from "../permissions/permission-service.js";

const FILE_SOURCE_LABELS = Object.freeze({
  "task-evidence": "Bukti tugas",
  "request-evidence": "Bukti pengajuan",
  "daily-report-evidence": "Lampiran laporan harian",
});

const FILE_TARGET_LABELS = Object.freeze({
  taskReport: "Tugas",
  operationalRequest: "Pengajuan",
  dailyReport: "Laporan harian",
});

const prettify = (value) => String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());

const sourceLabel = (file) => {
  const [category, detail] = String(file.category || "").split(":");
  const label = FILE_SOURCE_LABELS[category]
    || FILE_TARGET_LABELS[file.targetType]
    || (category ? prettify(category) : "Lainnya");
  return detail ? `${label} · ${detail}` : label;
};

const formatDate = (value) => String(value?.toDate ? value.toDate().toLocaleDateString("id-ID") : value || "").slice(0, 10);

export async function openFileManager({ profile }) {
  const overlay = document.createElement("div");
  overlay.className = "file-overlay";
  overlay.innerHTML = `<section class="file-modal" role="dialog" aria-modal="true" aria-labelledby="file-title"><div class="file-modal-head"><div><p class="eyebrow">FILE MANAGER</p><h2 id="file-title">Dokumen & lampiran</h2><p>Lihat asal file, pengirim, dan bisnisnya. File dibuka langsung di sini.</p></div><button class="icon-button file-close" aria-label="Tutup">×</button></div><div class="file-list"><p class="file-empty">Memuat file...</p></div></section>`;
  document.body.append(overlay);
  const viewer = document.createElement("div");
  viewer.className = "task-photo-viewer";
  viewer.hidden = true;
  viewer.innerHTML = `<div class="task-photo-viewer-inner file-viewer-inner"><button class="icon-button task-photo-close" aria-label="Tutup">×</button><div class="file-viewer-content"></div><div class="file-viewer-actions"><button class="secondary-button" type="button" data-file-viewer-download>Unduh file</button></div></div>`;
  overlay.append(viewer);
  const hideViewer = () => {
    viewer.hidden = true;
    viewer.querySelector(".file-viewer-content").innerHTML = "";
    activeFile = null;
    activeUrl = "";
  };
  let activeFile = null;
  let activeUrl = "";
  viewer.querySelector(".task-photo-close").addEventListener("click", hideViewer);
  viewer.addEventListener("click", (event) => { if (event.target === viewer) hideViewer(); });
  const close = () => overlay.remove();
  overlay.querySelector(".file-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const resolveNames = async () => {
    const users = new Map();
    const businesses = new Map();
    if (profile.role === "employee") {
      users.set(profile.uid, profile.displayName || profile.email || "Saya");
      return { users, businesses };
    }
    try {
      const groups = profile.role === "owner"
        ? await Promise.all([
          listEmployees(profile.organizationId).catch(() => []),
          listOwners(profile.organizationId).catch(() => []),
          listAdmins(profile.organizationId).catch(() => []),
        ])
        : await Promise.all((profile.businessIds || []).map((id) => listEmployeesForBusiness(profile.organizationId, id).catch(() => [])));
      groups.flat().forEach((user) => users.set(user.id || user.uid, user.displayName || user.email || "Tanpa nama"));
      const records = await listBusinessesForOrganization(profile.organizationId).catch(() => []);
      records.forEach((business) => businesses.set(business.id, business.name));
    } catch (error) { console.warn("[files] names:", error?.message || error); }
    return { users, businesses };
  };

  const downloadFile = async (file) => {
    const url = (await requestFileAccess(file.id))?.url;
    if (!url) throw new Error("URL unduh tidak tersedia.");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Gagal mengunduh file.");
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = file.fileName || "file";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const list = overlay.querySelector(".file-list");
  const load = async () => {
    try {
      const filesPromise = profile.role === "employee"
        ? listFilesForUser(profile.uid)
        : profile.role === "owner"
          ? listFilesForOrganization(profile.organizationId)
          : (await Promise.all((profile.businessIds || []).map((id) => listFilesForBusiness(profile.organizationId, id)))).flat();
      const [files, names] = await Promise.all([filesPromise, resolveNames()]);
      list.innerHTML = files.length
        ? files.map((file) => {
          const uploader = names.users.get(file.uploadedBy) || "Pengirim tidak diketahui";
          const business = file.businessId ? (names.businesses.get(file.businessId) || "Bisnis tidak ditemukan") : "Tanpa bisnis";
          return `<article class="file-row"><div class="file-icon">${file.resourceType === "image" ? "IMG" : "DOC"}</div><div class="file-copy"><strong>${escapeHtml(file.fileName)}</strong><span>Dari ${escapeHtml(sourceLabel(file))} · ${escapeHtml(file.access || "public")} · ${escapeHtml(formatDate(file.createdAt))}</span><small class="file-meta">Dikirim oleh ${escapeHtml(uploader)} · Bisnis: ${escapeHtml(business)}</small></div><div class="file-actions"><button class="secondary-button" data-file-open="${file.id}">Buka</button><button class="secondary-button" data-file-download="${file.id}">Unduh</button>${(profile.role === "owner" || file.uploadedBy === profile.uid || (profile.role === "admin" && canAccessBusiness(profile, file.businessId))) ? `<button class="reject-registration" data-file-delete="${file.id}">Hapus</button>` : ""}</div></article>`;
        }).join("")
        : `<div class="role-empty-state"><strong>Belum ada file.</strong><span>Lampiran tugas dan dokumen akan tampil di sini.</span></div>`;
      list.querySelectorAll("[data-file-open]").forEach((button) => button.addEventListener("click", async () => {
        const file = files.find((item) => item.id === button.dataset.fileOpen);
        if (!file) return;
        const restore = setBusy(button, "Membuka...");
        try {
          const url = (await requestFileAccess(file.id))?.url;
          if (!url) throw new Error("URL file tidak tersedia.");
          activeFile = file;
          activeUrl = url;
          const content = viewer.querySelector(".file-viewer-content");
          if (file.resourceType === "image") {
            content.innerHTML = `<img src="${safeUrl(url)}" alt="${escapeHtml(file.fileName)}" />`;
          } else if (/\.pdf$/i.test(file.fileName || "") || file.format === "pdf") {
            content.innerHTML = `<iframe src="${safeUrl(url)}" title="${escapeHtml(file.fileName)}"></iframe>`;
          } else {
            content.innerHTML = `<p class="task-empty">Pratinjau tidak tersedia untuk jenis ini. Gunakan tombol Unduh file.</p>`;
          }
          viewer.hidden = false;
        } catch (error) { window.alert(error.message); }
        finally { restore(); }
      }));
      list.querySelectorAll("[data-file-download]").forEach((button) => button.addEventListener("click", async () => {
        const file = files.find((item) => item.id === button.dataset.fileDownload);
        if (!file) return;
        const restore = setBusy(button, "Mengunduh...");
        try { await downloadFile(file); }
        catch (error) { window.alert(error.message); }
        finally { restore(); }
      }));
      list.querySelectorAll("[data-file-delete]").forEach((button) => button.addEventListener("click", async () => {
        if (!window.confirm("Hapus file ini secara permanen? File dan datanya akan dihapus.")) return;
        try { await requestFileDeletion(button.dataset.fileDelete); hideViewer(); await load(); }
        catch (error) { window.alert(error.message); }
      }));
    } catch (error) { list.innerHTML = `<p class="file-error">${escapeHtml(error.message)}</p>`; }
  };
  await load();

  viewer.querySelector("[data-file-viewer-download]").addEventListener("click", async () => {
    if (!activeFile || !activeUrl) return;
    const button = viewer.querySelector("[data-file-viewer-download]");
    const restore = setBusy(button, "Mengunduh...");
    try {
      const response = await fetch(activeUrl);
      if (!response.ok) throw new Error("Gagal mengunduh file.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = activeFile.fileName || "file";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { window.alert(error.message); }
    finally { restore(); }
  });
}
