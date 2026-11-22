import { createUserWithEmailAndPassword, deleteUser, getAuth, sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { deleteApp, initializeApp } from "firebase/app";
import { auth, firebaseConfig } from "../../lib/firebase/firebase.js";
import { createUserProfile, deleteUserProfile, listAdmins, saveAdminAccess, updateUserProfile } from "../../lib/firestore/repositories.js";

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
  const secondaryApp = initializeApp(firebaseConfig, `admin-provisioning-${crypto.randomUUID()}`);
  const secondaryAuth = getAuth(secondaryApp);
  let user;
  let profileCreated = false;

  try {
    const result = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, `${crypto.randomUUID()}Aa1!`);
    user = result.user;
    await updateProfile(user, { displayName: name.trim() });
    await createUserProfile(user.uid, {
      displayName: name.trim(),
      email: normalizedEmail,
      role: "admin",
      status: "active",
      organizationId,
      businessIds: [],
      permissions: [],
    });
    profileCreated = true;
    await saveAdminAccess({ userId: user.uid, organizationId, access });
    await sendPasswordResetEmail(auth, normalizedEmail);
    await signOut(secondaryAuth);
    return { uid: user.uid, email: normalizedEmail };
  } catch (error) {
    if (profileCreated) await deleteUserProfile(user.uid).catch(() => {});
    if (user && secondaryAuth.currentUser) await deleteUser(secondaryAuth.currentUser).catch(() => {});
    throw error;
  } finally {
    await deleteApp(secondaryApp);
  }
}

export function updateAdminAccess({ userId, organizationId, access }) {
  return saveAdminAccess({ userId, organizationId, access });
}

export function deactivateAdmin(userId) {
  return updateUserProfile(userId, { status: "inactive" });
}
