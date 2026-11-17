# PulseDrop demo app

This is a demo-only storefront prototype. It is not a pharmacy, does not take payment, and does not fulfill orders. Do not enter real medical or personal information.

## Run locally

Requires Node.js 24.12+ and npm.

```sh
npm install
npm run dev
```

Without Firebase settings, the catalogue, cart, prescription gate, checkout, local order tracking and order history work in browser-only mock mode. The delivery address is requested only to demonstrate checkout and is never retained or sent. The selected prescription file is never uploaded or persisted.

For Firebase Authentication and courier tracking, copy `.env.example` to `.env.local` and fill in the web-app settings from Firebase Console. These client settings are public identifiers, not credentials; do not put service-account keys in the app. `.env.local` is ignored by git. If settings are absent, Firebase customer accounts are disabled and checkout remains local.

Enable Email/Password sign-in in Firebase Authentication. Customer checkout creates a minimal order record containing only the customer UID, status, assigned courier UID, active state and server timestamp. Product details, delivery address, prescription and payment information are not sent to Firebase. A customer must sign in to create a Firebase tracking order.

## Database permissions

`database.rules.json` denies database-wide reads and writes by default. Customers can read only orders whose `customerUid` matches their authenticated UID. Approved couriers can claim unassigned orders and read the minimal unclaimed order record; only the assigned courier can write the location while the order is active. Courier status transitions are constrained to placed → packed → picked up → delivered. Courier approval must be set by an administrator under `/couriers/{uid}/enabled`; client code cannot grant courier permissions.

Install a Java 21+ runtime to run the Realtime Database Emulator tests, then run:

```sh
npm run test:rules
```

Deploy rules and Hosting to the selected Firebase project after reviewing the data and retention settings:

```sh
firebase use <your-firebase-project-id>
firebase deploy --only database,hosting
```

Firebase Hosting serves the app over HTTPS. Geolocation is used only by the separate, administrator-restricted courier page. Configure authorized Firebase Authentication domains before using hosted accounts.

## Build, browser tests and hosting

```sh
npm run build
npm run build:single
npx playwright install chromium
npm run test:e2e
```

Vite bundles the app and stylesheet; the service worker caches the app shell and same-origin assets after first use for offline catalogue browsing. `npm run build` also places the standalone HTML export at `dist/pulsedrop-demo.html`, which is linked from the site footer for download. `public/_headers` supplies CSP/security headers on compatible static hosts, and `firebase.json` applies the same headers on Firebase Hosting. The installed PWA is served over HTTPS (or localhost during development).

`npm run build:single` also creates `standalone/pulsedrop-demo.html`, a self-contained HTML export for sharing or opening locally. The standalone export uses local mock checkout; Firebase hosting/PWA features remain in the regular multi-file build.

## Data and retention

The browser stores the demo cart, local order history and optional refill reminder dates in local storage until the user clears browser data. It does not retain checkout addresses. The Rx file is kept only in the page's temporary file input and is neither read nor uploaded; it is cleared after checkout or page reload. Firebase stores the minimal tracking record and latest courier location until an administrator deletes the record; this prototype does not automatically expire Firebase data. Delete demo records regularly.

For a real service, a licensed pharmacy partner, pharmacist-led prescription verification, secure server-side handling and legal review are prerequisites. This demo must not be used to make healthcare decisions.
