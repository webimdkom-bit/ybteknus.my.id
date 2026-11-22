import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

let authClient = null;

function getAuthClient() {
  if (!authClient) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : undefined;
    const app = initializeApp(
      serviceAccount
        ? { credential: serviceAccount }
        : { projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID },
    );
    authClient = getAuth(app);
  }
  return authClient;
}

export async function verifyFirebaseToken(authorizationHeader) {
  const token = String(authorizationHeader || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return null;
  const auth = getAuthClient();
  const decoded = await auth.verifyIdToken(token);
  return decoded;
}
