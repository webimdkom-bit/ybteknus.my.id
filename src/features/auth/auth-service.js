import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "../../lib/firebase/firebase.js";
import { createRegistration, createUserProfile, getUserProfile } from "../../lib/firestore/repositories.js";
import { NOTIFICATION_TYPES, notifySafe } from "../notifications/notification-service.js";

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signIn(email, password) {
  const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return getUserProfile(result.user.uid);
}

export async function registerEmployee({ name, email, password, business }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  await updateProfile(result.user, { displayName: name });

  await createUserProfile(result.user.uid, {
    displayName: name,
    email: normalizedEmail,
    role: "employee",
    status: "pending",
    organizationId: business.organizationId,
    businessIds: [business.id],
  });

  await createRegistration({
    userId: result.user.uid,
    name,
    email: normalizedEmail,
    organizationId: business.organizationId,
    businessId: business.id,
    businessName: business.name,
  });

  const payload = {
    type: NOTIFICATION_TYPES.registrationNew,
    title: "Registrasi karyawan baru",
    body: `${name} mendaftar pada ${business.name} dan menunggu persetujuan.`,
    organizationId: business.organizationId,
    businessId: business.id,
    targetType: "registration",
  };
  notifySafe({ ...payload, audience: "owner" });
  notifySafe({ ...payload, audience: "admins", permission: "manageEmployees" });

  return result.user;
}

export function signOutUser() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim().toLowerCase());
}
