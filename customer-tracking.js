import { initializeApp, getApps } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";
import {
  getDatabase,
  onValue,
  push,
  ref,
  serverTimestamp,
  set
} from "firebase/database";
import { databaseConfigured, firebaseConfig, firebaseConfigured } from "./firebase-config.js";

function createLocalTracking() {
  return {
    mode: "local",
    currentUser: null,
    onUserChanged(callback) {
      callback(null);
      return () => {};
    },
    async signIn() {
      throw new Error("Customer accounts need Firebase configuration. Local demo checkout does not require an account.");
    },
    async signUp() {
      throw new Error("Customer accounts need Firebase configuration. Local demo checkout does not require an account.");
    },
    async signOut() {},
    async createOrder() {
      const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
      return `demo_${Date.now().toString(36)}_${suffix}`;
    },
    watchOrder() {
      return () => {};
    }
  };
}

export function createCustomerTracking() {
  if (!firebaseConfigured || !databaseConfigured) return createLocalTracking();

  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const database = getDatabase(app);

    return {
      mode: "firebase",
      get currentUser() {
        return auth.currentUser;
      },
      onUserChanged(callback) {
        return onAuthStateChanged(auth, callback, error => {
          console.error("Firebase customer authentication state failed.", error);
          callback(null, error);
        });
      },
      async signIn(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
      },
      async signUp(email, password, displayName) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) await updateProfile(credential.user, { displayName });
        return credential;
      },
      async signOut() {
        return signOut(auth);
      },
      async createOrder() {
        const customer = auth.currentUser;
        if (!customer) {
          const error = new Error("Sign in before creating a Firebase tracking order.");
          error.code = "auth/unauthenticated";
          throw error;
        }
        const orderRef = push(ref(database, "orders"));
        const orderId = orderRef.key;
        if (!orderId || !/^[A-Za-z0-9_-]{1,80}$/.test(orderId)) {
          throw new Error("Firebase could not create a valid order ID.");
        }
        await set(orderRef, {
          customerUid: customer.uid,
          courierUid: "",
          active: false,
          status: "placed",
          createdAt: serverTimestamp()
        });
        return orderId;
      },
      watchOrder(orderId, onUpdate, onError) {
        return onValue(ref(database, `orders/${orderId}`), snapshot => {
          const order = snapshot.val();
          if (!order) {
            onError(new Error("Order not found or unavailable to this account."));
            return;
          }
          onUpdate(order);
        }, onError);
      }
    };
  } catch (error) {
    console.error("Firebase tracking initialization failed; local demo mode is enabled.", error);
    return createLocalTracking();
  }
}
