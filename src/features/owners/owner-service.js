import { createUserWithEmailAndPassword, deleteUser, getAuth, sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { deleteApp, initializeApp } from "firebase/app";
import { auth, firebaseConfig } from "../../lib/firebase/firebase.js";
import { createUserProfile, deleteUserProfile, listOwners, updateUserProfile } from "../../lib/firestore/repositories.js";

export { listOwners };

export async function createOwnerAccount({ organizationId, name, email }) {
  const normalizedEmail = email.trim().toLowerCase();
  const secondaryApp = initializeApp(firebaseConfig, `owner-provisioning-${crypto.randomUUID()}`);
  const secondaryAuth = getAuth(secondaryApp);
  let user;
  let profileCreated = false;

  try {
    const result = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizedEmail,
      `${crypto.randomUUID()}Aa1!`,
    );
    user = result.user;
    await updateProfile(user, { displayName: name.trim() });
    await createUserProfile(user.uid, {
      displayName: name.trim(),
      email: normalizedEmail,
      role: "owner",
      status: "active",
      organizationId,
      businessIds: [],
    });
    profileCreated = true;
    await sendPasswordResetEmail(auth, normalizedEmail);
    await signOut(secondaryAuth);
    return { uid: user.uid, email: normalizedEmail };
  } catch (error) {
    if (profileCreated) await deleteUserProfile(user.uid).catch(() => {});
    if (user && secondaryAuth.currentUser) {
      await deleteUser(secondaryAuth.currentUser).catch(() => {});
    }
    throw error;
  } finally {
    await deleteApp(secondaryApp);
  }
}

export function deactivateOwner(userId) {
  return updateUserProfile(userId, { status: "inactive" });
}
