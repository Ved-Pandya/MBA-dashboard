# DeadlineOS

DeadlineOS is a mobile-first MBA deadline compliance platform built with Next.js, Firebase Authentication, Cloud Firestore, and Vercel. It is designed to run on Firebase's no-cost Spark plan: Firebase stores identities and data, while authenticated Vercel Route Handlers perform every privileged mutation.

## What is implemented

- Administrator-issued `24M2xxx` roll-number/password sign-in.
- Additive Student, Subject POC, Wing POC, CR, and System Admin permissions.
- Student urgency dashboard, completion/reopen controls, late status, and realtime notifications.
- Scoped task preview, draft creation, publication, close/cancel, audience sync, and exemptions.
- Named compliance reporting and CSV export for authorized POCs and CRs.
- Admin batch initialization, subject offering management, and validate/commit roster import.
- Deterministic T-24h, T-2h, T+15m reminder records, daily overdue digests, and reconciliation.
- Default-deny Firestore Security Rules, required indexes, audit events, and operation records.

## Runtime architecture

```text
apps/web        Next.js 16 UI and authenticated Vercel API routes
functions       Shared privileged business handlers bundled into the Vercel server runtime
packages/domain Shared schemas, types, RBAC, and reminder policy
Firebase Spark  Authentication and one Cloud Firestore database
```

Firebase Cloud Functions, Cloud Scheduler, and Cloud Tasks are not deployed. The browser sends a Firebase ID token to the same-origin Vercel API. The API verifies that token with Firebase Admin and then applies the same server-side RBAC checks used by every business operation.

## Local setup

Prerequisites: Node 20 or 22, npm, and Java 21 if you want to run the Firestore Emulator.

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
   ```

   Firebase Admin credentials are not required when the Admin SDK is connected to the emulators.

4. Start Firebase emulators and Next.js in separate terminals:

   ```powershell
   npm run emulators
   npm run dev
   ```

5. In the Auth Emulator UI, create `24m2000@users.deadlineos.app` with your chosen password. Sign into the app with roll number `24M2000`.

6. In Admin, initialize the batch and offerings, then validate and commit the roster. A sample is available at `fixtures/roster.sample.csv`.

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
6. Deploy Firestore rules and indexes with `npm run deploy:firebase`. Do not deploy the `functions` directory.
7. Deploy the repository to Vercel using `apps/web` as the Root Directory and enable inclusion of source files outside that directory.
8. Use this Vercel build command because the server routes consume both workspaces:

   ```text
   cd ../.. && npm run build
   ```

9. Create the internal bootstrap Auth account, open the Vercel URL, sign in with its roll number, initialize the batch, and import the roster.

The server private key is mandatory on Vercel and must never be committed, logged, or exposed through a `NEXT_PUBLIC_*` variable.

## Alert behavior on free plans

Vercel Hobby allows cron jobs only once per day and does not guarantee exact execution within the selected hour. `apps/web/vercel.json` therefore runs one protected daily catch-up job at 02:30 UTC, corresponding to 08:00 Asia/Kolkata.

For more timely in-app reminders, every authenticated browser sends a lightweight maintenance pulse every five minutes while visible. A Firestore transaction allows only one processor run in each two-minute window, so concurrent users do not duplicate alert work. Notification and delivery IDs remain deterministic.

Consequences of the no-billing design:

- If at least one user has the application open, due reminders are normally materialized within roughly five minutes.
- If nobody has the application open, reminders are caught up on the next active session or daily cron run.
- The system cannot guarantee background T-24h or T-2h precision on Firebase Spark plus Vercel Hobby.
- Daily cron timing can vary within the scheduled hour.

## Spark quotas and operational guidance

The free Firestore allowance is finite. Watch the Firebase Firestore Usage dashboard, especially document reads and writes. Keep manager queries paginated and avoid opening many duplicate dashboard tabs.

Monitor:

- `systemHealth/scheduler` for the most recent Spark alert pass.
- `systemHealth/sparkRuntime` for pulse throttling.
- Failed `operations` and pending `reminderJobs`.
- `reminderDeliveries` and `taskStats.reconciledAt`.
- Vercel Function and Cron logs.

## Current MVP constraints

- One batch and one timezone.
- Subject offerings target their entire section; elective enrollment is not modeled.
- Alerts are in-app only, so offline attention cannot be guaranteed.
- The CSV parser supports the documented simple template; values containing commas are not supported.
- Spark does not include managed Firestore backups, PITR, TTL deletes, or excess usage beyond the free quota.
- Vercel Hobby is intended for personal/non-commercial use; confirm that its plan terms fit the intended deployment.

Before a real batch launch, run the emulator rule suite, load-test with the actual roster size, keep an offline roster backup, export essential data manually, and rehearse account recovery.
