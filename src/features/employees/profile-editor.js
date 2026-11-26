import { updateUserProfile } from "../../lib/firestore/repositories.js";
import { requestProfileUploadSignature, uploadFileToCloudinary } from "../files/file-upload-service.js";
import { escapeHtml, safeUrl, setBusy, updateBusyLabel } from "../../lib/utils/html.js";
import { logAuditSafe } from "../audit-trail/index.js";

export async function openProfileEditor(profile, onSaved) {
  const overlay = document.createElement("div");
  overlay.className = "profile-overlay";
  overlay.innerHTML = `<section class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title"><div class="profile-modal-head"><div><p class="eyebrow">MY PROFILE</p><h2 id="profile-edit-title">Edit profil</h2></div><button class="icon-button profile-close" aria-label="Tutup">×</button></div><form class="profile-form"><div class="profile-photo-wrap"><div class="profile-photo">${safeUrl(profile.photoURL) ? `<img src="${safeUrl(profile.photoURL)}" alt="Foto profil" />` : escapeHtml((profile.displayName || "U").slice(0, 1))}</div><input type="file" accept="image/*" data-profile-photo hidden /><button class="secondary-button" type="button" data-profile-photo-button>Ganti foto</button></div><div class="field"><label for="profile-phone">Nomor telepon</label><input id="profile-phone" name="phone" value="${escapeHtml(profile.phone || "")}" /></div><div class="field"><label for="profile-position">Jabatan</label><input id="profile-position" name="position" value="${escapeHtml(profile.position || "")}" /></div><div class="field"><label for="profile-identity">Identitas karyawan</label><input id="profile-identity" name="identityNumber" value="${escapeHtml(profile.identityNumber || "")}" /></div><p class="profile-message" role="status"></p><p class="profile-error" role="alert"></p><button class="primary-button" type="submit">Simpan profil <span>→</span></button></form></section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".profile-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const form = overlay.querySelector(".profile-form");
  const fileInput = overlay.querySelector("[data-profile-photo]");
  const photoButton = overlay.querySelector("[data-profile-photo-button]");
  let photoURL = profile.photoURL || "";
  photoButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const errorElement = overlay.querySelector(".profile-error");
    const messageElement = overlay.querySelector(".profile-message");
    errorElement.textContent = "";
    if (!file.type.startsWith("image/")) { errorElement.textContent = "Hanya file gambar yang didukung."; return; }
    if (file.size > 10 * 1024 * 1024) { errorElement.textContent = "Ukuran maksimal 10 MB."; return; }
    const restoreButton = setBusy(photoButton, "Mengunggah 0%");
    fileInput.disabled = true;
    try {
      const signature = await requestProfileUploadSignature(file.name);
      const uploaded = await uploadFileToCloudinary({
        file,
        signature,
        folder: signature.folder,
        publicId: signature.public_id,
        onProgress: (progress) => updateBusyLabel(photoButton, `Mengunggah ${progress}%`),
      });
      photoURL = uploaded.secure_url;
      overlay.querySelector(".profile-photo").innerHTML = `<img src="${safeUrl(photoURL)}" alt="Foto profil" />`;
      messageElement.textContent = "Foto berhasil diunggah. Simpan untuk menerapkan.";
    } catch (error) {
      errorElement.textContent = error.message;
    } finally {
      restoreButton();
      fileInput.disabled = false;
      fileInput.value = "";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const error = overlay.querySelector(".profile-error");
    const message = overlay.querySelector(".profile-message");
    const restoreButton = setBusy(form.querySelector('button[type="submit"]'), "Menyimpan profil...");
    error.textContent = "";
    try {
      await updateUserProfile(profile.uid, {
        phone: data.phone.trim(),
        position: data.position.trim(),
        identityNumber: data.identityNumber.trim(),
        photoURL,
      });
      logAuditSafe({ profile, action: "account_status_changed", targetType: "user", targetId: profile.uid, metadata: { field: "profile_updated" } });
      message.textContent = "Profil berhasil disimpan.";
      Object.assign(profile, { phone: data.phone.trim(), position: data.position.trim(), identityNumber: data.identityNumber.trim(), photoURL });
      if (typeof onSaved === "function") onSaved(profile);
      setTimeout(close, 700);
    } catch (submitError) {
      error.textContent = submitError.message;
    } finally {
      restoreButton();
    }
  });
}
