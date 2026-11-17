---
name: DeadlineOS
description: A campus quest board that makes real deadlines feel achievable.
colors:
  ink: "#203d35"
  accent: "#28604b"
  paper: "#f4f7f2"
  surface: "#ffffff"
  surface-subtle: "#eaf0e7"
  muted: "#576b62"
  line: "#d9e2d6"
  control-border: "#819287"
  lime: "#dcf694"
  lavender: "#e6def7"
  coral: "#f4ad96"
  red: "#b33932"
  amber: "#865219"
typography:
  display:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.03
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "38px"
    fontWeight: 650
    lineHeight: 1.07
    letterSpacing: "-0.035em"
  title:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "20px"
    fontWeight: 650
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  field: "7px"
  control: "8px"
  record: "12px"
  focus: "14px"
  board: "16px"
spacing:
  compact: "8px"
  group: "16px"
  section: "28px"
  page: "38px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  task-record:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.record}"
    padding: "13px 12px"
---

# Design System: DeadlineOS

## Overview

Campus Quest makes academic work feel approachable through visible, earned progress. Forest navigation, a lime milestone path, lavender focus controls and peach notices form a playful game board around real tasks. Clear labels, readable records and direct actions preserve the product's working vocabulary.

The user explicitly requested this replacement of the previous Academic Register identity. The normative theme is apps/web/src/app/quest.css, imported after daybook.css. The dashboard's composition and behavior live in .impeccable/surfaces/dashboard.md; primitives here apply across sign-in, student and management screens.

## Colors

Forest ink carries navigation, text and the next-task action. Lime denotes the quest board and selected navigation. Lavender identifies the optional focus sprint; peach supports registration notices and the completion mark. Fresh paper and white keep dense records readable.

Use the accent for links, primary actions and focus. Decorative separators use line; interactive boundaries use control-border. Red and amber accompany visible overdue, cancellation, warning and error words. Every state has text or an explicit pressed/disabled state; color alone never communicates status.

## Typography

Self-hosted IBM Plex Sans is the single interface family, with its license retained in public/fonts. Bold headings give the world its personality; actions and dense data use measured sizes and weights. Fraunces is no longer the active display face.

The quest heading is 40px/700 on desktop, 36px at 1180px and 26px on phones. General page headings are 38px/650, reducing to 30px on phones. The personal greeting is 34px, reducing to 27px. Section headings use 20px/650. Task titles are 14px/600. Timers and XP use tabular numerals. Display tracking never exceeds -0.04em. Sign-in uses a larger responsive display, capped at 72px.

## Layout

The desktop rail is 238px, narrowing to 218px at 1180px. A 72px utility header and a work area up to 1370px frame the content. The day view pairs a flexible deadline column with a 294px aside; the latter narrows to 258px at 1180px.

At 900px, the rail becomes a labelled four-item bottom navigation and a role-aware My desk directory. The work area becomes one main column with a two-column aside. At 680px, the quest heading and next-task action share a compact top row, with the milestone path below; the aside stacks and places focus after replies and academic dates. Respect safe areas and keep scrollable tables when columns cannot usefully collapse.

## Elevation & Depth

Task records use a border rather than a floating shadow. White selected segments use a small downward 0 2px 5px shadow. The next milestone uses 0 4px 8px depth. Floating action menus and reward confirmations use the shared 0 8px 22px shadow at 12% forest opacity. Avoid decorative glow and glass.

## Shapes

Controls have 8px corners, task records 12px, focus 14px, and the quest board 16px. The tilted outline brand mark and trophy stop add restrained game-board character. Task checks use an 8px rounded square with a 38-by-44px hit area. Authored outline SVG icons share rounded stroke ends; no emoji substitute for icons.

## Components

### Actions and fields

Primary actions use accent with white text, a 44px minimum height, and 8px corners. Hover darkens toward forest ink. Secondary actions retain a visible boundary. Disabled actions reject interaction and reduce opacity. Keyboard focus uses a 2px accent outline with 3px offset, switching to lime on the rail. Inputs retain explicit labels, visible boundaries and readable phone sizes. Errors preserve recovery text and entered values.

### Navigation and records

The forest rail uses full labels and outline icons; the current destination is lime with dark text. Mobile navigation keeps Today, Academics, Opportunities and My desk. Management keeps factual labels, records-first editing and server-authorized actions. Task records expose title, scope, deadline, completion and resource links. Overdue records use a pale peach treatment plus explicit overdue text.

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
- Don't restore the previous vermilion/cream/serif world on new screens.
