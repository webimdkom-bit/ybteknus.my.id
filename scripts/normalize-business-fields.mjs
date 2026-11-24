import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { normalizeBusinessFields } from "../src/lib/utils/business.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    args[key] = value;
    if (value !== "true") index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const serviceAccountPath = args["service-account"] || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const dryRun = args["dry-run"] === "true";
let serviceAccount = null;

if (serviceAccountPath) {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
}

if (!serviceAccount) {
  console.error("Usage: node scripts/normalize-business-fields.mjs [--service-account <path.json>] [--dry-run]");
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const snapshot = await db.collection("businesses").get();
const changes = [];

for (const doc of snapshot.docs) {
  const data = doc.data();
  const normalized = normalizeBusinessFields(data);
  const before = {
    status: data.status ?? null,
    acceptingRegistrations: data.acceptingRegistrations ?? null,
  };
  const after = {
    status: normalized.status,
    acceptingRegistrations: normalized.acceptingRegistrations,
  };
  if (before.status === after.status && before.acceptingRegistrations === after.acceptingRegistrations) continue;
  changes.push({ id: doc.id, name: data.name || null, before, after });
  if (!dryRun) {
    await doc.ref.update({
      status: after.status,
      acceptingRegistrations: after.acceptingRegistrations,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

console.log(JSON.stringify({ dryRun, scanned: snapshot.size, changed: changes.length, changes }, null, 2));
