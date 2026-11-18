# Demo credential recovery and focus timer review

The existing dark Campus Quest interface is preserved. The focus card now discloses its 25-minute duration, one-minute tab-departure penalty, paused/finished exemptions and page-local reset behavior. A departure holds the remaining time until return, preventing background time from counting as focus. Penalties are displayed without changing saved completion XP.

Screenshots in this directory are generated from the local app using synthetic Firebase emulator accounts, at 1440×1000 desktop and 390×844 mobile viewports, with reduced motion enabled. `focus-*.png` shows the idle state; `penalty-*.png` shows the resumed state after one simulated visibility departure. No production student data or external artwork is present. `checks.json` records computed fonts, colors, overflow and captured errors.

The first inspection found an inherited 11px mobile status override; the confirmation pass raises status and penalty text to 14px. The duration badge also uses 14px. Focus controls retain their existing 44px height, keyboard labels, tabular numerals and visible focus styling. The final inspection checks both device classes together.

Validation: 35 unit checks, 10 Firestore rules checks, 15 privileged integration checks and 20 desktop/mobile browser checks passed. Production build and TypeScript checks passed. The focused desktop/mobile timer regression is repeated after the final copy/type refinements.

Credential regression reproduces `taskStats/demo_wing_form` without its demo tag, verifies that password reset leaves fixtures unchanged, and signs in with the new password. Reconciliation retains source provenance; legacy counter refresh/cleanup requires a positively identified tagged parent. Unrelated records and protected identity collisions remain rejected. The reset API shares the administrator gate and operation lease and returns credentials only to the requesting session.
