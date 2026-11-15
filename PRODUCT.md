# DeadlineOS

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

MBA students and the POCs, CRs and administrators coordinating their batch. The user confirmed that student day-to-day work and management workflows deserve equal design attention.

## Product Purpose

Make deadlines, academic dates, registrations and batch responses easy to find and act on. A manager publishes to an authorized audience; students respond; representatives follow up through scoped reports.

## Operating Context

Frequent mobile use between classes, with more involved publishing and reporting on larger screens. Existing implementation models one batch, India time, Sections A/B and Wings A–J. This context comes from the repository; no real student data is available in the design environment.

## Capabilities and Constraints

Preserve Firebase authentication, additive role permissions, server-only mutations, wing forms, academic calendar, competition confirmations, internship responses, placement sessions, polls, POC setup, CR Board, reports, private placement status, timetable import, notifications and PWA installation. Academic events are informational; wing forms have completion and timed reminders. Push delivery requires a deployed HTTPS app and supported devices.

## Brand Commitments

Keep the product name DeadlineOS. The user rejects a generic AI-looking interface and requests a more differentiated and intuitive design. No particular palette or typeface is binding.

## Product Principles

- Put required work before summaries and setup prompts.
- Give managers a readable record of existing work and an explicit path to create or edit.
- Use students' own terminology and make audience, deadline and state visible.
- Preserve accessible keyboard and touch interactions.

## Evidence on Hand

Repository workflows, synthetic emulator fixtures and committed screenshots in `docs/screenshots`. Existing tests exercise student, Wing POC, CR and administrator workflows on desktop/mobile.
