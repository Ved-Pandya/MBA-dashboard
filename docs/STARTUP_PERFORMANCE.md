# Initial load and session startup

The sign-in screen previously loaded the dashboard and Firestore SDK before it knew whether a user was signed in. Returning sessions then waited for the generic activation API, a second client-side profile read, and only then the dashboard queries. Maintenance started during that same window.

## Changes

- Split Auth/App Check initialization from Firestore initialization. The anonymous page loads Auth and the login interface. Dashboard/Firestore code starts downloading when Auth finds a user, overlapping the secure session request. Password login retains IndexedDB/local/session persistence, without unused OAuth popup/redirect dependencies. See [Firebase's custom Auth initialization guidance](https://firebase.google.com/docs/auth/web/custom-dependencies).
- Added a small `/api/session` entry point that imports account/authentication code without the full operation registry. It returns the verified, activated dashboard profile so the interface can mount without waiting for another Firestore profile round trip.
- Retained token revocation checks, App Check enforcement, the shared per-user rate limit, roster/email matching, invitation activation and suspension checks. Session responses use `private, no-store`; private dashboard data is not persisted or served from a shared cache. The existing activation callable remains compatible.
- Kept a live profile listener for access changes. Ignore cached profile events in favor of the authoritative session response; clear the dashboard on revoked roster access or listener failure. Guard asynchronous subscription setup against sign-out/account changes.
- Deferred browser maintenance until ten seconds after an active session and throttled visibility-triggered pulses. The independent scheduler remains available. Today subscriptions depend on UID/section rather than each new profile object.
- Resolve permitted URL views before mounting their content, avoiding transient Today queries when opening reports or admin directly.

## Measurements

Evidence is in `.impeccable/review/startup/measurements.json`. These are three fresh Chromium contexts against local production Next.js builds with synthetic Auth/Firestore emulators, comparing `3cbc9e9` with this change. The first sample includes a cold API module; later samples use the warm server. No artificial network delay was added. This small local sample is not a production latency guarantee.

| Metric | Before | After |
| --- | ---: | ---: |
| JavaScript transferred before sign-in | 371,290 bytes | 198,268 bytes |
| First sample: login click to task data | 1,912 ms | 858 ms |
| Median signed-in refresh to task data | 435 ms | 274 ms |
| Maintenance requests before first dashboard | 1 | 0 |

The initial script payload fell 46.6%. Warm samples vary; the principal guaranteed changes are fewer blocking stages and a smaller anonymous download, rather than an “instant” first network response.

## Live deployment findings and region alignment

Read-only checks of `https://mba-dashboard-web-delta.vercel.app/` showed a cached page through `bom1` and sign-in readiness of 1,200 ms on the first sample and 342 ms on the second. No browser errors or failed requests were observed. See `live-before.json`.

Two unauthenticated activation requests returned 401 in 414 ms and 365 ms, with `x-vercel-id` showing `bom1::iad1`. These requests did not access an account, perform a database operation or alter records. The header identifies routing and execution regions ([Vercel documentation](https://vercel.com/docs/headers/response-headers#x-vercel-id)); `iad1` is the Washington, D.C./Northern Virginia region. This confirms a cross-region network floor, but does not measure authenticated database time. See `live-api-before.json`.

The public Firebase configuration identifies `mba-deadline-prod`. The local Firebase CLI is not authenticated, so the project owner confirmed the Firestore location as Mumbai (`asia-south1`) in Firebase Console. `apps/web/vercel.json` now specifies `regions: ["bom1"]`, placing the API in Mumbai on the next deployment. [Vercel recommends locating functions near their database](https://vercel.com/docs/functions/configuring-functions/region). The database itself is unchanged.

After deployment, confirm API `x-vercel-id` headers show `bom1` execution rather than `iad1`, and inspect `/api/session` in browser Network tools. `Server-Timing` reports completed `startup`, `auth`, `rate-limit` and `profile` stages plus `total`; error responses retain the completed timings. Compare a fresh session, a warm signed-in refresh, and an idle/cold invocation. Then inspect the first dashboard/report reads separately. Authentication and actual fresh data still require network responses.

## Validation

The browser startup regression holds every client Firestore Listen request and verifies that both sign-in and a persisted refresh still render the dashboard. After releasing the connection, task data appears; suspending the account removes the dashboard. Backend integration coverage checks invitation activation, field projection, roster email mismatch, missing/suspended accounts, revocation verification and rate limiting. The existing role workflows and desktop/mobile checks run alongside these cases.

Validation passed: 31 unit checks, 10 Firestore rules checks, 14 privileged integration checks, 20 desktop/mobile browser checks, TypeScript checks and the production build.
