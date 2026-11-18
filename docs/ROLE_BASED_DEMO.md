# Demonstrating role-based views

Use this as a 7 to 10 minute introduction before the [full feature demonstration](PRESENTATION_RUNBOOK.md). Show how the same system changes with responsibility, then demonstrate the complete workflows.

## Prepare the sessions

1. Sign in with your existing System admin account and select **Presentation workspace > Prepare 15-minute demo**. Copy any newly generated passwords before leaving the page. If you no longer have the existing demo passwords, use **Reset demo passwords** before preparing your other sessions.
2. Keep the administrator signed in. Use a separate browser profile for each demo identity. Two normal tabs in one profile share the Firebase login; opening another tab does not give you a different role. You can instead sign out and sign in between demonstrations.
3. Label your browser windows Student, Wing POC, Subject/batch POC, CR and Admin. Open Today in each. On desktop, compare the left navigation; on mobile, compare the **My desk** directory.
4. Use a dedicated demo project. Existing occupied wing/batch POC seats are preserved by the injector, so a shared project's existing grants can change the sample POC's available controls.

Use real sign-ins for this demonstration. There is no administrator impersonation or cosmetic role selector: each session exercises the actual account's permissions.

## What changes for each identity

All accounts retain the personal student screens. Management tools are added according to their roles and scopes; becoming a POC does not remove the person's own deadlines.

| Identity | Sign-in | Views or controls to highlight | Boundary to explain |
| --- | --- | --- | --- |
| Student | `24M2901` | Today, Academics, Opportunities, Placement sessions and Batch polls; personal completion and response controls | Cannot publish work, assign POCs or access System admin |
| Wing A POC | `24M2904` | Wing forms, Task compliance and Reports; publishing and following up wing tasks | Wing management is limited to assigned wings. This demo account also holds the second subject POC seat for DEMO-FIN-A, so it is intentionally an example of combined scopes |
| Subject and batch POC | `24M2902` | Academics editing for assigned DEMO offerings; competition, session and poll management where the relevant batch seat is granted; Task compliance | Subject editing is limited to assigned offerings. Batch responsibilities are separate grants; this account combines them for the presentation |
| Class representative | `24M2903` | Task compliance, CR Board, Reports, POC setup, Placement status and Timetable setup | Has governance responsibilities, but no System admin page. Wing forms still require a wing POC scope |
| System administrator | Your existing admin account | System admin: roster, configuration, presentation data and delivery health; governance screens | Administrative authority is checked on the server. The Wing forms menu still requires a wing scope; an admin is not automatically a wing POC |

The two remaining sample accounts illustrate **data visibility and eligibility**, rather than extra permission roles:

- **Section B student (`24M2906`):** same student interface, but Section B academic records and a different set of assigned tasks.
- **Placed student (`24M2905`):** same student role, with different internship eligibility. For the seeded internships, show **No action assigned** and contrast it with the ordinary student's registration controls. Private placement records are managed through the authorised governance screen.

## Presentation order and actions

### 1. Student: show personal work

Sign in as `24M2901`. Point out the personal navigation and open **Demo placement preference form** on Today. Leave it pending initially. Explain: "This person sees work assigned to them and can update their own response. They cannot publish the task or change other people's responses."

### 2. Wing POC: show the manager's side of the same work

Switch to `24M2904`. Highlight **Wing forms**, **Task compliance** and **Reports**. Open the seeded placement preference form in Wing forms to show its management controls. Open **Demo directory audit** in the scoped reporting view to show pending/completed/exempt responses. Explain: "The POC sees the people they must follow up with, rather than only their own to-do list."

For a live connection between the views, return to the Student session and complete the placement preference form. Return to its manager's view and show the updated completion total or response list; reopen/reload the report if needed. The shared task remains the same while one student's response changes.

### 3. Subject and batch POC: show responsibilities inside shared screens

Switch to `24M2902`. Open **Academics** and edit a seeded event for **DEMO-FIN-A**. Compare with the ordinary Student session, which can read the event but cannot edit it. Then open Opportunities or Placement sessions and show the management controls provided by the relevant batch grant.

Explain: "A role difference can be an extra control inside the same page. It does not always need a completely different dashboard. This sample user has several grants; subject ownership and batch responsibility are separate."

### 4. CR: show coordination and delegation

Switch to `24M2903`. Point out **CR Board**, **POC setup**, **Placement status** and **Timetable setup**. Open a seeded CR task, then show the two subject POC seats on **DEMO-FIN-A** in POC setup. Explain that a representative coordinates work and assigns responsibility. Point out that System admin is absent.

If demonstrating revocation, do it after the POC feature walkthrough: removing a grant can intentionally remove menus or edit controls that you need earlier in the presentation.

### 5. Admin: show system operation

Return to the existing administrator session. Open **System admin** and show roster/configuration, sample-data controls and delivery health. Explain: "This view operates the system itself; it is separate from a student's responses and a POC's assigned responsibility."

### 6. Contrast two ordinary students

Briefly sign in as `24M2906` and show the Section B academic record. Then use `24M2905` to contrast internship eligibility. Say: "The permission role can stay the same while the data changes with section, wing, assignment and eligibility."

## Explain the protection accurately

Navigation helps users find permitted work. The server handlers and Firestore rules enforce access independently of which buttons are displayed. In the current navigation, requesting an unavailable view through the URL falls back to Today; use this as a short interface demonstration, not as proof of the entire security model.

If you want to show the fallback, open `/?view=admin` while signed in as the ordinary Student. It should return to Today rather than reveal System admin. Do not change database grants or disable rules for the presentation. The automated rule and workflow tests provide the separate permission checks.

Close this introduction with: "One system, a personal view for everyone, additional tools for assigned responsibilities, and access checks behind every privileged operation."
