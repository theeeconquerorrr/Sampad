export const firebaseConfig = Object.freeze({
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    appId: "YOUR_APP_ID"
});

export const firebaseConfigured = Object.values(firebaseConfig).every(
    value => typeof value === "string" && value.length > 0 && !value.includes("YOUR_")
);
