# DeadlineOS — fixes and verification

The repository issues from the initial review have been addressed. The app is suitable for a controlled project demonstration. Production sign-off still requires deploying the updated rules/indexes/app and checking push delivery on real devices.

## Resolution of the original findings

| Finding | Resolution |
| --- | --- |
| Student internship query denied by rules | Listener and rules share explicit public response statuses. Added the composite index, loading/error feedback, and a rules test covering permitted queries and private legacy responses. |
| Closed/cancelled tasks remain actionable | Home excludes them from active work and urgency counts, shows their lifecycle state in history, and disables completion. The server checks authoritative task state during completion. |
| Deadline state becomes stale | A shared clock refreshes every 15 seconds and on focus/visibility changes. Home, academics, polls, sessions and competition controls update with time. Day boundaries and Home dates use India time. |
| Timetable correction creates duplicates | Imports atomically replace the selected term's active slots. Stable slot IDs survive row reordering; same-term offering IDs preserve POC grants; new terms get distinct offerings. Reverting an import works. Duplicate classes and oversized atomic replacements fail before writing. |
| Incomplete edit/error-recovery flows | Added internship edit/cancel and wing-task edit/audience-sync controls. Competition, internship, session and poll forms preserve data on failure. Wing managers can see tasks in their authorized scope after ownership changes. |
| Drawer overflow and keyboard problems | Native modal dialogs provide focus containment, Escape dismissal and focus restoration. Closed drawers are unmounted. Added scrolling, accessible close controls, larger touch targets, reduced-motion behavior and font fallbacks. |
| CI/runtime mismatch | CI and .nvmrc use Node 24. CI installs Java and Chromium and runs unit, permission, integration and browser checks. Local verification used Node 24.22.3 and Java 21. |
| Expensive/incomplete compliance reporting | Queries target current items and the selected item's responses. Catalog and response lists paginate. Partial totals are labelled; complete CSV export and percentages wait until all responses are loaded. Management screens load on demand. |
| Roster imports demote administrators | Imports preserve administrator grants and POC scopes. Completed rows commit independently with password-free progress/recovery records. Tested a mid-import failure, safe re-import, preservation of another administrator and an emulator password reset. |
| App Check does not reach custom API | Client sends App Check tokens; adapter verifies them when enabled. Added a shared per-user request limit, active-roster checks for browser maintenance, appropriate HTTP errors and sanitized server failures. |
| Documentation advertises retired features | README describes individual competition confirmations, correct scheduler cadence and the informational academic calendar. Added architecture, synthetic screenshots, a walkthrough and recovery procedures. Mock seed summaries report actual team/round counts. |

Integration testing also exposed an audit-write failure when optional fields were undefined. Audit payloads now omit those fields while preserving Firestore values. Task publication creates assignments, notifications, reminders, statistics and audit records in one transaction, including concurrent retry protection. Auth profile listeners are cleaned up across account changes and unmounts.

## Verification results — 15 November 2026

| Check | Result |
| --- | --- |
| Type checking | Passed |
| Production build | Passed |
| Unit tests | 28 passed |
| Firestore access-rule tests | 10 passed |
| Privileged workflow integration tests | 9 passed |
| Desktop/mobile browser workflows | 12 passed |
| Whitespace/error check | Passed |

This covers 59 passing test scenarios. Ordinary `npm test` skips emulator-only suites; `npm run test:emulators` runs them against local Auth/Firestore and starts browser tests. A restricted Windows agent environment needs permission to stop its temporary browser-test server; the successful run exited cleanly with that permission.

The integration suite rehearsed publication to 114 synthetic students and delivery of a scheduled reminder to each exactly once, including a repeat maintenance invocation. The latest local rehearsal took approximately 1.25 seconds; this is emulator evidence, not a production latency guarantee. Browser reporting checks used 115 response records to cross a pagination boundary before CSV export.

## Remaining deployment checks

- Deploy updated Firestore rules/indexes and wait for indexes to become ready; redeploy the app on Node 24.
- If App Check enforcement is wanted, configure the Firebase/reCAPTCHA Enterprise provider and environment values before enabling it. Local tests verify the adapter boundary; live provider configuration needs the target deployment.
- Install the production HTTPS app on Android/iPhone and verify closed-app push, deep links, retries, scheduler health and sign-out cleanup.
- Keep a protected roster backup and an agreed export/recovery schedule. Monitor actual Firestore usage after rollout.

See [the demo walkthrough](docs/DEMO.md) and [deployment/recovery procedures](docs/OPERATIONS.md). No production credentials or real student data were used for verification.

## UI redesign completed

Replaced the metric-card dashboard with a campus daybook: ruled deadline rows, searchable student work, a dedicated replies column, navy navigation, IBM Plex Sans and authored SVG icons. Both student and POC/CR workflows have equal priority. Management begins with records and explicit New/Edit controls; mobile uses Today, Academics, Opportunities and My desk navigation. Sign-in now has labelled credentials and a password visibility control.

The post-redesign rehearsal passed 12 desktop/mobile browser workflows, 10 permission tests and 9 integration tests; 28 unit tests, type checking and production build also passed. Fresh synthetic captures and walkthrough are in docs/DEMO.md. The optional Impeccable detector could not run because its engine is unavailable in this restricted workspace; browser evidence and independent source/screenshot review cover this handoff. No detector pass is claimed.
