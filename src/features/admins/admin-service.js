import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase/firebase.js";
import { listAdmins, saveAdminAccess, updateUserProfile } from "../../lib/firestore/repositories.js";
import { provisionUser } from "../users/provision-service.js";

export const ADMIN_PERMISSION_OPTIONS = Object.freeze([
  { id: "manageEmployees", label: "Kelola employee" },
  { id: "manageSchedules", label: "Kelola jadwal" },
  { id: "viewAttendance", label: "Lihat absensi" },
  { id: "approveLeave", label: "Setujui izin/cuti" },
  { id: "approveCorrections", label: "Setujui koreksi absensi" },
  { id: "manageOvertime", label: "Kelola lembur" },
  { id: "viewReports", label: "Lihat laporan" },
  { id: "manageTasks", label: "Kelola tugas" },
  { id: "reviewSubmissions", label: "Review laporan pekerjaan" },
]);

export { listAdmins };

export async function createAdminAccount({ organizationId, name, email, access }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await provisionUser({ role: "admin", name, email: normalizedEmail, organizationId, access });
  await sendPasswordResetEmail(auth, normalizedEmail).catch(() => {});
  return { uid: result.uid, email: normalizedEmail };
}

export function updateAdminAccess({ userId, organizationId, access }) {
  return saveAdminAccess({ userId, organizationId, access });
}

export function deactivateAdmin(userId) {
  return updateUserProfile(userId, { status: "inactive" });
}
