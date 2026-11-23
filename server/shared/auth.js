import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "./admin";

export async function verifyFirebaseToken(authorizationHeader) {
  const token = String(authorizationHeader || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return null;
  const auth = getAuth(getAdminApp());
  const decoded = await auth.verifyIdToken(token);
  return decoded;
}
