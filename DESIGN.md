---
name: DeadlineOS
description: An academic register in cream and vermilion.
colors:
  ink: "#302a25"
  link: "#963b2b"
  accent: "#a53a2a"
  paper: "#f5f0e5"
  card: "#fbf8f0"
  surface-subtle: "#eee6d7"
  muted: "#6f6256"
  line: "#d7cdbc"
  control-border: "#93816a"
  rail: "#9d3829"
  rail-text: "#fff4df"
  on-accent: "#fff9ed"
  red: "#a12e24"
  amber: "#80511d"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(66px, 7vw, 88px)"
    fontWeight: 450
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(38px, 4vw, 54px)"
    fontWeight: 450
    lineHeight: 1.07
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 500
rounded:
  field: "3px"
  control: "3px"
  flat: "0px"
spacing:
  compact: "8px"
  group: "16px"
  panel: "22px"
  section: "24px"
  page: "38px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.label}"
  field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  panel:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.flat}"
  navigation-item:
    textColor: "{colors.rail-text}"
    rounded: "{rounded.flat}"
    padding: "12px"
  status:
    textColor: "{colors.muted}"
---

# Design System: DeadlineOS

## Overview

**Creative North Star: "The Academic Register"**

DeadlineOS uses the character of an academic register: warm cream pages, deep vermilion navigation, expressive Fraunces headings and precise IBM Plex Sans interface data. Actual work remains visible through readable records, aligned dates and direct actions.

The implementation is flat and practical. Fine rules structure records; darker boundaries identify controls. The user rejected the earlier generic blue/sans-serif appearance and asked mainly for a visual-style change, so established workflows and information layout remain intact. The source of truth is `apps/web/src/app/daybook.css`; surface composition is recorded separately in `.impeccable/surfaces/dashboard.md`.

**Key Characteristics:**

- Expressive Fraunces headings paired with readable Plex data.
- Vermilion identity surfaces, cream fields and dark warm ink.
- Flat records with fine rules and stronger interactive boundaries.
- Live India-date stamps and consistent authored outline SVG icons.

## Colors

Warm cream and dark ink carry working content; committed vermilion identity surfaces and action states give the system its character. Frontmatter values are normative.

### Primary

- **Vermilion Accent:** primary actions, active tabs, calendar details and prominent date numerals.
- **Deep Vermilion Rail:** navigation and the sign-in cover.
- **Working Red:** links and shared keyboard focus.

### Neutral

- **Ink:** primary text and headings.
- **Paper:** the cream canvas and utility header.
- **Card:** light cream fields, dialogs and editors.
- **Subtle Surface:** quiet tonal states and hover backgrounds.
- **Muted Ink:** supporting dates, labels and explanations.
- **Rule:** thin decorative separators.
- **Control Boundary:** darker field, task-toggle and outlined-action strokes.
- **Rail Text / On Accent:** light foregrounds on vermilion surfaces.

Red and amber support explicit error, overdue and warning text. Published and completed labels retain the implemented green treatment.

**The State Has Words Rule.** Overdue, cancelled and other states retain visible text. Red and amber support those labels; color alone does not communicate status.

**The Control Boundary Rule.** Use the darker control-boundary token for outlined controls; the lighter line token belongs to decorative separators.

## Typography

**Display Font:** Fraunces, with Georgia and serif fallback.
**Body Font:** IBM Plex Sans, with sans-serif fallback.

Both Latin variable fonts are self-hosted with their OFL licenses and provenance. Headings use the implemented SOFT 25 and WONK 1 variation settings. The contrast between expressive serif headings and precise sans-serif data carries the identity. Monospace is reserved for actual CSV/code.

### Hierarchy

- **Display:** Today uses the frontmatter display role, reduced to 64px on phones. The sign-in cover has its own responsive display (58?92px, 52px on phones).
- **Headline:** page titles; reduced to 39px on phones.
- **Title:** section headings; day-view sections use 24?25px. Management record titles and reply questions use Fraunces at 23px, weight 450. Student task titles remain Plex at 16px.
- **Body:** ordinary content; supporting copy also uses 13?14px with generous line height. Explanatory heading copy is constrained to 68ch.
- **Label:** sentence-case controls and form labels. Small metadata uses 11?12px; phone field values enlarge to 16px.
- **Calendar numerals:** Fraunces lining numerals, weight 400, 64px in the main stamp and 46px on phones.

**The Two Voices Rule.** Use Fraunces for headings, prominent dates and management record titles. Use Plex for actions, field values, student task details and dense tables.

## Layout

The established shell has a sticky desktop rail (224px), a cream utility header (66px minimum) and a constrained work area (1370px maximum). Generous page gutters and 16?34px group spacing keep working records aligned. Editors remain deliberate disclosures beside their records.

At 1180px the rail narrows to 202px and gutters to 28px. At 900px the rail becomes a mobile directory and labelled four-item bottom navigation with safe-area padding. The day view becomes one main column with adjacent reply/date sections. At 680px those sections and forms stack, gutters shrink to 16px and contextual editors precede records. Preserve scrollable tables when the data cannot usefully collapse.

## Elevation & Depth

Pages, records and fields are flat. Cream tonal differences, spacing and rules establish hierarchy. Management lists remove side boundaries and keep separated records; contained editors have light solid surfaces. Modal drawers use a dimmed warm-ink backdrop and native focus management.

### Shadow Vocabulary

- **Menu:** 0 6px 18px rgb(48 42 37 / .12); floating row actions only.

**The Flat Records Rule.** Give a record its rule and spacing before adding a container. Reserve the soft downward shadow for floating action menus.

## Shapes

Flat panels and navigation have square corners. Principal actions and fields have small control corners; some secondary menus retain four-pixel corners. One-pixel rules structure records. The task toggle begins as an outlined circle and becomes a filled checked square, retaining a 44px hit target. The date stamp is a narrow outlined rectangle. Calendar and interface icons use authored SVG geometry with consistent rounded stroke ends. Status dots and unread counts use circular geometry for meaningful states.

## Components

### Buttons

Primary actions are vermilion with light text, compact padding and a 44px minimum height. Secondary actions are transparent with dark text and the control boundary. Hover changes tone; keyboard focus uses the shared two-pixel working-red outline with three-pixel offset. Rail focus is light against vermilion. Disabled controls reduce opacity and reject interaction. Text actions retain vertical targets and underline on hover.

### Cards / Containers

Light cream panels group editors or fields. Headers and rows separate with fine rules; management lists are flat and unboxed. Serif headings pair with quiet Plex counts. Reports retain contiguous ruled summaries instead of floating statistic cards.

### Inputs / Fields

Light cream fields have strong warm strokes, visible external labels and small corners. The control-boundary token contrasts at least 3:1 with both paper and card. Textareas resize vertically. Errors use readable red text on pale red surfaces alongside the recovery message. Warm peach selection and ink carets belong to the palette. Phone values enlarge without shrinking labels or targets.

### Navigation

The deep vermilion rail has full Plex labels and outline icons. Hover darkens it; selected destinations use cream and dark red. Mobile navigation keeps Today, Academics, Opportunities and My desk, with a vermilion selected indicator. The directory contains remaining role-appropriate tools. App setup and Inbox remain in the cream utility header.

### Status Labels

Compact text and a small dot communicate state without a badge container. Keep the words visible. Tabs underline selected views in vermilion instead of enclosing them in pills.

### Date Stamp and Brand

The live India-date stamp pairs a small month/year with large Fraunces numerals in a fine vermilion frame. It is hidden from assistive technology when the day heading already provides date context. The wordmark pairs Fraunces Deadline with a compact outlined Plex OS suffix and the authored calendar icon. Application icons follow the warm palette.

### Completion and Motion

A task toggle changes from an outlined circle to a vermilion square with a check over 250ms using exponential ease-out. Its pressed state and completed view remain explicit and reversible. Reduced motion removes that transition and the loading spinner animation. No entrance effect delays working content.

## Do's and Don'ts

### Do:

- **Do** place the real title, state, date and action in a readable record.
- **Do** use Fraunces headings and Plex data according to their roles.
- **Do** retain visible labels, keyboard focus and explicit failure recovery.
- **Do** keep control boundaries stronger than decorative row rules.

### Don't:

- **Don't** add decorative gradients, floating statistics or icon mosaics to working screens.
- **Don't** replace meaningful content with generic marketing copy.
- **Don't** rely on color alone for status.
- **Don't** introduce eyebrow labels, glyph icons or ornamental shadows.
