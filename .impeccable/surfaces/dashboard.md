# Dashboard redesign

Mode: Operate. Scope: login, application shell, student day, management publishing, and shared component system.

## Direction contract

THESIS: A campus quest board turns ordinary deadlines into small, visible wins. Students can choose their next real obligation, tick off saved work, earn progress, and take an optional focus sprint. Management keeps clear records and the same approachable component vocabulary.

OWN-WORLD: Campus Quest. Near-black navigation, charcoal work surfaces, off-white ink, amber progress and action states, muted blue focus controls and subdued warm notices. Self-hosted IBM Plex Sans carries bold rounded-looking headings and precise task data. Bordered task tiles and five connected milestone stops establish a game-board grammar. Authored outline icons remain consistent across the interface.

STORY: The student sees their personal greeting and saved progress, uses Pick my next task to focus the first pending deadline, submits the actual work and ticks it off. A brief reward confirms the successful save. Replies, academic dates and the optional timer stay close. A POC/CR sees their relevant workspace and opens an editor deliberately.

FIRST VIEWPORT: A charcoal rail with an amber active destination, a compact personal greeting and date stamp, then a dark warm Small steps. Big wins. board with an explicit next-task button. The five-stop path displays 25 XP per saved completion and five completions per level. The task list begins directly below; the muted blue focus sprint and response requests occupy the adjacent column on desktop. On mobile the quest board stacks, the list follows, and labelled bottom navigation remains available. Sign-in uses a dark warm explainer with three concrete steps beside the credential form.

FORM: The user explicitly requested a replacement gamified world, simpler use and animation. The game-board direction is pinned by that brief. The user then explicitly requested a darker colour scheme; the palette changed while layout, copy and interactions were preserved. Both context and concept-seed launchers were invoked; the engine is unavailable because its install location is not writable. This is a code-led implementation based on the inspected app and synthetic emulator screenshots, with no claimed seed assignment or approved comp.

SIGNATURE INTERACTION: A saved deadline completion updates the connected milestone path and XP and triggers a bounded 750ms confetti burst with a dismissible five-second reward. Reopening derives progress from the remaining saved completions, preventing XP farming. The focus sprint starts, pauses, resets and finishes using a wall-clock deadline; it is scoped to the mounted Today page, as its helper text states. Reduced motion preserves state and confirmation while removing spatial motion and confetti. Drawer motion is 220ms; feedback transitions are 160–200ms. No entrance choreography delays working content.

QUALITY BAR: The first viewport reads as a playful quest board, with a functional next action and earned progress rather than invented statistics. The five milestones, task rows and focus timer form one visual world on desktop and mobile. Shared fields, actions, tables, editors and management records preserve their real roles and labels. Authentication and server mutation boundaries remain intact. This is a written code-led bar, with no claimed external visual reference or approved image.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification

Focus sprints now begin at 25 minutes. Each departure from a running browser tab holds the countdown and adds one minute, once per departure; returning resumes it. Idle, paused and completed sprints are exempt. The rule and accumulated penalties are visible, and leaving Today resets this optional local timer. The dark blue focus surface, existing controls and reduced-motion behavior remain authoritative.

Report surfaces keep stable loading regions, explicit snapshot refresh, and 50-row UI pages. Local filters reuse the loaded dataset; server pagination remains explicit before full compliance export. System admin exposes report shortcuts and a Prepare 15-minute demo action with real setup phases, protected demo sign-ins and a 14-minute walkthrough. These additions inherit the dark Campus Quest system.

One combined desktop/mobile inspection round, one corrective batch and one confirmation round. Preserve role workflows and verify navigation, editor disclosure, forms, response controls and accessibility with emulator/browser tests. Screenshots are synthetic browser captures, not generated illustrations.
