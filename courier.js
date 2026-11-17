import { initializeApp } from "firebase/app";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "firebase/auth";
import {
    getDatabase,
    onDisconnect,
    ref,
    runTransaction,
    serverTimestamp,
    set,
    update
} from "firebase/database";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

const signInForm = document.getElementById("courierSignInForm");
const shareForm = document.getElementById("courierShareForm");
const authMessage = document.getElementById("courierAuthMessage");
const message = document.getElementById("courierMessage");
const startButton = document.getElementById("startSharing");
const stopButton = document.getElementById("stopSharing");
const pickedUpButton = document.getElementById("markPickedUp");
const deliveredButton = document.getElementById("markDelivered");
let auth;
let database;
let currentUser = null;
let currentOrderId = null;
let currentOrderStatus = null;
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

function updateStatusButtons() {
    pickedUpButton.disabled = !currentUser || currentOrderStatus !== "packed";
    deliveredButton.disabled = !currentUser || currentOrderStatus !== "picked_up";
}

function clientError(code, text) {
    const error = new Error(text);
    error.code = code;
    return error;
}

async function claimOrder(orderId) {
    const orderRef = ref(database, `orders/${orderId}`);
    const result = await runTransaction(orderRef, order => {
        if (!order) return;
        if (order.courierUid === currentUser.uid) {
            return order.active === true && ["packed", "picked_up"].includes(order.status)
                ? order
                : undefined;
        }
        if (order.courierUid !== "" || order.status !== "placed" || order.active !== false) return;
        return { ...order, courierUid: currentUser.uid, active: true, status: "packed" };
    }, { applyLocally: false });

    if (!result.committed) {
        throw clientError("order/unavailable", "This order is unavailable or has already been claimed.");
    }
    return result.snapshot.val().status;
}

async function updateOrderStatus(orderId, status) {
    const orderRef = ref(database, `orders/${orderId}`);
    const result = await runTransaction(orderRef, order => {
        if (!order || order.courierUid !== currentUser.uid || order.active !== true) return;
        if (order.status === "packed" && status === "picked_up") {
            return { ...order, status, active: true };
        }
        if (order.status === "picked_up" && status === "delivered") {
            return { ...order, status, active: false };
        }
    }, { applyLocally: false });

    if (!result.committed) {
        throw clientError("order/invalid-status", "The order cannot move to that status.");
    }
    return result.snapshot.val().status;
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
            updateStatusButtons();
            showMessage(authMessage, user
                ? `Signed in as ${user.email || "courier"}.`
                : "Sign in with an administrator-approved courier account.");
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
                showMessage(message, "Enter a valid demo order ID.", true);
                return;
            }

            startButton.disabled = true;
            showMessage(message, "Claiming the order…");
            try {
                currentOrderStatus = await claimOrder(orderId);
                currentOrderId = orderId;
                updateStatusButtons();
            } catch (error) {
                console.error("Courier order claim failed.", error);
                showMessage(message, error.code === "PERMISSION_DENIED"
                    ? "This account is not approved as a courier, or that order is not available."
                    : error.code === "order/unavailable"
                        ? "That order is unavailable or has already been claimed."
                        : `Could not claim the order (${error.code || "unknown error"}).`, true);
                startButton.disabled = false;
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

        async function changeOrderStatus(status) {
            if (!currentUser || !currentOrderId) {
                showMessage(message, "Claim an order before changing its status.", true);
                return;
            }
            if (status === "delivered" && (watchId !== null || locationRef !== null)) {
                const stopped = await stopSharing();
                if (!stopped) return;
            }
            pickedUpButton.disabled = true;
            deliveredButton.disabled = true;
            try {
                currentOrderStatus = await updateOrderStatus(currentOrderId, status);
                showMessage(message, status === "delivered"
                    ? "Order marked delivered. Location sharing has ended."
                    : "Order marked picked up.");
                updateStatusButtons();
            } catch (error) {
                console.error("Courier order status update failed.", error);
                showMessage(message, `Could not update order status (${error.code || "unknown error"}).`, true);
                updateStatusButtons();
            }
        }

        pickedUpButton.addEventListener("click", () => { void changeOrderStatus("picked_up"); });
        deliveredButton.addEventListener("click", () => { void changeOrderStatus("delivered"); });
    } catch (error) {
        console.error("Firebase courier initialization failed.", error);
        showMessage(authMessage, "Firebase could not be initialized. Check the web-app configuration and reload.", true);
        signInForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
        shareForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
    }
}
