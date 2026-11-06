
import {
  initializeApp,
  getApps,
  cert,
} from "firebase-admin/app";

import { getMessaging } from "firebase-admin/messaging";
import { readFileSync } from "node:fs";

// ==========================================
// LOAD FIREBASE SERVICE ACCOUNT
// ==========================================
let serviceAccount;

try {
  serviceAccount = JSON.parse(
    readFileSync(
      new URL(
        "./config/firebase-service-account.json",
        import.meta.url
      ),
      "utf8"
    )
  );

  if (
    !serviceAccount.project_id ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error("Firebase service account credentials are incomplete.");
  }
} catch (error) {
  console.error(
    "Firebase service account loading failed:",
    error.message
  );

  throw error;
}

// ==========================================
// INITIALIZE FIREBASE ADMIN
// ==========================================
const existingApp = getApps().find(
  (app) => app.name === "[DEFAULT]"
);

const firebaseApp =
  existingApp ||
  initializeApp({
    credential: cert(serviceAccount),
  });

// ==========================================
// EXPORT FIREBASE MESSAGING
// ==========================================
export const firebaseMessaging = getMessaging(firebaseApp);

console.log("Firebase Admin initialized successfully.");
