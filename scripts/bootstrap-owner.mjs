import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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
const email = String(args.email || "").trim().toLowerCase();
const password = String(args.password || "");
const name = String(args.name || "").trim();
const organization = String(args.organization || "").trim();

if (!serviceAccountPath || !email || !password || !name || !organization) {
  console.error("Usage: node scripts/bootstrap-owner.mjs --service-account <path.json> --email <email> --password <password> --name <nama> --organization <nama-organisasi>");
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

try {
  const user = await auth.createUser({ email, password, displayName: name });
  const organizationId = randomUUID();
  const now = new Date().toISOString();
  await db.collection("users").doc(user.uid).set({
    uid: user.uid,
    displayName: name,
    email,
    role: "owner",
    status: "active",
    organizationId,
    businessIds: [],
    permissions: [],
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("organizations").doc(organizationId).set({
    name: organization,
    ownerId: user.uid,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  console.log("Owner berhasil dibuat.");
  console.log(`UID: ${user.uid}`);
  console.log(`Organization ID: ${organizationId}`);
  console.log(`Email: ${email}`);
} catch (error) {
  console.error("Gagal membuat owner:", error.message);
  process.exit(1);
}
