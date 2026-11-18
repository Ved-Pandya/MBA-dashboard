# Launch and recovery rehearsal

## Required checks

Use Node 24 and Java 21. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright install chromium`, then `npm run test:emulators`. The last command starts only local Auth/Firestore emulators, runs permission and privileged-handler checks, and runs desktop/mobile browser workflows. CI follows the same runtime and suite. No production credentials are required for these tests.

## Deployment

Deploy the updated Firestore rules and indexes before using the new internship listener in production. Wait until Firebase reports the indexes ready. Redeploy the web app with Node 24. Deploy the Cloudflare scheduler as described in the root README; its trigger runs every minute, with a shared two-minute maintenance throttle. Confirm the scheduler and push health documents update.

App Check is optional. To enforce it, register the web app with Firebase App Check, configure a reCAPTCHA Enterprise provider and the allowed domains, set `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`, then set server-only `ENFORCE_APP_CHECK=true` and redeploy. The custom API explicitly verifies App Check tokens when enforced. Firebase ID tokens and role authorization remain required. Local Auth emulator runs bypass App Check. The custom callable adapter also maintains a server-side limit of 60 requests per user per minute. App Check is not a substitute for authorization or quota monitoring.

## Timetable correction

Imports replace the selected term's timetable. Removed slots and offerings are deactivated in the same transaction that publishes the replacement. Existing same-term offering identities remain stable so POC grants and academic links survive corrections; new terms receive distinct offering IDs. Reordering rows does not create duplicate slots. A complete replacement must fit within 500 changed Firestore documents, including metadata. Oversized imports fail before any write. Keep distinct academic terms separate.

## Report completeness

Current-item queries exclude historical work. The catalog loads up to 50 current items of each kind per page; “Load more current tasks” exposes the rest. Student responses load 100 at a time for the selected item. Until all responses are loaded, the screen labels the partial data and disables complete CSV export and compliance percentages. Refresh the report when responses change during a review.

## Account and import recovery

Roll-number login uses internal email aliases, so ordinary email password reset is not the recovery channel. Keep at least two authorized System Admin accounts and a protected offline roster copy. An administrator can re-import a student's roster row with a replacement password. Verify that the student can sign in and that the old password fails. Existing administrator grants and POC scopes survive roster updates; changing privileges is a separate explicit operation.

Roster import cannot atomically span Firebase Authentication and Firestore. Each completed row is committed independently; an operation record tracks progress without passwords. On failure, inspect the operation and rerun the same roster. Already-created accounts are updated, not duplicated. Rehearse this in the demo project before importing real accounts. If all administrators lose access, use the authorized Firebase Console account to restore the bootstrap Auth identity; retain the server bootstrap allowlist and a documented owner recovery procedure.

## Data and quota rehearsal

Before batch launch, retain a protected offline roster and essential CSV exports. With billing/backup features unavailable, define who performs exports and how often, and rehearse reconstructing a test dataset. Review Firebase usage after publication and report refresh at the actual roster size. The integration suite rehearses publication and a scheduled reminder for 114 synthetic students; the browser suite includes 115 response records to exercise pagination. Local emulator timings are not a production capacity guarantee. Distributed API rate-limit counters consume one read/write per accepted callable request and are reused each minute rather than creating daily collections.

## Real-device checks after deployment

For a full synthetic feature rehearsal, use System admin → Presentation workspace → Prepare 15-minute demo and follow [the presentation runbook](PRESENTATION_RUNBOOK.md). Ordinary refresh preserves demo passwords; explicit password reset replaces them. The injector refuses unrelated documents at reserved sample IDs, preserves occupied real POC seats, and records interrupted operations for retry. The report-only profiles have no Auth logins. Cleanup is scoped to sample records and linked seed deliveries, rather than removing grants from the entire roster.

1. Install from the production HTTPS URL on supported Android and iPhone devices.
2. Enable push using App setup; publish an item from another account while the recipient app is closed.
3. Confirm title/body sanitization, deep-link navigation, retries and scheduler health.
4. Sign out on that device and verify it no longer receives new private alerts.
5. Temporarily interrupt the scheduler in the demo environment and verify recovery. Inspect failed operations/reminder jobs and the push/scheduler health timestamps.

These real-device and deployment checks require the target environment and cannot be established by local emulators.
