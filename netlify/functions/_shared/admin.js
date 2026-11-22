import { getApp, getApps, initializeApp } from "firebase-admin/app";

export function getAdminApp() {
  if (getApps().length) return getApp();
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : undefined;
  return initializeApp(
    serviceAccount
      ? { credential: serviceAccount }
      : { projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID },
  );
}
