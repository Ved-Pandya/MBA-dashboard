# DeadlineOS

DeadlineOS is a mobile-first MBA deadline compliance platform built with Next.js, Firebase Authentication, Cloud Firestore, and Vercel. It is designed to run on Firebase's no-cost Spark plan: Firebase stores identities and data, while authenticated Vercel Route Handlers perform every privileged mutation.

## What is implemented

- Administrator-issued `24M2xxx` roll-number/password sign-in.
- Additive Student, Subject POC, Wing POC, CR, and System Admin permissions.
- Student urgency dashboard, completion/reopen controls, late status, and realtime notifications.
- Scoped task preview, draft creation, publication, close/cancel, audience sync, and exemptions.
- Named compliance reporting and CSV export for authorized POCs and CRs.
- Admin batch initialization, subject offering management, and validate/commit roster import.
- Dedicated, atomic POC Setup for exactly one Wing POC per Wing A–J and one Subject POC per offering.
- Browser-local timetable PDF extraction with an editable confirmation table and manual fallback.
- Informational academic calendar for assignments, quizzes, midterms, and next-class pre-reads.
- Batch-wide competitions, explicit student responses, draft team reservations, locked registration, rounds, advancement, team submissions, and membership disputes.
- Internship registration/no-participation tracking and sanitized Wing POC reports.
- Deterministic T-24h, T-2h, T+15m reminder records, daily overdue digests, and reconciliation.
- Installable Android/iPhone PWA with an offline-safe shell, guided Home Screen setup, and URL-aware notification navigation.
- Consent-based standards Web Push with multiple-device subscriptions, endpoint ownership protection, retries, and sanitized lock-screen copy.
- A free Cloudflare Cron Trigger that wakes the Spark-compatible Vercel maintenance endpoint every five minutes.
- Default-deny Firestore Security Rules, required indexes, audit events, and operation records.

## Runtime architecture

```text
apps/web        Next.js 16 UI and authenticated Vercel API routes
functions       Shared privileged business handlers bundled into the Vercel server runtime
packages/domain Shared schemas, types, RBAC, and reminder policy
Firebase Spark  Authentication and one Cloud Firestore database
```

Firebase Cloud Functions, Cloud Scheduler, and Cloud Tasks are not deployed. The browser sends a Firebase ID token to the same-origin Vercel API. The API verifies that token with Firebase Admin and then applies the same server-side RBAC checks used by every business operation.

The service worker caches only the public offline page and app icons. It never caches Firestore responses, API responses, authentication credentials, or private dashboards. Authenticated content therefore requires a connection.

## Local setup

Prerequisites: Node 24, npm, and Java 21 if you want to run the Firestore Emulator.

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `apps/web/.env.local` and add the Firebase web configuration.

3. For local emulators, keep these values:

   ```text
   NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   GCLOUD_PROJECT=demo-deadlineos
   BOOTSTRAP_ADMIN_ROLL_NUMBERS=24M2000
   CRON_SECRET=replace-with-a-long-random-value
   NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=your-public-vapid-key
   WEB_PUSH_PRIVATE_KEY=your-private-vapid-key
   WEB_PUSH_SUBJECT=mailto:your-address@example.com
   ```

   Firebase Admin credentials are not required when the Admin SDK is connected to the emulators.

4. Start Firebase emulators and Next.js in separate terminals:

   ```powershell
   npm run emulators
   npm run dev
   ```

5. In the Auth Emulator UI, create `24m2000@users.deadlineos.app` with your chosen password. Sign into the app with roll number `24M2000`.

6. In Admin, initialize the batch, then validate and commit the roster. Import the timetable or create offerings, and assign POCs from the dedicated POC Setup page. A sample is available at `fixtures/roster.sample.csv`.

For role testing, System Admins can use **Admin → Test identities → Create or reset test accounts**. This creates `24M2901` (Student), `24M2902` (Subject POC for the isolated `TEST-A` offering), and `24M2903` (CR). Secure passwords are generated on demand and displayed only in the administrator's browser.

After creating the identities, click **Seed complete mock data** to reset a tagged demo dataset containing four subjects and timetable slots, four academic events, two competitions, one registered team, one open competition round, one internship, one wing form, mixed response/completion states, reminder jobs, and notifications. **Clear mock data** removes only records tagged with the `mock_v1` seed and leaves the three test login accounts intact.

The roster contains each roll number and its administrator-chosen password. Passwords are sent only to the privileged Vercel route and are handed to Firebase Authentication; they are never stored in Firestore or audit events. Re-importing an existing roll number deliberately resets its password.

## Commands

```powershell
npm run typecheck
npm test
npm run test:rules
npm run build
npm run deploy:firebase
```

`npm run deploy:firebase` deploys only Firestore rules and indexes, which is compatible with Spark. `npm run test:rules` requires Java on `PATH`.

## Spark production deployment

1. Create a Firebase project and keep it on Spark.
2. Enable Email/Password Authentication and create one Firestore database in `asia-south1`.
3. Register a Firebase Web app and add its `NEXT_PUBLIC_FIREBASE_*` configuration to Vercel.
4. In Firebase Project Settings > Service accounts, generate a private key. Add its `project_id`, `client_email`, and `private_key` to Vercel as `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY`.
5. Add `BOOTSTRAP_ADMIN_ROLL_NUMBERS` and a random `CRON_SECRET` to Vercel. These are server-only values.
6. Generate a VAPID key pair once from the repository root:

   ```powershell
   npx web-push generate-vapid-keys
   ```

   Add the public key to Vercel as `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, the private key as `WEB_PUSH_PRIVATE_KEY`, and a contact URI such as `mailto:admin@example.com` as `WEB_PUSH_SUBJECT`. Paste the values without quotation marks. Never expose the private key through a `NEXT_PUBLIC_*` name.
7. Deploy Firestore rules and indexes with `npm run deploy:firebase`. Do not deploy the `functions` directory.
8. Deploy the repository to Vercel using `apps/web` as the Root Directory and enable inclusion of source files outside that directory.
9. Use this Vercel build command because the server routes consume both workspaces:

   ```text
   cd ../.. && npm run build
   ```

10. Redeploy after setting all environment variables; public VAPID values are embedded during the Next.js build.
11. Create the internal bootstrap Auth account, open the Vercel URL, sign in with its roll number, initialize the batch, and import the roster.
12. Deploy the free wake-up scheduler:

   ```powershell
   cd infra/cloudflare-scheduler
   npx wrangler login
   npx wrangler secret put DEADLINEOS_URL
   npx wrangler secret put CRON_SECRET
   npx wrangler deploy
   ```

   Enter the production Vercel origin, such as `https://mba-dashboard-web.vercel.app`, for `DEADLINEOS_URL`. Enter exactly the same `CRON_SECRET` stored in Vercel. Cloudflare invokes the protected maintenance route every five minutes.

The server private key is mandatory on Vercel and must never be committed, logged, or exposed through a `NEXT_PUBLIC_*` variable.

## PWA installation and push test

1. Open the production HTTPS URL and sign in with a test Student account.
2. On Android Chrome, press **Set up** on My Day and then **Install**. If the native button is unavailable, use Chrome's **Install app** menu item.
3. On iPhone Safari, use **Share > Add to Home Screen**, enable **Open as Web App**, and launch DeadlineOS from the new Home Screen icon. Web Push requires iOS/iPadOS 16.4 or later and the installed Home Screen app.
4. In the installed app, open **Notifications > App setup** and press **Enable**. DeadlineOS never asks for notification permission without this user action.
5. From another role, create an event that generates an inbox notification. Keep the recipient app closed and allow up to approximately five minutes for the Cloudflare maintenance pass.
6. Confirm the notification uses generic lock-screen text and opens the correct authenticated DeadlineOS view. Confirm the full private detail exists only in the in-app inbox.
7. Sign out on that device, create another notification, and confirm the signed-out device no longer receives private alerts.

## Alert behavior on free plans

Cloudflare's five-minute Cron Trigger is the primary wake-up source. It calls the protected Vercel maintenance route, which processes due reminders, mirrors new inbox notifications into deterministic push jobs, and attempts due push deliveries. `apps/web/vercel.json` retains one protected daily catch-up at 02:30 UTC, corresponding to 08:00 Asia/Kolkata.

Every authenticated browser also sends a lightweight maintenance pulse every five minutes while visible. A Firestore transaction allows only one processor run in each two-minute window, so Cloudflare, Vercel, and active-browser invocations can safely overlap. Notification, push-job, and device-delivery IDs remain deterministic.

Consequences of the no-billing design:

- Due reminders and queued pushes normally begin processing within roughly five minutes, even if nobody has the app open.
- Browser push services, device connectivity, and free hosting remain best-effort; arrival and user attention cannot be guaranteed.
- If Cloudflare is unavailable, active sessions and the daily Vercel catch-up retain the previous fallback path.
- Daily cron timing can vary within the scheduled hour.

## Spark quotas and operational guidance

The free Firestore allowance is finite. Watch the Firebase Firestore Usage dashboard, especially document reads and writes. Keep manager queries paginated and avoid opening many duplicate dashboard tabs.

Monitor:

- `systemHealth/scheduler` for the most recent Spark alert pass.
- `systemHealth/push` and `systemHealth/pushMirror` for push configuration, delivery, and inbox-mirroring health.
- `systemHealth/sparkRuntime` for pulse throttling.
- Failed `operations` and pending `reminderJobs`.
- `reminderDeliveries` and `taskStats.reconciledAt`.
- `operations` entries for timetable imports and membership disputes.
- Vercel Function and Cron logs.

## Current MVP constraints

- One batch and one timezone.
- Subject offerings target their entire section; elective enrollment is not modeled.
- Push notifications require explicit per-device permission and supported browsers; the in-app inbox remains authoritative.
- The app is installable from its URL but is not listed in the Play Store or App Store.
- The CSV parser supports the documented simple template; values containing commas are not supported.
- Spark does not include managed Firestore backups, PITR, TTL deletes, or excess usage beyond the free quota.
- Vercel Hobby is intended for personal/non-commercial use; confirm that its plan terms fit the intended deployment.

Before a real batch launch, run the emulator rule suite, load-test with the actual roster size, keep an offline roster backup, export essential data manually, and rehearse account recovery.
