---
name: DeadlineOS
description: A dark campus quest board with earned amber progress.
colors:
  ink: "#edf0f5"
  accent: "#f0b76b"
  on-accent: "#1a1510"
  accent-hover: "#f6ca8d"
  accent-surface: "#352b20"
  paper: "#111318"
  surface: "#1b1f27"
  surface-subtle: "#252b35"
  muted: "#a2aab8"
  line: "#343c48"
  control-border: "#727e90"
  rail: "#0c0f14"
  rail-text: "#d4dae5"
  quest-surface: "#25231f"
  quest-line: "#5c503d"
  quest-muted: "#c5bcac"
  lavender: "#202c3e"
  focus-text: "#d5e3fc"
  focus-muted: "#b0c4e4"
  coral: "#f09a83"
  success: "#9ed9bb"
  success-surface: "#1d302a"
  danger-surface: "#302326"
  blue: "#a8c9fa"
  red: "#f29a8c"
  amber: "#f0b76b"
typography:
  display:
    fontFamily: IBM Plex Sans, sans-serif
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.03
    letterSpacing: -0.04em
  headline:
    fontFamily: IBM Plex Sans, sans-serif
    fontSize: 38px
    fontWeight: 650
    lineHeight: 1.07
    letterSpacing: -0.035em
  title:
    fontFamily: IBM Plex Sans, sans-serif
    fontSize: 20px
    fontWeight: 650
  body:
    fontFamily: IBM Plex Sans, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: IBM Plex Sans, sans-serif
    fontSize: 13px
    fontWeight: 600
rounded:
  field: 7px
  control: 8px
  record: 12px
  focus: 14px
  board: 16px
spacing:
  compact: 8px
  group: 16px
  section: 28px
  page: 38px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: 10px 16px
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: 10px 16px
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: 10px 12px
  task-record:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.record}"
    padding: 13px 12px
---

# Design System: DeadlineOS

## Overview

Campus Quest makes academic work feel approachable through visible, earned progress. Charcoal navigation, warm amber milestones, muted blue focus controls and subdued status surfaces form a dark game board around real tasks. Clear labels, readable records and direct actions preserve the product's working vocabulary.

The user explicitly requested a dark palette for the Campus Quest identity. The normative theme is apps/web/src/app/quest.css, imported after daybook.css. The dashboard's composition and behavior live in .impeccable/surfaces/dashboard.md; primitives here apply across sign-in, student and management screens.

## Colors

A near-black canvas (#111318) and darker rail (#0c0f14) frame elevated graphite records (#1b1f27). Off-white foregrounds and cool muted text maintain reading hierarchy. Amber (#f0b76b) identifies primary actions, earned XP and selected navigation. The quest board is a dark warm surface (#25231f), with a muted blue focus sprint (#202c3e). Red and green status tones remain legible against explicitly dark surfaces. The legacy lavender CSS token now carries the focus-blue surface; it is retained for component compatibility.

Use the accent for links, primary actions and focus. Decorative separators use line; interactive boundaries use control-border. Red and amber accompany visible overdue, cancellation, warning and error words. Every state has text or an explicit pressed/disabled state; color alone never communicates status.

## Typography

Self-hosted IBM Plex Sans is the single interface family, with its license retained in public/fonts. Bold headings give the world its personality; actions and dense data use measured sizes and weights. Fraunces is no longer the active display face.

The quest heading is 40px/700 on desktop, 36px at 1180px and 26px on phones. General page headings are 38px/650, reducing to 30px on phones. The personal greeting is 34px, reducing to 27px. Section headings use 20px/650. Task titles are 14px/600. Timers and XP use tabular numerals. Display tracking never exceeds -0.04em. Sign-in uses a larger responsive display, capped at 72px.

## Layout

The desktop rail is 238px, narrowing to 218px at 1180px. A 72px utility header and a work area up to 1370px frame the content. The day view pairs a flexible deadline column with a 294px aside; the latter narrows to 258px at 1180px.

At 900px, the rail becomes a labelled four-item bottom navigation and a role-aware My desk directory. The work area becomes one main column with a two-column aside. At 680px, the quest heading and next-task action share a compact top row, with the milestone path below; the aside stacks and places focus after replies and academic dates. Respect safe areas and keep scrollable tables when columns cannot usefully collapse.

## Elevation & Depth

Task records use a border rather than a floating shadow. White selected segments use a small downward 0 2px 5px shadow. The next milestone uses 0 4px 8px depth. Floating action menus and reward confirmations use the shared 0 8px 22px shadow at 30% black opacity. Avoid decorative glow and glass.

## Shapes

Controls have 8px corners, task records 12px, focus 14px, and the quest board 16px. The tilted outline brand mark and trophy stop add restrained game-board character. Task checks use an 8px rounded square with a 38-by-44px hit area. Authored outline SVG icons share rounded stroke ends; no emoji substitute for icons.

## Components

### Actions and fields

Primary actions use amber with dark on-accent text, a 44px minimum height, and 8px corners. Hover uses a lighter amber. Secondary actions retain a visible boundary. Disabled actions reject interaction and reduce opacity. Keyboard focus uses a 2px accent outline with 3px offset, retaining amber on the rail. Inputs retain explicit labels, visible boundaries and readable phone sizes. Errors preserve recovery text and entered values.

### Navigation and records

The charcoal rail uses full labels and outline icons; the current destination is amber with dark text. Mobile navigation keeps Today, Academics, Opportunities and My desk. Management keeps factual labels, records-first editing and server-authorized actions. Task records expose title, scope, deadline, completion and resource links. Overdue records use a subdued dark red surface plus explicit coral overdue text.

### Earned progress

The quest board derives 25 XP from each saved task completion, with five completions per level. Reopening recalculates XP from saved records, so toggling cannot accumulate extra points. Five connected stops, an explicit progressbar and a text count express progress. Pick my next task clears filters and focuses the earliest pending deadline. See my wins opens completed work. Empty task queues lead to academics.

### Focus and feedback

The optional 15-minute sprint starts, pauses, resets and finishes against wall-clock time. Its helper states that the user should remain on the page; it resets when the Today view unmounts. It does not award XP. A successful saved completion triggers a dismissible five-second confirmation and one bounded 750ms confetti burst. Reopening shows ordinary confirmation. Routine feedback lasts 160â€“200ms; drawers use 220ms and the milestone line 500ms with exponential ease-out. Content is visible by default. Reduced motion removes confetti and spatial animation while preserving visible state and confirmation.

## Do's and Don'ts

- Do make actual obligations and their next action easy to find.
- Do derive progress from saved records and preserve clear failure feedback.
- Do carry shared tokens through management, sign-in, icons and offline states.
- Do preserve role permissions, server mutations, labelled controls and mobile navigation.
- Don't invent streaks, rankings, scores, classmates or productivity claims.
- Don't replace familiar task labels with obscure game terminology.
- Don't animate routine page loads or require watching a sequence before acting.
- Don't reintroduce large lime, pastel or white panels into this dark theme.
- Do keep native controls, browser chrome, icons and offline surfaces dark.
