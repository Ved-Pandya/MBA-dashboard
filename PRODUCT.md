# DeadlineOS

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

MBA students and the POCs, CRs and administrators coordinating their batch. Student day-to-day work and management workflows deserve equal design attention.

## Product Purpose

Make deadlines, academic dates, registrations and batch responses easy to find and act on. Managers publish to an authorized audience; students respond; representatives follow up through scoped reports. Help students choose the next real task and recognize saved progress.

## Operating Context

Frequent mobile use between classes, with involved publishing/reporting on larger screens. The implementation models one batch, India time, Sections A/B and Wings A–J. This comes from repository evidence; no real student data is available in the design environment.

## Capabilities and Constraints

Preserve Firebase authentication, additive role permissions, server-only mutations, wing forms, academic calendar, competition confirmations, internship responses, placement sessions, polls, POC setup, CR Board, reports, private placement status, timetable import, notifications and PWA installation. Academic events are informational; wing forms have completion and timed reminders. Push delivery requires deployed HTTPS and supported devices.

Campus Quest derives 25 XP from each currently saved deadline completion and advances a level every five. Reopening lowers derived progress; toggling cannot accumulate extra XP. The optional 15-minute focus sprint is local to mounted Today and does not award XP. Confirmation follows successful server mutations; failures retain recovery feedback. These features support actual obligations and do not replace submission/response workflows.

## Brand Commitments

Keep the product name DeadlineOS. The user rejects generic interface themes and explicitly requests a gamified, easy-to-use experience with animation. No particular palette or typeface was binding; the implemented Campus Quest identity uses forest, lime, lavender and bold self-hosted IBM Plex Sans.

Gamification supports real work: saved completions earn progress, ordinary workflow labels stay clear, and motion respects reduced-motion preferences. Preserve the student and management functions and permissions. Do not invent streaks, rankings or student performance claims.

## Product Principles

- Put required work and a useful next action before setup prompts.
- Ground progress in saved completion with reversible state.
- Give managers readable records and explicit create/edit paths.
- Use students' terminology; show audience, deadline and state.
- Keep focus sprints optional and disclose page-local scope.
- Preserve keyboard, touch and reduced-motion interactions.

## Evidence on Hand

Repository workflows, synthetic emulator fixtures and student, Wing POC, CR and administrator workflow tests. The current direction is recorded in .impeccable/surfaces/dashboard.md; quest.css overlays base daybook.css. .impeccable/review contains synthetic desktop, tablet, mobile and sign-in captures, browser checks and finish-review evidence. Browser checks record matching viewport/scroll widths at 1440, 1280, 820 and 390px, no captured errors, reduced motion and completion/reopen progress behavior. Earlier docs/screenshots are historical evidence rather than the current visual specification.
