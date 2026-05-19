import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getApps, cert, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { b as private_env } from "./shared-server.js";
let cachedNebrasApp = null;
let nebrasInitError = null;
function readEnv(name) {
  return String(private_env[name] || process.env[name] || "").trim();
}
function parseServiceAccount(inline, path) {
  if (inline) {
    const trimmed = inline.trim();
    if (trimmed.startsWith("{")) {
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        throw new Error(
          "service account inline JSON غير صالح: " + (err?.message || err)
        );
      }
    }
    const abs = resolve(trimmed);
    const raw = readFileSync(abs, "utf8");
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`الملف ${abs} ليس JSON صالحاً: ` + (err?.message || err));
    }
  }
  if (path) {
    const abs = resolve(path);
    const raw = readFileSync(abs, "utf8");
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`الملف ${abs} ليس JSON صالحاً: ` + (err?.message || err));
    }
  }
  return null;
}
function loadNebrasServiceAccount() {
  const combined = readEnv("NEBRAS_SERVICE_ACCOUNT");
  const jsonInline = readEnv("NEBRAS_SERVICE_ACCOUNT_JSON") || readEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  const jsonPath = readEnv("NEBRAS_SERVICE_ACCOUNT_PATH") || readEnv("FIREBASE_SERVICE_ACCOUNT_PATH");
  if (!combined && !jsonInline && !jsonPath) return null;
  return parseServiceAccount(combined || jsonInline, jsonPath);
}
function initNebrasApp() {
  if (cachedNebrasApp) return cachedNebrasApp;
  if (nebrasInitError) throw nebrasInitError;
  try {
    if (getApps().length > 0) {
      const def = getApps().find((a) => a.name === "[DEFAULT]");
      if (def) {
        cachedNebrasApp = def;
        return def;
      }
    }
    const sa = loadNebrasServiceAccount();
    if (!sa) {
      throw new Error(
        "Service Account غير مُعرَّف — أضف NEBRAS_SERVICE_ACCOUNT_JSON / NEBRAS_SERVICE_ACCOUNT_PATH أو FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_PATH في ملف .env."
      );
    }
    const options = {
      credential: cert(sa),
      projectId: sa.project_id,
      databaseURL: private_env.FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL || `https://${sa.project_id}-default-rtdb.firebaseio.com`
    };
    const bucketEnv = readEnv("NEBRAS_STORAGE_BUCKET") || readEnv("FIREBASE_STORAGE_BUCKET");
    const bucketFromSa = typeof sa.storage_bucket === "string" ? sa.storage_bucket : "";
    const bucket = bucketEnv || bucketFromSa || (sa.project_id ? `${sa.project_id}.appspot.com` : "");
    if (bucket) options.storageBucket = bucket;
    const app = initializeApp(options);
    cachedNebrasApp = app;
    return app;
  } catch (err) {
    nebrasInitError = /** @type {Error} */
    err;
    throw err;
  }
}
function getAdminApp() {
  return initNebrasApp();
}
function getNebrasAdminApp() {
  return initNebrasApp();
}
function getAdminAuthService() {
  return getAuth(getAdminApp());
}
function getAdminDatabase() {
  return getDatabase(getAdminApp());
}
const NEBRAS_FIRESTORE_DATABASE_ID = String(
  private_env.NEBRAS_FIRESTORE_DATABASE_ID || process.env.NEBRAS_FIRESTORE_DATABASE_ID || "default"
);
function getNebrasFirestoreAdmin() {
  return getFirestore(initNebrasApp(), NEBRAS_FIRESTORE_DATABASE_ID);
}
async function verifyIdToken(idToken) {
  const token = (idToken || "").toString().trim();
  if (!token) throw new Error("missing_id_token");
  return getAdminAuthService().verifyIdToken(token, true);
}
function isAdminConfigured() {
  return Boolean(
    readEnv("NEBRAS_SERVICE_ACCOUNT") || readEnv("NEBRAS_SERVICE_ACCOUNT_JSON") || readEnv("NEBRAS_SERVICE_ACCOUNT_PATH") || readEnv("FIREBASE_SERVICE_ACCOUNT_JSON") || readEnv("FIREBASE_SERVICE_ACCOUNT_PATH")
  );
}
async function sendTopicMessage({ topic, title, body, data = {} }) {
  const app = getAdminApp();
  const messaging = getMessaging(app);
  const safeData = (
    /** @type {Record<string,string>} */
    {}
  );
  for (const [k, v] of Object.entries(data || {})) {
    if (v === null || v === void 0) continue;
    safeData[k] = typeof v === "string" ? v : String(v);
  }
  const message = {
    topic,
    notification: { title, body },
    data: safeData,
    android: {
      priority: "high",
      notification: {
        channelId: "nebras_notifications",
        clickAction: "FLUTTER_NOTIFICATION_CLICK"
      }
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: "default"
        }
      }
    }
  };
  return messaging.send(message);
}
export {
  getAdminDatabase as a,
  getNebrasFirestoreAdmin as b,
  getAdminAuthService as c,
  getNebrasAdminApp as g,
  isAdminConfigured as i,
  sendTopicMessage as s,
  verifyIdToken as v
};
