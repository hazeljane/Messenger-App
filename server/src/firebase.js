
import "dotenv/config";

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

function loadServiceAccount() {
  // First: Read credentials from Render environment variable.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (raw) {
    let serviceAccount;

    try {
      serviceAccount = JSON.parse(raw);
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON."
      );
    }

    if (
      !serviceAccount.project_id ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error(
        "Firebase service account credentials are incomplete."
      );
    }

    serviceAccount.private_key =
      serviceAccount.private_key.replace(/\\n/g, "\n");

    console.log("Firebase credentials loaded from environment.");

    return serviceAccount;
  }

  // Second: Use local JSON file during development.
  try {
    const serviceAccount = JSON.parse(
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
      throw new Error(
        "Firebase service account credentials are incomplete."
      );
    }

    console.log("Firebase credentials loaded from local file.");

    return serviceAccount;
  } catch (error) {
    throw new Error(
      `Firebase credentials could not be loaded: ${error.message}`
    );
  }
}

// ==========================================
// INITIALIZE FIREBASE ADMIN
// ==========================================

let messaging = null;

try {
  const serviceAccount = loadServiceAccount();

  const existingApp = getApps().find(
    (app) => app.name === "[DEFAULT]"
  );

  const firebaseApp =
    existingApp ||
    initializeApp({
      credential: cert(serviceAccount),
    });

  messaging = getMessaging(firebaseApp);

  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error(
    "Firebase Admin initialization failed:",
    error.message
  );

  // Chat and Socket.IO can continue without push notifications.
}

// ==========================================
// EXPORT FIREBASE MESSAGING
// ==========================================

export const firebaseMessaging = messaging;
