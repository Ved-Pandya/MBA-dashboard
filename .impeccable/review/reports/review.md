# Report performance and presentation workspace verification

18 November 2026. Checked against the existing dark Campus Quest system.

## Behavior and evidence

Opportunity-report filters use one loaded wing snapshot. Switching type/opportunity made zero additional requests in browser tests and the local rehearsal. Late responses cannot replace a newer selection. Refresh remains explicit; snapshot data is confined to the mounted report, and identical in-flight reads are shared only for the same signed-in user.

Both report tables render 50-row pages. A 115-recipient browser fixture verifies that CSV includes all 115 loaded recipients, not only the visible page. Complete totals and export remain unavailable until server response pagination finishes. Catalogue-only requests preserve response rows.

System admin exposes report shortcuts and Prepare 15-minute demo. The seeded workspace spans all feature areas, six protected sign-ins, 110 report-only profiles and a 114-recipient report. Its presentation plan totals 14 minutes. Setup phases reflect actual work; refresh preserves passwords and removal remains tagged. Captures hide generated passwords.

## Local measurements

The confirmation rehearsal recorded preparation in 1,839 ms, two filter changes in 22 ms, one initial opportunity-report request, zero filter requests and no captured page errors. These are synthetic local emulator measurements, not production latency guarantees. Successful callable responses expose separate startup/auth/rate-limit/handler timing.

## Checks

- 31 unit tests, 10 Firestore rule tests, 13 privileged workflow integration tests and 18 desktop/mobile workflow cases passed. Four focused sign-in/compliance confirmation cases also passed.
- Full production build and workspace typecheck passed.
- Desktop/mobile admin, compliance and opportunity-report captures were inspected. No document-level horizontal overflow was recorded; dense tables retain their own scrolling area.
- The capture helper was corrected to scope duplicate navigation labels to the admin page heading before the complete final capture succeeded.

The development checks wrote only to local Firebase emulators. Earlier review directories describe previous tasks and remain separate evidence.
