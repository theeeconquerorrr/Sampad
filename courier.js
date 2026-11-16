import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
    getDatabase,
    onDisconnect,
    ref,
    serverTimestamp,
    set,
    update
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

const signInForm = document.getElementById("courierSignInForm");
const shareForm = document.getElementById("courierShareForm");
const authMessage = document.getElementById("courierAuthMessage");
const message = document.getElementById("courierMessage");
const startButton = document.getElementById("startSharing");
const stopButton = document.getElementById("stopSharing");
let auth;
let database;
let currentUser = null;
let watchId = null;
let locationRef = null;
let disconnectOperation = null;
let lastLocation = null;
let lastSentAt = 0;
let writeInProgress = false;
let pendingWrite = Promise.resolve();
let shareGeneration = 0;
let isStopping = false;

function showMessage(element, text, isError = false) {
    element.textContent = text;
    element.style.color = isError ? "#b91c1c" : "#334155";
}

function validateOrderId(value) {
    return /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

function stopGpsWatch() {
    shareGeneration += 1;
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    startButton.disabled = !currentUser || isStopping;
    stopButton.disabled = true;
}

async function stopSharing(finalMessage = "Location sharing is stopped.") {
    if (isStopping) return false;
    isStopping = true;
    stopGpsWatch();
    const activeLocationRef = locationRef;
    locationRef = null;
    if (!activeLocationRef) {
        isStopping = false;
        startButton.disabled = !currentUser;
        showMessage(message, finalMessage);
        return true;
    }

    await pendingWrite;
    let updateFailed = false;
    let cleanupFailed = false;
    if (lastLocation) {
        try {
            await update(activeLocationRef, { active: false, updatedAt: serverTimestamp() });
        } catch (error) {
            updateFailed = true;
            console.error("Could not mark courier location sharing as stopped.", error);
            showMessage(message, `Location stop update failed (${error.code || "unknown error"}).`, true);
        }
    }
    if (disconnectOperation && !updateFailed) {
        try {
            await disconnectOperation.cancel();
        } catch (error) {
            cleanupFailed = true;
            console.error("Could not cancel the courier disconnect handler.", error);
            showMessage(message, `Disconnect cleanup failed (${error.code || "unknown error"}).`, true);
        }
    }

    disconnectOperation = null;
    lastLocation = null;
    lastSentAt = 0;
    isStopping = false;
    startButton.disabled = !currentUser;
    if (!updateFailed && !cleanupFailed) showMessage(message, finalMessage);
    return !updateFailed && !cleanupFailed;
}

if (!firebaseConfigured) {
    showMessage(authMessage, "Live tracking is not configured. Add the Firebase web-app values in firebase-config.js.", true);
    signInForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
    shareForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
} else {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        database = getDatabase(app);

        onAuthStateChanged(auth, user => {
            currentUser = user;
            signInForm.querySelectorAll("input").forEach(input => { input.disabled = Boolean(user); });
            signInForm.querySelector('button[type="submit"]').hidden = Boolean(user);
            document.getElementById("courierSignOut").hidden = !user;
            startButton.disabled = !user || watchId !== null || isStopping;
            showMessage(authMessage, user
                ? `Signed in as ${user.email || "courier"}.`
                : "Sign in with the courier account assigned to the delivery.");
            if (!user && (watchId !== null || locationRef !== null)) void stopSharing("Signed out. GPS sharing is stopped.");
        }, error => {
            console.error("Firebase courier authentication state failed.", error);
            showMessage(authMessage, "Could not check sign-in status. Please reload and try again.", true);
        });

        signInForm.addEventListener("submit", async event => {
            event.preventDefault();
            try {
                await signInWithEmailAndPassword(
                    auth,
                    document.getElementById("courierEmail").value.trim(),
                    document.getElementById("courierPassword").value
                );
            } catch (error) {
                console.error("Firebase courier sign-in failed.", error);
                showMessage(authMessage, `Sign-in failed (${error.code || "unknown error"}).`, true);
            }
        });

        document.getElementById("courierSignOut").addEventListener("click", async () => {
            if (watchId !== null || locationRef !== null) await stopSharing();
            try {
                await signOut(auth);
                document.getElementById("courierPassword").value = "";
            } catch (error) {
                console.error("Firebase courier sign-out failed.", error);
                showMessage(authMessage, `Sign-out failed (${error.code || "unknown error"}).`, true);
            }
        });

        shareForm.addEventListener("submit", async event => {
            event.preventDefault();
            if (!currentUser) {
                showMessage(message, "Sign in to the assigned courier account first.", true);
                return;
            }
            if (watchId !== null || locationRef !== null || isStopping) {
                showMessage(message, "Stop the current location-sharing session before starting another.", true);
                return;
            }
            if (!window.isSecureContext || !navigator.geolocation) {
                showMessage(message, "GPS sharing requires a supported browser on HTTPS or localhost.", true);
                return;
            }

            const orderId = document.getElementById("courierOrderId").value.trim();
            if (!validateOrderId(orderId)) {
                showMessage(message, "Enter a valid assigned order ID.", true);
                return;
            }

            locationRef = ref(database, `orders/${orderId}/tracking`);
            const generation = ++shareGeneration;
            startButton.disabled = true;
            stopButton.disabled = false;
            showMessage(message, "Requesting device location permission…");

            watchId = navigator.geolocation.watchPosition(async position => {
                if (generation !== shareGeneration || writeInProgress || Date.now() - lastSentAt < 5000) return;
                const coordinates = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: Math.round(position.coords.accuracy)
                };
                const payload = { ...coordinates, active: true, updatedAt: serverTimestamp() };
                lastLocation = coordinates;
                writeInProgress = true;
                pendingWrite = (async () => {
                    try {
                        await set(locationRef, payload);
                        if (generation === shareGeneration) {
                            if (!disconnectOperation) {
                                disconnectOperation = onDisconnect(locationRef);
                                await disconnectOperation.update({ active: false, updatedAt: serverTimestamp() });
                            }
                            lastSentAt = Date.now();
                            showMessage(message, `Sharing GPS location (±${coordinates.accuracy} m). Stop sharing when the delivery ends.`);
                        }
                    } catch (error) {
                        console.error("Courier GPS update failed.", error);
                        if (generation === shareGeneration) {
                            const failureMessage = `Location update failed (${error.code || "check order assignment and network"}). Sharing has stopped.`;
                            stopGpsWatch();
                            stopButton.disabled = false;
                            queueMicrotask(() => { void stopSharing(failureMessage); });
                        }
                    } finally {
                        writeInProgress = false;
                    }
                })();
            }, error => {
                const reasons = {
                    1: "Location permission was denied.",
                    2: "The device could not determine a location.",
                    3: "The location request timed out."
                };
                console.error("Courier device geolocation failed.", error);
                void stopSharing(`${reasons[error.code] || "GPS location failed."} Sharing has stopped.`);
            }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
        });

        stopButton.addEventListener("click", () => { void stopSharing(); });
    } catch (error) {
        console.error("Firebase courier initialization failed.", error);
        showMessage(authMessage, "Firebase could not be initialized. Check the web-app configuration and reload.", true);
        signInForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
        shareForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
    }
}
