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

  return result.user;
}

export function signOutUser() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim().toLowerCase());
}
