import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getDatabase, onValue, ref } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

const signInForm = document.getElementById("customerSignInForm");
const trackForm = document.getElementById("customerTrackForm");
const authMessage = document.getElementById("customerAuthMessage");
const trackMessage = document.getElementById("customerTrackMessage");
const details = document.getElementById("liveTrackingDetails");
let auth;
let database;
let currentUser = null;
let stopLocationListener = null;
let stopStatusListener = null;

function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("text-red-700", isError);
    element.classList.toggle("text-slate-600", !isError);
}

function stopTrackingListeners() {
    if (stopLocationListener) stopLocationListener();
    if (stopStatusListener) stopStatusListener();
    stopLocationListener = null;
    stopStatusListener = null;
    details.classList.add("hidden");
    document.getElementById("liveOrderStatus").textContent = "";
    document.getElementById("liveLocationState").textContent = "";
    document.getElementById("liveLocationCoordinates").textContent = "";
    document.getElementById("liveLocationAccuracy").textContent = "";
    document.getElementById("liveLocationUpdatedAt").textContent = "";
    const mapLink = document.getElementById("liveMapLink");
    mapLink.href = "#";
    mapLink.classList.add("hidden");
}

if (!firebaseConfigured) {
    showMessage(authMessage, "Live tracking is not configured. Add the Firebase web-app values in pulsedrop-realtime/firebase-config.js.", true);
    signInForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
    trackForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
} else {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        database = getDatabase(app);

        onAuthStateChanged(auth, user => {
            currentUser = user;
            signInForm.querySelectorAll("input").forEach(input => { input.disabled = Boolean(user); });
            signInForm.querySelector('button[type="submit"]').classList.toggle("hidden", Boolean(user));
            document.getElementById("customerSignOutBtn").classList.toggle("hidden", !user);
            showMessage(authMessage, user
                ? `Signed in as ${user.email || "customer"}.`
                : "Sign in with the customer account linked to your order.");
            if (!user) stopTrackingListeners();
        }, error => {
            console.error("Firebase customer authentication state failed.", error);
            showMessage(authMessage, "Could not check sign-in status. Please reload and try again.", true);
        });

        signInForm.addEventListener("submit", async event => {
            event.preventDefault();
            try {
                await signInWithEmailAndPassword(
                    auth,
                    document.getElementById("customerEmail").value.trim(),
                    document.getElementById("customerPassword").value
                );
            } catch (error) {
                console.error("Firebase customer sign-in failed.", error);
                showMessage(authMessage, `Sign-in failed (${error.code || "unknown error"}).`, true);
            }
        });

        document.getElementById("customerSignOutBtn").addEventListener("click", async () => {
            stopTrackingListeners();
            try {
                await signOut(auth);
                document.getElementById("customerPassword").value = "";
            } catch (error) {
                console.error("Firebase customer sign-out failed.", error);
                showMessage(authMessage, `Sign-out failed (${error.code || "unknown error"}).`, true);
            }
        });

        trackForm.addEventListener("submit", event => {
            event.preventDefault();
            stopTrackingListeners();
            if (!currentUser) {
                showMessage(trackMessage, "Sign in with the customer account for this order first.", true);
                return;
            }

            const orderId = document.getElementById("customerOrderId").value.trim();
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(orderId)) {
                showMessage(trackMessage, "Enter a valid order ID.", true);
                return;
            }

            details.classList.remove("hidden");
            showMessage(trackMessage, "Connecting to the order's live tracking feed…");
            stopStatusListener = onValue(ref(database, `orders/${orderId}/status`), snapshot => {
                const status = snapshot.val();
                const labels = {
                    placed: "Order received",
                    preparing: "Preparing order",
                    picked_up: "Courier picked up the order",
                    delivered: "Delivered",
                    cancelled: "Order cancelled"
                };
                document.getElementById("liveOrderStatus").textContent =
                    typeof status === "string" ? (labels[status] || `Order status: ${status}`) : "Order status is not available yet.";
            }, error => {
                console.error("Firebase order status subscription failed.", error);
                showMessage(trackMessage, "Order status is unavailable. Check the order ID and account access.", true);
            });

            stopLocationListener = onValue(ref(database, `orders/${orderId}/tracking`), snapshot => {
                const location = snapshot.val();
                if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
                    document.getElementById("liveLocationState").textContent = "Waiting for the assigned courier to share a GPS location.";
                    document.getElementById("liveLocationCoordinates").textContent = "";
                    document.getElementById("liveLocationAccuracy").textContent = "";
                    document.getElementById("liveLocationUpdatedAt").textContent = "";
                    document.getElementById("liveMapLink").classList.add("hidden");
                    showMessage(trackMessage, "Connected. The latest courier location will appear here when shared.");
                    return;
                }

                const { lat, lng } = location;
                document.getElementById("liveLocationState").textContent =
                    location.active === true ? "Courier is sharing location now." : "Courier location sharing has stopped; showing the last update.";
                document.getElementById("liveLocationCoordinates").textContent =
                    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                document.getElementById("liveLocationAccuracy").textContent =
                    Number.isFinite(location.accuracy) ? `Reported GPS accuracy: about ${Math.round(location.accuracy)} m.` : "";
                document.getElementById("liveLocationUpdatedAt").textContent =
                    Number.isFinite(location.updatedAt)
                        ? `Last update: ${new Date(location.updatedAt).toLocaleString()}`
                        : "Last update time is not available.";
                const mapLink = document.getElementById("liveMapLink");
                mapLink.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
                mapLink.classList.remove("hidden");
                showMessage(trackMessage, "Live location feed connected.");
            }, error => {
                console.error("Firebase courier location subscription failed.", error);
                showMessage(trackMessage, "Courier location is unavailable. Check the order ID and account access.", true);
            });
        });

        document.addEventListener("pulse-hide-tracking", stopTrackingListeners);
    } catch (error) {
        console.error("Firebase tracking initialization failed.", error);
        showMessage(authMessage, "Firebase could not be initialized. Check the web-app configuration and reload.", true);
        signInForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
        trackForm.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
    }
}
