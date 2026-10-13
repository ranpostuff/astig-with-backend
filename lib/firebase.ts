import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const DEFAULT_DATABASE_URL =
  "https://astig-backend-default-rtdb.asia-southeast1.firebasedatabase.app";

function normalizeDatabaseUrl(value: unknown) {
  const configured = typeof value === "string" ? value.trim() : "";
  if (!configured) return DEFAULT_DATABASE_URL;

  // Values copied from the Firebase data viewer can accidentally include its
  // selected path (for example `/null` or `/:null`). The SDK expects only the
  // database origin here; keeping that suffix makes every request fail with
  // "Invalid token in path".
  try {
    const parsed = new URL(configured);
    if (!/\.firebaseio\.com$|\.firebasedatabase\.app$/i.test(parsed.hostname)) {
      return DEFAULT_DATABASE_URL;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return DEFAULT_DATABASE_URL;
  }
}

const databaseURL = normalizeDatabaseUrl(import.meta.env.VITE_FIREBASE_DATABASE_URL);

const configuredApiKey =
  import.meta.env.VITE_FIREBASE_API_KEY ||
  "AIzaSyDMHGI5uVWHYslyFwj2xc4GgtwMq5XlZB0";

export const firebaseConfig = {
  apiKey: configuredApiKey || "configuration-required",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "astig-backend.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "astig-backend",
  databaseURL,
  storageBucket: "astig-backend.firebasestorage.app",
  messagingSenderId: "654047354712",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:654047354712:web:6e5ac155545d034a3c8f2d",
  measurementId: "G-RWEV8WSG73",
};

export const isFirebaseConfigured = Boolean(configuredApiKey);
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDatabase = getDatabase(firebaseApp, databaseURL);

export function requireFirebaseConfiguration() {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase is not fully configured. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID to the environment file.",
    );
  }
}
