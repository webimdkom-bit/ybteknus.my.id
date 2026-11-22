import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase/firebase.js";
import { listOwners, updateUserProfile } from "../../lib/firestore/repositories.js";
import { provisionUser } from "../users/provision-service.js";

export { listOwners };

export async function createOwnerAccount({ organizationId, name, email }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await provisionUser({ role: "owner", name, email: normalizedEmail, organizationId });
  await sendPasswordResetEmail(auth, normalizedEmail).catch(() => {});
  return { uid: result.uid, email: normalizedEmail };
}

export function deactivateOwner(userId) {
  return updateUserProfile(userId, { status: "inactive" });
}
