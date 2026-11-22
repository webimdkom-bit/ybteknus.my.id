import { auth } from "../../lib/firebase/firebase.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Sesi tidak ditemukan.");
  return user.getIdToken();
}

async function post(endpoint, payload) {
  const token = await getIdToken();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
  return data;
}

export async function requestUploadSignature({ taskId, fileName, resourceType }) {
  return post("/api/file-upload", { taskId, fileName, resourceType });
}

export function recordFileMetadata(payload) {
  return post("/api/file-metadata", payload);
}

export function requestFileDeletion(fileId) {
  return post("/api/file-delete", { fileId });
}

export function requestFileAccess(fileId) {
  return post("/api/file-access", { fileId });
}

export async function uploadFileToCloudinary({ file, signature, folder, publicId }) {
  if (!file) throw new Error("File wajib dipilih.");
  if (!ALLOWED_TYPES.some((type) => file.type?.startsWith(type))) throw new Error("Hanya gambar, PDF, atau dokumen Word yang didukung.");
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
