# PulseDrop live tracking setup

The tracking client uses Firebase Authentication (email/password) and Firebase Realtime Database. Courier coordinates are written only after the courier signs in, enters an assigned order ID, grants browser location permission, and starts sharing. The customer signs in to the account attached to that order and subscribes to the order's live location.

## Required before it can track real orders

1. Create a Firebase project and register a Web app.
2. Enable Email/Password in Firebase Authentication and create customer and courier accounts through a trusted process. Do not add public account creation to the courier page.
3. Create a Realtime Database. Copy the Web app's `apiKey`, `authDomain`, `databaseURL`, `projectId`, and `appId` into `firebase-config.js`. These web-app values are public identifiers, not service-account credentials. Never put a Firebase service-account private key in browser code.
4. Deploy `database.rules.json` from this directory. The rules permit location/status reads only for the customer or courier assigned to the order. The courier can write coordinates only for an active order assigned to that courier.
5. Connect a trusted order backend (Admin SDK or another server-side service) to create `/orders/{orderId}` records with `customerUid`, `courierUid`, and `active: true`, and to write `/orders/{orderId}/status`. For example:

   ```json
   {
     "customerUid": "Firebase Auth UID",
     "courierUid": "assigned courier Firebase Auth UID",
     "active": true,
     "status": "preparing"
   }
   ```

   Client pages intentionally cannot create or assign orders. When delivery ends, the backend should set `active` to `false` and stop location sharing.
6. Host `pulsedrop.html` and the `pulsedrop-realtime/` directory on the same HTTPS origin. Geolocation does not work on ordinary insecure HTTP hosting; localhost is suitable for development.

Order IDs may contain only letters, numbers, `_`, and `-`. The trusted backend must set status values such as `placed`, `preparing`, `picked_up`, `delivered`, or `cancelled`; only the assigned courier's latest location is stored. The customer page links to OpenStreetMap for the received coordinates; it does not request the customer's location.

The checkout in `pulsedrop.html` is still a prototype and does not create Firebase order records. Until a real order backend assigns customer and courier UIDs, the live tracker will correctly reject or fail to find orders. Test Firebase rules with the Local Emulator Suite before connecting real user data. Define a retention policy for precise courier coordinates and delete tracking data when no longer needed.

The client uses Firebase's modular JavaScript SDK from Google's CDN. For a production build, bundle and pin dependencies locally rather than relying on CDN modules.
