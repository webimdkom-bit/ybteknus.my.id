import { auth } from "../../lib/firebase/firebase";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Sesi tidak ditemukan.");
  return user.getIdToken();
}

export async function requestUploadSignature({ taskId, fileName }) {
  const token = await getIdToken();
  const response = await fetch("/api/file-upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ taskId, fileName }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal membuat tanda tangan upload.");
  return data;
}

export async function uploadFileToCloudinary({ file, signature, folder, publicId }) {
  if (!file) throw new Error("File wajib dipilih.");
  if (!/^image\//.test(file.type)) throw new Error("Hanya file gambar yang didukung.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Ukuran file maksimal 10 MB.");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("signature", signature.signature);
  formData.append("timestamp", String(signature.timestamp));
  if (publicId) formData.append("public_id", publicId);
  if (folder) formData.append("folder", folder);
  const response = await fetch(signature.uploadUrl, { method: "POST", body: formData });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Upload ke Cloudinary gagal.");
  return data;
}
