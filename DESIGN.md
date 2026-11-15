---
name: DeadlineOS
description: A clear, ruled workspace for the MBA day.
colors:
  ink: "#142b3b"
  blue: "#244d6d"
  accent: "#b44629"
  paper: "#f4f6f8"
  card: "#ffffff"
  surface-subtle: "#edf1f5"
  muted: "#536574"
  line: "#d8e0e6"
  red: "#a33423"
  amber: "#83531b"
typography:
  display:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "clamp(46px, 5.7vw, 78px)"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
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
  control: "4px"
spacing:
  compact: "8px"
  group: "16px"
  panel: "22px"
  section: "24px"
  page: "38px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.card}"
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
    rounded: "{rounded.control}"
  navigation-item:
    textColor: "#e3ebf1"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  status:
    textColor: "{colors.muted}"
---

# Design System: DeadlineOS

## Overview

**Creative North Star: "The Campus Daybook"**

DeadlineOS uses the visual language of a working campus record: cool paper, dark ink, readable rows and precise dates. Students and coordinators share the same vocabulary and controls. The interface makes actual work visible through typography and alignment, with restrained color for state.

The implementation is intentionally flat and compact. The identity comes from IBM Plex Sans, a calendar mark, ruled content and a navy navigation rail. Photographic or decorative illustration is not part of this system. The source of truth is `apps/web/src/app/daybook.css`; the surface-specific composition is recorded separately in `.impeccable/surfaces/dashboard.md`.

**Key Characteristics:**

- Readable records with clear rules and consistent alignment.
- Small corners, solid surfaces and restrained state color.
- One self-hosted type family and authored outline SVG icons.
- Accessible native controls and deliberate editor disclosure.

## Colors

Dark ink and cool light paper carry most of the interface; burnt orange is a sparse identity accent.

### Primary

- **Ink:** headings, primary actions and the navigation rail.
- **Working Blue:** links, editor disclosure and keyboard focus.

### Secondary

- **Burnt Orange:** the calendar mark and punctuation in large headings.

### Neutral

- **Paper:** the cool light gray application canvas.
- **Card:** white fields, record containers and utility surfaces.
- **Subtle Surface:** quiet secondary states and hover backgrounds.
- **Muted Ink:** supporting dates, labels and explanations.
- **Rule:** thin separators and container edges.

### Named Rules

**The State Has Words Rule.** Overdue, cancelled and other states retain visible text. Red and amber support those labels; color alone does not communicate status.

## Typography

**Display Font:** IBM Plex Sans, with sans-serif fallback.
**Body Font:** IBM Plex Sans, with sans-serif fallback.

The Latin variable font is self-hosted under `apps/web/public/fonts`, with its OFL license and provenance. Medium weight makes the interface direct without heavy display typography. Monospace is reserved for actual CSV/code content.

### Hierarchy

- **Display:** the responsive login headline; the Today heading uses a compact operational display (54px desktop, 44px phone).
- **Headline:** page titles; reduced to 30px on phones.
- **Title:** section headings; individual records use medium weight at 15–16px.
- **Body:** ordinary content; working screens also use 13–14px supporting copy with generous line height.
- **Label:** sentence-case controls and form labels. Small date metadata uses 11–12px. Mobile form values become 16px.

**The One Family Rule.** Use Plex weight and scale to separate roles. Use tabular numerals where dates, counts and table values must align.

## Layout

The desktop shell has a sticky identity rail (224px), a white utility header (66px minimum) and a constrained working area (1370px maximum). Page padding is generous horizontally and content groups are separated by consistent 16–34px gaps. Containers use internal padding around the panel spacing token.

At 1180px the rail narrows to 202px and page gutters to 28px. At 900px the rail becomes a mobile directory plus four-item bottom navigation, with safe-area padding. At 680px content and forms become one column, gutters shrink to 16px, editor content comes before its record list, and form values enlarge for touch use. Preserve scrollable tables when their data cannot usefully collapse.

## Elevation & Depth

Pages, records and fields are flat. White surfaces, subtle tonal differences and thin borders establish hierarchy. A soft downward shadow is reserved for floating row-action menus. Modal drawers use a dimmed backdrop and scrolling content, with focus managed by the native dialog implementation.

### Shadow Vocabulary

- **Menu:** `0 6px 18px rgb(20 43 59 / .12)`; floating actions only.

**The Flat Records Rule.** Give a record its rule and spacing before adding a container. Do not add ornamental shadows to ordinary lists.

## Shapes

Controls and panels have small square-feeling corners, with slightly tighter fields. One-pixel boundaries define record groups; two-pixel horizontal ink rules establish major daybook sections. The calendar mark and application icons are authored SVG geometry with rounded stroke ends. Status dots and the loading spinner use circular geometry for specific meanings.

## Components

### Buttons

Solid ink primary actions contrast with white secondary actions. Both have a 44px minimum height, compact padding and a visible border. Hover changes surface tone; keyboard focus uses the shared two-pixel blue outline with three-pixel offset. Disabled controls reduce opacity and reject interaction. Text actions retain generous vertical targets and underline on hover.

### Cards / Containers

White panels group related records or a working editor. Headers and rows separate with thin rules; nested promotional cards are outside this visual vocabulary. Shared panel headers use horizontal spacing and a quiet count. Existing statistical reports use a contiguous ruled strip rather than floating metric cards.

### Inputs / Fields

White fields have a muted blue-gray stroke, visible external labels and no decorative fill. Textareas resize vertically. Errors use readable red text on a pale red surface, alongside the actionable message. Selection and caret colors belong to the ink palette. Mobile values enlarge without shrinking labels or targets.

### Navigation

The navy rail shows full labels with consistent outline icons. The active destination has a pale blue surface and ink text. Mobile navigation has Today, Academics, Opportunities and My desk; the directory contains the remaining role-appropriate destinations. The utility header carries App setup and Inbox.

### Status Labels

Compact text and a small dot communicate state without a rounded badge container. Published/completed are green; overdue/cancelled are red; warning/urgent are amber. Keep the words present.

### Ruled Records and Editors

Deadline rows align completion, title, context, due time and the actual resource action. Completion remains reversible when the lifecycle allows it. Management records show current state first. A labelled create/edit action reveals a contextual editor, retaining values when saving fails. Tabs underline the selected view instead of enclosing it in a pill.

### Motion and Browser States

The current authored motion is a one-second linear loading spinner, disabled by reduced-motion preference. Other states change directly. Preserve visible focus, themed text selection, caret, underline offset and tabular data. Do not introduce entrance effects as a substitute for useful feedback.

## Do's and Don'ts

### Do:

- **Do** place the real title, state, date and action in a readable record.
- **Do** use the same outline SVG vocabulary and self-hosted Plex family.
- **Do** retain visible labels, keyboard focus and explicit failure recovery.
- **Do** use border and tonal layering for ordinary surfaces.

### Don't:

- **Don't** add decorative gradients, floating statistics or icon mosaics to working screens.
- **Don't** replace meaningful content with generic marketing copy.
- **Don't** rely on color alone for status.
- **Don't** introduce eyebrow labels, glyph icons or ornamental shadows.
