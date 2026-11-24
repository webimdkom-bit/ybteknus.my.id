import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./admin.js";

export async function assertActiveActor(uid) {
  if (!uid) return null;
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists || snapshot.data().status !== "active") return null;
  return { uid, ...snapshot.data() };
}
