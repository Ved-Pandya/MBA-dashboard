# Reports and the 14-minute presentation workspace

## Report changes

The previous opportunity report repeated its catalogue/response query on each type or opportunity filter change and accepted late responses without checking the current selection. The report now loads a wing once, filters that snapshot locally, reuses it when returning to the same wing, and ignores out-of-order results. Refresh explicitly fetches new records.

Concurrent identical report reads share one pending request per signed-in user. Completed results are not stored in a global cache or browser storage. The mounted report owns its snapshot cache and clears it on permission/scope changes or unmount. Mutations are never deduplicated.

Both report tables render 50 rows per UI page. Counts and CSV use the loaded dataset, not just the visible page. Current-task compliance retains server cursor pagination: load all response pages before relying on complete totals or CSV. The opportunity API retains its existing bounded query limits (2,000 responses per type and 500 catalogue entries).

The backend skips unused opportunity types, applies selected opportunity IDs to Firestore queries, selects the fields the report uses, overlaps independent reads, and avoids rereading response rows when only loading more catalogue choices. This follows [Firebase's guidance on asynchronous reads](https://firebase.google.com/docs/firestore/best-practices#read_and_write_operations).

## Diagnose deployment latency

For the anonymous page download and signed-in startup waterfall, see [initial-load changes and measurements](STARTUP_PERFORMANCE.md).

Successful `/api/call/*` responses now expose `Server-Timing` entries for `startup`, `auth`, `rate-limit`, `handler` and `total`, with `Cache-Control: private, no-store`. Inspect these in the browser Network panel to separate cold startup, authentication, rate-limit contention and database work. ID-token revocation, App Check, role/scope checks and the distributed rate limit remain enabled.

The owner confirmed production Firestore is in Mumbai (`asia-south1`); `apps/web/vercel.json` now places Vercel API functions in Mumbai (`bom1`), replacing the observed Virginia execution region. The database itself is unchanged. [Firebase recommends locating resources near the database](https://firebase.google.com/docs/firestore/best-practices#database_location). Local emulator timings are not production performance guarantees.

## Prepare the demo

Use **System admin → Presentation workspace → Prepare 15-minute demo**. Preparation creates six protected role sign-ins, coherent sample records across the app, 110 report-only students and a 114-recipient audit report. The inline plan totals 14 minutes, and its printable guide is linked from the same section.

Preparation progress reflects the actual account, cleanup and write phases. Independent catalogue cleanup reads run in groups of eight; account preflight and creation run concurrently; validated account identities are reused. Refresh preserves existing passwords. **Reset demo passwords** only rotates the six protected accounts through `resetDemoPasswords`; sample records, deadlines and responses stay unchanged. The legacy preparation flag rotates passwords after successful fixture preparation. The lease, collision checks, protected-account checks and tagged cleanup are retained. Use separate browser profiles to demonstrate different identities.

Statistics reconciliation and publication preserve demo provenance from their source records. Preparation and cleanup can also recover older untagged counters when their parent is positively identified as a tagged demo source. A matching ID prefix alone is insufficient; unrelated records, explicitly non-demo counters and counters marked with another seed remain protected.

If a counter's parent is missing, or the counter carries a conflicting marker, preparation preserves it and gives the planned source a fresh ID. Assignments, response rows, reminders, notifications and linked records move together in the in-memory fixture plan. Real source-document collisions still stop preparation. The ready summary reports `avoidedStatCollisions` when this fallback is used; no manual deletion or retagging is required.

## Verification evidence

- Browser tests check one initial opportunity-report request and zero additional reads for local filters, late-response protection, bounded row rendering and full 115-row CSV export.
- Backend integration checks cover 114-recipient pagination, catalogue-only loading, selected-opportunity queries, sample account/record collisions, password preservation/reset, overlapping preparation and cleanup boundaries.
- `.impeccable/review/reports/measurements.json` and screenshots record the synthetic local rehearsal. No live project data was injected by the development checks.
