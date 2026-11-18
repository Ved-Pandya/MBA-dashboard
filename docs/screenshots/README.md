# Screenshot provenance

These PNG files are Chromium/Playwright captures of the local application using synthetic Firebase Auth/Firestore emulator data. `apps/web/e2e/deadlineos.spec.ts` regenerates desktop and Pixel 7 mobile captures. The mobile full-page Home capture includes a fixed navigation bar at its actual viewport position; it is not a single-screen mockup. No real roster data is shown.

The current dark Campus Quest Home and sign-in captures were confirmed at 1280/1440px desktop and 390px mobile on 18 November 2026. The current viewport matrix, reward state, browser/contrast measurements and verification notes are in `.impeccable/review/dark/`. Home/sign-in files are CSS-pixel captures with reduced motion enabled. The parent review directory retains evidence from the superseded light palette.

Report performance and the timed System admin presentation workspace are captured in `.impeccable/review/reports/`, with local timing evidence in `measurements.json`. The admin captures hide generated credentials. No production data was seeded by these checks.
