# DeadlineOS full feature demonstration

Use the 14-minute quick path below for a 10–15 minute presentation. The detailed reference sections that follow support a longer 35–45 minute session. Lead with the student experience, follow one form through publication and response, then show coordination, reports and administration. Explain the architecture at the end, once the audience has seen the work it supports.

To introduce the different interfaces, start with the [role-based views demonstration](ROLE_BASED_DEMO.md). Allow another 7 to 10 minutes to compare Student, Wing POC, Subject/batch POC, CR and System admin, followed by Section B and placed-student examples. Use separate signed-in browser profiles so each view reflects real permissions.

## 14-minute quick path

Prepare sample data and sign-in windows before the clock starts. Use the preloaded drafts and examples rather than creating every record live. Leave the reminder-check task pending. The app displays the same timed plan under System admin.

| Time | Role and screen | Demonstrate |
| --- | --- | --- |
| 2 min | Student · Today | Search deadlines, compare To do and Completed, complete a form and reopen it. |
| 1 min | Student then Subject POC · Academics | Browse pre-reads, assignments, quizzes and exams; edit a demo date and show the change. |
| 2 min | Wing A POC · Wing forms | Edit the demo draft, preview its audience, publish, then complete it as the student. |
| 1 min | Student then CR · Placement sessions and Batch polls | Answer and change a response, inspect results, and compare open and closed items. |
| 1 min | Student then batch POC · Opportunities | Show pending, partial and completed external and internal confirmations. |
| 1 min | Student then CR · Internships and Placement status | Register or decline; use the placed student's private record to explain eligibility. |
| 1 min | CR · CR Board | Open a task, edit its deadline, move it to In progress, then complete it. |
| 1 min | CR or System admin · POC setup | Use a DEMO subject offering to demonstrate the two subject seats and revocation. |
| 2 min | CR then Wing A POC · Task compliance and Reports | Choose Demo directory audit, filter responses, load every page and export the CSV. |
| 2 min | System admin and Student · System admin and App setup | Explain imports, health, inbox versus push, the demo reminder and safe sample-data cleanup. |

All dates are relative to preparation time. The reminder becomes due about two minutes into the walkthrough; delivery still depends on maintenance and device permission. Keep System admin in one browser profile and use separate signed-in profiles for the demo roles.

## Prepare before the audience arrives

1. Use a dedicated demo Firebase project and the corresponding deployed web app or local emulators. Sample records share the app's catalogue and queries. The injector preserves unrelated data; it does not create a separate sandbox.
2. Sign in with your existing **System admin** account. Open **System admin → Presentation workspace → Prepare 15-minute demo**. This creates missing protected demo accounts and refreshes the sample dataset.
3. Copy the generated passwords immediately. They are displayed only in that page session and are not saved in Firestore or browser storage. There are six sign-in accounts. The 110 extra report-only profiles do not have logins.
4. Keep System admin in its own browser profile. Open separate profiles for Student, Wing A POC, Subject POC and CR. Two ordinary tabs share a Firebase login; use separate browser profiles or isolated browser contexts.
5. If showing device notifications, sign in on the presentation phone, install the app where required and enable notifications in App setup. Then press **Prepare 15-minute demo** again from the admin session immediately before starting. Existing demo passwords still work and the sample deadlines and responses refresh.
6. Open this script in another window from **Demo accounts and presentation order → Open the full presentation script**. The same ten-step order appears inside System admin.
7. Keep the **Demo reminder check** assignment pending on the main Student account. Its normal two-hour reminder becomes due about two minutes after the last injection. Maintenance, device permissions and connectivity determine actual delivery time. The app does not fabricate scheduler or push-health results.

**Refreshing and resetting are different actions.** Prepare 15-minute demo rebuilds the seeded scenarios while preserving existing demo passwords. Reset demo passwords also rebuilds the data and replaces all six passwords, so copied credentials stop working. Do not reset passwords halfway through the presentation.

## Accounts and what each demonstrates

| Role | Roll number | Section and wing | Use it for |
| --- | --- | --- | --- |
| Student | 24M2901 | A and A | Today, completion, reply prompts, competitions and internships |
| Subject and batch POC | 24M2902 | A and A | Demo academic offerings and permitted session, poll and opportunity management |
| Class representative | 24M2903 | A and A | CR Board, governance, private placement status and full reports |
| Wing A POC | 24M2904 | A and A | Wing forms, scoped compliance and reports; also second POC seat on DEMO-FIN-A |
| Placed student | 24M2905 | B and B | Private eligibility, archived internship registration and restoration |
| Section B student | 24M2906 | B and B | Section-specific dates and a demo exemption |
| System admin | Your current account | Existing grants | Injector, roster, timetable, configuration and delivery health |

The report-only profiles are named **Sample report student 001** through **110**. Their roll labels begin **DEMO** and their profiles are invited. They exist to make the sample directory audit span two response pages; they are not usable login accounts.

## The sample records

| Area | Prepared data | Demonstration purpose |
| --- | --- | --- |
| Subjects and timetable | Six DEMO offerings, six slots, one DEMO term, subject POC seats | Academic context, section scope and responsibility |
| Academics | Nine records including pre-read, assignment, quiz, midterm, endterm, past and cancelled items | Date grouping, details, editing and history |
| Wing forms | Nine tasks including pending, overdue, completed, closed, cancelled, draft, pagination, reminder and Section B examples | Task lifecycle and different student states |
| Competitions | Four records with pending, partial, complete and draft examples | Two separate individual form confirmations |
| Internships | Four records with open, draft and cancelled examples | Registration, non-participation and placement eligibility |
| Sessions | Open, closed and draft | Attendance collection and report states |
| Polls | Open pending, open answered, closed and draft | Voting, changing an answer and results |
| CR Board | Assigned, in-progress and completed tasks | Representative coordination |
| Placement | Seeking and placed profiles, with archived registrations | Privacy and eligibility restoration |
| Reports | Demo directory audit with 114 recipients and mixed states | Two response pages, accurate totals and CSV export |
| Inbox and reminders | Read and unread notices plus actual reminder jobs | Inbox, deep links and real delivery processing |

Dates are recalculated from injection time. Sample form URLs point to the app's **practice form**, which accepts fictional input and simulates a submission without sending or storing it. DeadlineOS completion remains a separate self-attested action.

## 1 Show the student day

**Role and screen:** Student, Today. **Allow 4 minutes.**

1. Start with the student's name, current India date and readable deadline list. Explain that this is the personal view, not the entire batch's work.
2. Find **Demo overdue library access form** and compare its urgency with **Demo placement preference form**.
3. Search for “placement”, then clear the search. Show **To do**, **Completed** and **All activity**.
4. Open the placement preference practice form. Use a fictional name, tick the acknowledgement and select **Simulate submission**. Point out that the practice page did not save data.
5. Return to DeadlineOS and mark **Demo placement preference form** complete. It leaves To do. Find it under Completed and reopen it, then complete it again.
6. Under All activity, show **Demo closed hostel confirmation** and **Demo cancelled travel survey**. Their completion controls are inactive.
7. Open the inbox and show unread versus read items. On a phone, show the bottom navigation and **My desk** directory.

**Expected result:** completion changes this student's assignment and the manager's totals. Closing a form is a different manager action from completing a student's assignment.

**Say:** “The system gives each student a personal obligation. It keeps that student's response separate from the shared form.”

## 2 Add the academic context

**Roles and screen:** Student, then Subject POC, Academics. **Allow 4 minutes.**

1. Show **Demo time value of money pre-read**, **Demo brand positioning memo** and **Demo process analysis quiz**.
2. Point out the **Demo strategy midterm** and **Demo finance endterm**, including their venue and syllabus information where displayed.
3. Switch to the Subject POC profile. Edit one DEMO academic event's title or time and save it. Use the Student session to show the resulting record and inbox change.
4. Optionally add one new academic date against **DEMO-FIN-A**. Keep the resource and wording fictional.
5. Sign in as Section B Student briefly. Show **Demo Section B finance pre-read** and explain that a section's academic calendar has its own scope.

**Expected result:** the authorised subject POC can maintain the DEMO offering. The ordinary student cannot create or edit academic dates.

**Say:** “Academic dates inform the class. They are separate from the wing forms that students mark complete.”

## 3 Follow a form from manager to student

**Roles and screen:** Wing A POC, Wing forms; then Student, Today. **Allow 5 minutes.**

1. Show **All forms**, **Live**, **Drafts** and **Closed**. Open **Demo workshop interest draft** with Edit.
2. Change its instructions or deadline. Save the draft, inspect its details and publish it using the row action. Explain that publication resolves the eligible audience from the roster.
3. For a complete creation demonstration, choose **New wing form**, fill a fictional title and instructions, choose a future IST deadline and preview the audience before publishing. This creates a separate record and consumes additional writes.
4. In the Student session, find the published item and its inbox notice. Complete it.
5. Return as Wing POC. Use **Edit** to change a supported field. Open **More** and explain **Sync audience**, **Close** and **Cancel**. Demonstrate Close on a seeded form you no longer need for later steps.
6. Show that a closed form moves out of the student's active queue and remains in history.

**Expected result:** the Wing POC's profile is granted Wing A. Their identity can publish a Wing A form; they do not receive System admin tools.

**Say:** “One manager publication becomes many personal assignments. Each person can respond independently.”

**Keep for later:** do not close **Demo directory audit** before the reporting step or **Demo reminder check** before demonstrating delivery.

## 4 Collect attendance and opinions

**Roles and screens:** Student, Placement sessions and Batch polls; CR or the permitted batch POC for management. **Allow 4 minutes.**

1. Open **Demo consulting interview clinic**. Show venue, start time and the earlier response deadline. Select Attending, then change the response where the interface permits.
2. Open **Demo which clinic slot works best**. Vote for After class, then change the answer to Evening. Explain that this poll links to the session.
3. Show **Demo choose a workshop topic**, which already has an answer for the student, and the closed historical poll.
4. In the manager session, view the actual response totals and named report. Show the draft poll and session as examples that can be edited before publication.
5. Optionally publish the seeded draft, then close it after demonstrating its lifecycle. In this single-batch system, publishing can target the wider roster; do this in the dedicated demo project.

**Expected result:** changing an answer moves the count rather than counting the same person twice. Closed items do not accept ordinary new responses.

**Say:** “Attendance and opinions use explicit replies, not the generic form-completion switch.”

## 5 Explain the two competition confirmations

**Roles and screen:** Student, Opportunities → Competitions; then the permitted competition manager. **Allow 4 minutes.**

1. Show **Demo Product Innovation Sprint** with two pending confirmations. Open a sample external or internal form to demonstrate the link.
2. Confirm external registration, then confirm the internal form. Explain why there are two separate facts to record.
3. Use **Demo Social Impact Challenge** to show a partially completed response: external confirmed, internal pending. Complete the internal confirmation.
4. Show **Demo National Strategy Challenge**, which starts fully confirmed. Use the available reopening or correction controls with a reason where required.
5. In the manager view, inspect individual confirmations and reports. Show the competition draft, Edit, Publish and Cancel as appropriate for its state.

**Expected result:** partial confirmation is distinguishable from completed registration. The app records individual self-attestation; it does not independently verify the external website.

**Say:** “We track the external registration and the internal batch form separately, so one cannot hide the other.”

Legacy team and round code is not the current product. Do not present a team-registration workflow that the interface does not support.

## 6 Connect internships to placement eligibility

**Roles and screens:** Student, Opportunities → Internships; then CR, Placement status; optionally Placed Student. **Allow 4 minutes.**

1. On **DemoCorp**, choose **I registered**. On **Sample Analytics**, choose **Not participating**. Show that these are separate responses per opportunity.
2. In the CR session, open **Placement status** and find **24M2905**, the fictional placed student. Explain that these eligibility records are private.
3. Demonstrate changing this sample identity from Placed to Seeking with an explicit reason. Its archived registration is restored for a published internship.
4. Sign in as that student if useful and show the restored eligible response. Return the sample student to Placed to demonstrate archiving and removal from ordinary active internship assignments.
5. Show the internship draft and the cancelled historical record. Use administrator or CR management controls to edit, publish or cancel only sample opportunities.

**Expected result:** changing placement eligibility affects the student's internship responses while the private placement details remain behind the authorised management API.

**Say:** “A registered response and a student's eligibility are different records. Eligibility changes should not erase the history.”

## 7 Coordinate work on the CR Board

**Role and screen:** CR, CR Board. **Allow 3 minutes.**

1. Show the three states with **Demo confirm guest speaker logistics**, **Demo compile batch feedback** and **Demo share the orientation notes**.
2. Open an active task's editor. Update its notes or deadline and save.
3. Move an assigned task to In progress, then Completed. Show the resulting board and activity information.
4. Optionally create one fictional CR task to show the editor from a blank state.

**Expected result:** CR Board writes require the CR role. A System admin flag by itself is not the same permission; use the CR session to demonstrate edits.

**Say:** “This board coordinates the representatives' own work. It is separate from what the entire student batch owes.”

## 8 Assign and revoke responsibility

**Role and screen:** CR or System admin, POC setup. **Allow 3 minutes.**

1. Choose the subject POC category and find **DEMO-FIN-A**. Show the first seat assigned to **24M2902** and the second seat assigned to **24M2904**.
2. Revoke the second sample seat. Show that Wing A POC access remains, while the removed subject permission is a separate grant.
3. Assign the second seat back to **24M2904**. Reopen that user's session if needed to show the profile update.
4. Explain Wing, Subject and specialised batch responsibilities using the available categories. Use DEMO subjects and the six test identities for edits.

**Expected result:** permissions follow the exact grant. Do not reassign live wing or batch owners in a shared project just to demonstrate a button.

**Say:** “A role names the responsibility. Its scope names the exact group or subject the person may manage.”

## 9 Finish the story with reports

**Roles and screens:** CR, Task compliance and Reports; then Wing A POC for scoped reports. **Allow 4 minutes.**

1. In CR Task compliance, select **Demo directory audit**. It has **114 recipients**: four sign-in identities in Wing A and 110 report-only sample profiles.
2. Point out that only 100 responses are loaded initially. Complete totals and CSV export are withheld while another page remains.
3. Choose **Load more students**. Confirm that all 114 have loaded and the export becomes available.
4. Compare Non-responders, Completed, Exempt and other status filters as offered. Show the wing breakdown and export a CSV.
5. In Reports, demonstrate competition and internship results and wing filtering. In the Wing A POC session, use the scoped Task compliance or report screen rather than claiming CR-wide access.
6. Refer to the student's earlier completion and show how the relevant form's report reflects it.

**Expected result:** percentages and exported rows are based on the complete loaded audience and chosen filter, not just the first visible page.

**Say:** “A useful dashboard must explain who is missing, and its totals must stay honest when the list spans more than one page.”

## 10 Show administration and delivery

**Roles and screens:** System admin, then Student App setup and inbox. **Allow 5 minutes.**

1. Return to Presentation workspace. Show the manifest, generated time, relative reminder time, account list, ten-step checklist and password reset action. Do not display copied passwords on the projector.
2. Expand **Batch configuration** and **Add subject offering**. Explain catalogue ownership. Use an isolated term and fictional offering if you choose to save changes.
3. Show the roster template and the **Validate roster** action. Explain that committing an existing roll number resets its password; do not commit a real roster during the demo.
4. Open Timetable setup. The injected **DEMO-TERM** and six slots already provide sample records. To demonstrate import, use the supplied timetable example or enter a few rows under a **new term ID**, confirm dates and save. Saving replaces the selected term's timetable, so avoid replacing the term used by earlier demonstration records.
5. Show scheduler and push health. These are real operational signals, not seeded success claims.
6. Open the student's inbox. Find the sample reminder if maintenance has processed it. On an enabled real device, demonstrate closed-app push and clicking back to the correct view. If push is not configured or supported, state that limitation and use the authoritative inbox.
7. Explain installation, notification consent, sign-out cleanup and the public offline fallback. Authenticated dashboards and edits require connectivity.
8. End with **Remove sample data**, then show the System admin status. Remove only after the audience has seen the reports.

**Expected result:** the final segment connects application actions to Vercel, Firebase and the Cloudflare wake-up schedule. Do not promise an exact notification arrival time or an offline private dashboard.

## Cover the remaining lifecycle controls in a longer demo

| Feature | Additional actions to show | Keep the explanation accurate |
| --- | --- | --- |
| Wing forms | Preview recipients, edit, sync audience, exempt where allowed, close and cancel | Published type and audience are not arbitrary editable fields |
| Academic dates | Add, edit and cancel a DEMO event | Informational dates use their own change-notification workflow |
| Sessions | Draft edit, publish, change attendance, manager correction, close, cancel and report | Response deadline and session start are different times |
| Polls | Draft edit, publish, answer, change option, close, cancel and report | Edits are restricted by lifecycle state |
| Competitions | Draft, edit, publish, two confirmations, reopening, correction and cancellation | Current flow uses individual confirmations |
| Internships | Draft, edit, publish, register, decline, cancel and eligibility transition | Private placement data is not a public response field |
| CR tasks | Create, edit, assign, start and complete | Use a CR account for writes |
| Governance | Assign, replace, revoke and inspect subject seats | Demonstrate only on DEMO offerings and protected identities |
| Reports | Current-item selection, filters, next page and CSV | Refresh after new responses; do not treat partial data as complete |
| System admin | Initialise catalogues, validate and commit a disposable roster, timetable replacement | Perform live mutations only in the dedicated demo environment |
| Device setup | Install, enable or disable push, sign out and offline fallback | Real provider and operating-system behaviour requires a real device |

## Import example

Use **DEMO-IMPORT-REHEARSAL** as the new term ID, set suitable start and end dates and confirm these fictional rows before saving:

| Code | Subject | Section | Weekday | Start | End | Room |
| --- | --- | --- | --- | --- | --- | --- |
| DEM101 | Demo Decision Analysis | A | Monday | 09:00 | 10:00 | Demo 101 |
| DEM102 | Demo Market Research | A | Tuesday | 11:00 | 12:00 | Demo 102 |
| DEM101 | Demo Decision Analysis | B | Wednesday | 10:00 | 11:00 | Demo 103 |

Correct a room or time and re-import the **same rehearsal term** to demonstrate replacement. Reordering rows should not duplicate classes. Do not switch the demonstration's main term just to show this importer.

## Reset and cleanup boundaries

- **Prepare 15-minute demo** refreshes the injected records and their example states, including relative dates. Existing demo passwords are preserved.
- **Reset demo passwords** creates replacement passwords and refreshes the injected scenarios. Copy them before leaving the page.
- **Remove sample data** deletes the tagged seed records, report-only profiles and linked seed delivery records. It preserves the six login accounts, unrelated users and their grants. Existing batch settings are not replaced by injection.
- New records you create separately through ordinary feature editors have their own IDs and lifecycle. Close, cancel or otherwise manage those using their normal controls; do not assume sample cleanup deletes arbitrary work.
- The TEST catalogue used by protected login setup and the basic catalogue created if missing may remain after sample removal. No real scheduler success, push subscription or VAPID key is fabricated.
- If preparation fails, its operation is recorded as failed. Run injection again. If an ID is occupied by unrelated data, the injector refuses to overwrite it.

## Short version for a time-limited presentation

For ten minutes, use Student Today, one Wing POC publication, one student completion, the two competition confirmations, a CR report with pagination and finally System admin health. Keep Academics, placement, polls, sessions, CR Board, governance and import controls as clearly named follow-up sections rather than rushing through unexplained screens.
