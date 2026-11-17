const env = import.meta.env;

export const firebaseConfig = Object.freeze({
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || ""
});

export const firebaseConfigured = ["apiKey", "authDomain", "projectId", "appId"].every(
  key => typeof firebaseConfig[key] === "string" &&
    firebaseConfig[key].length > 0 &&
    !firebaseConfig[key].includes("YOUR_")
);

export const databaseConfigured = firebaseConfigured &&
  firebaseConfig.databaseURL.startsWith("https://") &&
  !firebaseConfig.databaseURL.includes("YOUR_");
