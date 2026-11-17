import { test, expect, type Page } from "@playwright/test";
import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Browser tests require emulators");
const app = getApps().find((item) => item.name === "browser-tests") ?? initializeApp({ projectId: "demo-deadlineos" }, "browser-tests");
const db = getFirestore(app), auth = getAuth(app);
const password = "Demo-browser-123!";
let prefix = "", baseRoll = 2300;
const account = (role: string) => `${prefix}_${role}`;
const rolls = { student: 1, wing: 2, cr: 3, admin: 4 };
async function login(page: Page, role: keyof typeof rolls) {
  await page.goto("/");
  await page.getByLabel("Roll number").fill(`26M${baseRoll + rolls[role]}`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}

test.beforeAll(async ({}, info) => {
  prefix = `browser_${info.project.name}`;
  baseRoll = info.project.name === "mobile" ? 2400 : 2300;
  for (const role of Object.keys(rolls) as Array<keyof typeof rolls>) {
    const rollNumber = `26M${baseRoll + rolls[role]}`, email = `${rollNumber.toLowerCase()}@users.deadlineos.app`, uid = account(role);
    try { await auth.getUser(uid); await auth.updateUser(uid, { password }); }
    catch { await auth.createUser({ uid, email, password, emailVerified: true }); }
    await db.doc(`users/${uid}`).set({ authEmail: email, displayName: `Demo ${role}`, rollNumber, status: "active", sectionId: "A", wingId: "A", roles: { student: true, cr: role === "cr", systemAdmin: role === "admin" }, scopes: { crSections: {}, wingPocWings: role === "wing" ? { A: true } : {}, subjectPocOfferings: {}, batchPocRoles: {} } });
  }
  await db.doc("wings/A").set({ active: true });
  const dueAt = Timestamp.fromMillis(Date.now() + 86_400_000);
  for (const [id, taskStatus] of [["open", "published"], ["closed", "closed"], ["cancelled", "cancelled"]]) {
    const taskId = `${prefix}_${id}`;
    await db.doc(`tasks/${taskId}`).set({ title: `Demo ${id} form`, status: taskStatus, dueAt, taskType: "administrative_form", description: "A synthetic demo task", target: { kind: "wing", wingId: "A", scopeKey: "wing:A" }, ownerUid: account("wing"), version: 1, audienceVersion: 1, scheduleVersion: 1 });
    await db.doc(`taskAssignments/${taskId}_${account("student")}`).set({ taskId, uid: account("student"), taskType: "administrative_form", scopeKey: "wing:A", wingId: "A", sectionId: "A", status: "pending", taskSnapshot: { title: `Demo ${id} form`, dueAt, taskStatus }, studentSnapshot: { displayName: "Demo student", rollNumber: `26M${baseRoll + 1}` } });
    await db.doc(`taskStats/${taskId}`).set({ eligibleCount: 1, pendingCount: 1, completedCount: 0, exemptCount: 0 });
  }
  for (let i = 0; i < 30; i++) await db.doc(`users/${account("student")}/notifications/demo_${i}`).set({ title: `Demo notification ${i}`, body: "Synthetic reminder for the project walkthrough.", createdAt: Timestamp.fromMillis(Date.now() - i * 1000), readAt: null });
  const internshipId = `${prefix}_internship`;
  await db.doc(`internships/${internshipId}`).set({ title: "Demo company - Analyst", company: "Demo company", role: "Analyst", description: "A synthetic opportunity", status: "published", registrationDeadline: dueAt, registrationUrl: "https://example.com/internship", version: 1, scheduleVersion: 1 });
  await db.doc(`internshipResponses/${internshipId}_${account("student")}`).set({ internshipId, uid: account("student"), status: "no_response", wingId: "A", sectionId: "A", studentSnapshot: { displayName: "Demo student", rollNumber: `26M${baseRoll + 1}` } });
  await db.doc(`internshipResponses/${prefix}_legacy`).set({ internshipId: "legacy", uid: account("student"), status: "not_applicable_placed", wingId: "A" });
  const writer = db.bulkWriter();
  for (let i = 0; i < 114; i++) writer.set(db.doc(`taskAssignments/${prefix}_open_demo_${String(i).padStart(3, "0")}`), { taskId: `${prefix}_open`, uid: `demo_${i}`, taskType: "administrative_form", scopeKey: "wing:A", wingId: "A", sectionId: "A", status: "pending", taskSnapshot: { title: "Demo open form", dueAt, taskStatus: "published" }, studentSnapshot: { displayName: `Demo student ${i}`, rollNumber: `26M2${String(i).padStart(3, "0")}` } });
  await writer.close();
  // Representative, explicitly synthetic content for desktop/mobile visual checks.
  const examples = [
    { id: "directory", title: "Student directory confirmation", hours: -2 },
    { id: "preferences", title: "Placement preference form", hours: 6 },
    { id: "library", title: "Library database access request", hours: 42 },
  ];
  for (const example of examples) {
    const taskId = `ui_demo_${example.id}`, dueAt = Timestamp.fromMillis(Date.now() + example.hours * 3_600_000);
    await db.doc(`tasks/${taskId}`).set({ title: example.title, description: "Synthetic project demonstration", status: "published", taskType: "administrative_form", target: { kind: "wing", wingId: "A", scopeKey: "wing:A" }, dueAt, ownerUid: account("wing"), version: 1, audienceVersion: 1, scheduleVersion: 1 });
    await db.doc(`taskAssignments/${taskId}_${account("student")}`).set({ taskId, uid: account("student"), taskType: "administrative_form", scopeKey: "wing:A", wingId: "A", sectionId: "A", status: "pending", taskSnapshot: { title: example.title, dueAt, taskStatus: "published" }, studentSnapshot: { displayName: "Demo student", rollNumber: `26M${baseRoll + 1}` } });
    const assignments = await db.collection("taskAssignments").where("taskId", "==", taskId).get();
    await db.doc(`taskStats/${taskId}`).set({ eligibleCount: assignments.size, pendingCount: assignments.size, completedCount: 0, exemptCount: 0 });
  }
  for (const [index, title] of ["Operations case brief", "Marketing pre-read", "Finance midterm"].entries()) {
    await db.doc(`academicEvents/ui_demo_${index}`).set({ offeringId: "DEMO-A", sectionId: "A", title, eventType: index === 2 ? "midterm" : index === 1 ? "pre_read" : "assignment_deadline", status: "published", occursAt: Timestamp.fromMillis(Date.now() + (index + 1) * 86_400_000) });
  }
  await db.doc("competitions/ui_demo_case").set({ title: "National Strategy Challenge", organizer: "Campus Consulting Club", description: "A synthetic case competition for demonstrating the registration workflow.", status: "published", registrationDeadline: Timestamp.fromMillis(Date.now() + 48 * 3_600_000), externalRegistrationUrl: "https://example.com/registration", internalFormUrl: "https://example.com/batch-form", minTeamSize: 1, maxTeamSize: 1, version: 1, scheduleVersion: 1 });
  await db.doc(`opportunityResponses/ui_demo_case_${account("student")}`).set({ opportunityId: "ui_demo_case", uid: account("student"), wingId: "A", sectionId: "A", status: "no_response", externalRegistration: { status: "pending" }, internalForm: { status: "pending" } });
  await db.doc("generalPolls/ui_demo_meeting").set({ question: "When should we hold the batch meeting?", details: "Choose the slot that works for you.", status: "published", options: [{ id: "after", label: "After class" }, { id: "evening", label: "Evening" }], closesAt: Timestamp.fromMillis(Date.now() + 5 * 3_600_000) });
  await db.doc(`pollResponses/ui_demo_meeting_${account("student")}`).set({ pollId: "ui_demo_meeting", uid: account("student"), status: "no_response" });
  await db.doc(`taskStats/${prefix}_open`).set({ eligibleCount: 115, pendingCount: 115, completedCount: 0, exemptCount: 0 });
});

test.afterAll(async () => { await db.terminate(); await deleteApp(app); });

test("sign-in makes password visibility and account recovery clear", async ({ page }, info) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-password");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("Password", { exact: true }).fill("");
  await page.screenshot({ path: resolve(`../../docs/screenshots/login-${info.project.name}.png`), fullPage: true });
});

test("navigation keeps the browser Back button useful", async ({ page }, info) => {
  await login(page, "student");
  const nav = info.project.name === "mobile" ? page.locator(".mobile-nav") : page.locator(".sidebar");
  await nav.getByRole("button", { name: "Academics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Academics", exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "Opportunities", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Opportunities", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Academics", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/view=academics/);
});

test("student lifecycle, internship access, clock refresh and accessible inbox", async ({ page }, info) => {
  expect((await page.request.post("/api/call/activateMyAccount", { data: { data: {} } })).status()).toBe(401);
  const pollId = `${prefix}_clock`;
  const pollQuestion = `${prefix} clock boundary poll`;
  await db.doc(`generalPolls/${pollId}`).set({ question: pollQuestion, details: "A temporary demo poll", options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], status: "published", closesAt: Timestamp.fromMillis(Date.now() + 60_000) });
  await db.doc(`pollResponses/${pollId}_${account("student")}`).set({ pollId, uid: account("student"), status: "no_response" });
  await page.clock.install();
  await login(page, "student");
  await expect(page.getByRole("heading", { name: "Demo open form", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo closed form", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "All activity", exact: true }).click();
  const closed = page.locator(".task-row").filter({ hasText: "Demo closed form" });
  await expect(closed.getByRole("button")).toBeDisabled();
  await page.getByRole("textbox", { name: "Find a deadline" }).fill("Demo closed");
  await expect(page.locator(".task-row")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Find a deadline" }).fill("");
  await page.getByRole("button", { name: "To do", exact: true }).click();
  await expect(page.getByRole("heading", { name: pollQuestion, exact: true })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Notifications", exact: true });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Notifications", exact: true });
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await drawer.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByText("Demo notification 29", { exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.clock.fastForward(90_000);
  await expect(page.getByRole("heading", { name: pollQuestion, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  mkdirSync(resolve("../../docs/screenshots"), { recursive: true });
  await page.evaluate(() => { window.scrollTo(0, 0); (document.activeElement as HTMLElement)?.blur(); });
  await page.screenshot({ path: resolve(`../../docs/screenshots/home-${info.project.name}.png`), fullPage: true });
  await page.goto("/?view=opportunities");
  await page.getByRole("button", { name: "Internships", exact: true }).click();
  const internship = page.locator(".opportunity-card").filter({ hasText: "Demo company" }).filter({ has: page.getByRole("button", { name: "I registered", exact: true }) }).first();
  await expect(internship.getByRole("button", { name: "I registered", exact: true })).toBeVisible();
  await internship.getByRole("button", { name: "I registered", exact: true }).click();
  await expect(internship.getByText("My status: registered", { exact: true })).toBeVisible();
});

test("quest progress follows saved work and focus sprints can pause and reset", async ({ page }) => {
  await page.clock.install();
  await login(page, "student");
  const progress = page.getByRole("region", { name: "Your quest progress" });
  await expect(progress.getByText("0 XP", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Find a deadline" }).fill("no matching title");
  await page.getByRole("button", { name: "Pick my next task", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Find a deadline" })).toHaveValue("");
  await expect(page.locator(".task-row .check").first()).toBeFocused();
  await page.getByRole("button", { name: "Mark complete: Demo open form", exact: true }).click();
  await expect(progress.getByText("25 XP", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "One more win!" })).toBeVisible();
  await page.getByRole("button", { name: "See my wins", exact: true }).click();
  await page.getByRole("button", { name: "Reopen Demo open form", exact: true }).click();
  await expect(progress.getByText("0 XP", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "To do", exact: true }).click();
  const timer = page.getByRole("timer", { name: "Time remaining" });
  await page.getByRole("button", { name: "Start focus sprint", exact: true }).click();
  await page.clock.fastForward(30_000);
  await expect(timer).toHaveText("14:30");
  await page.getByRole("button", { name: "Pause focus sprint", exact: true }).click();
  await page.clock.fastForward(10_000);
  await expect(timer).toHaveText("14:30");
  await page.getByRole("button", { name: "Reset focus sprint", exact: true }).click();
  await expect(timer).toHaveText("15:00");
  await page.getByRole("button", { name: "Start focus sprint", exact: true }).click();
  await page.clock.fastForward(900_000);
  await expect(timer).toHaveText("00:00");
  await expect(page.getByText("Sprint complete. Take a breather. You earned it.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("wing POC publishes, edits, syncs and closes a form", async ({ page }, info) => {
  await login(page, "wing");
  await page.goto("/?view=forms");
  await expect(page.getByRole("heading", { name: "Wing forms", exact: true })).toBeVisible();
  await expect(page.locator(".managed-task").first()).toBeVisible();
  await page.screenshot({ path: resolve(`../../docs/screenshots/wing-forms-${info.project.name}.png`) });
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New wing form", exact: true }).click();
  const title = `Browser published form ${prefix}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Instructions", { exact: true }).fill("Complete this synthetic demo form.");
  const due = new Date(Date.now() + 3_600_000 + 330 * 60_000).toISOString().slice(0, 16);
  await page.getByLabel("Deadline", { exact: false }).fill(due);
  await page.screenshot({ path: resolve(`../../docs/screenshots/wing-editor-${info.project.name}.png`) });
  await page.getByRole("button", { name: "Preview audience", exact: true }).click();
  await expect(page.locator(".recipient-preview")).toBeVisible();
  await page.getByRole("button", { name: "Publish task", exact: true }).click();
  const card = page.locator(".managed-task").filter({ hasText: title });
  await expect(card.getByText("published", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(`${title} revised`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(card.getByRole("heading", { name: `${title} revised`, exact: true })).toBeVisible();
  await card.locator("summary").click();
  await card.getByRole("button", { name: "Sync audience", exact: true }).click();
  await expect(card.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await expect(card.getByText("closed", { exact: true })).toBeVisible();
});

test("admin edits and cancels internships and preserves a failed competition form", async ({ page }, info) => {
  await login(page, "admin"); await page.goto("/?view=opportunities");
  await page.getByRole("button", { name: "Internships", exact: true }).click();
  await page.getByRole("button", { name: "New internship", exact: true }).click();
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Create internship", exact: true }) });
  const company = `Browser company ${prefix}`;
  await form.getByLabel("Company", { exact: true }).fill(company);
  await form.getByLabel("Role", { exact: true }).fill("Analyst");
  await form.getByLabel("Details", { exact: true }).fill("Synthetic internship details");
  await form.getByLabel("Deadline", { exact: false }).fill("2027-01-01T10:00");
  await form.getByRole("button", { name: "Create draft", exact: true }).click();
  const card = page.locator(".opportunity-card").filter({ hasText: company });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.locator("form").filter({ has: page.getByRole("heading", { name: "Edit internship", exact: true }) });
  await edit.getByLabel("Role", { exact: true }).fill("Senior analyst");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(card.getByRole("heading")).toContainText("Senior analyst");
  page.once("dialog", (dialog) => dialog.accept("Synthetic cancellation"));
  await card.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card.getByText("cancelled", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.scrollTo(0, 0); (document.activeElement as HTMLElement)?.blur(); });
  await page.screenshot({ path: resolve(`../../docs/screenshots/opportunities-${info.project.name}.png`) });
  await page.route("**/api/call/createCompetition", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic save failure" } }) }));
  await page.getByRole("button", { name: "Competitions", exact: true }).click();
  await page.getByRole("button", { name: "New competition", exact: true }).click();
  const competition = page.locator("form").filter({ has: page.getByRole("heading", { name: "Create competition", exact: true }) });
  await competition.getByLabel("Title", { exact: true }).fill("Preserve this competition");
  await competition.getByLabel("Organizer", { exact: true }).fill("Demo organizer");
  await competition.getByLabel("Details", { exact: true }).fill("Keep these details on failure");
  await competition.getByLabel("Deadline", { exact: false }).fill("2027-01-01T10:00");
  await competition.getByLabel("External registration link").fill("https://example.com/external");
  await competition.getByLabel("Internal Google Form link").fill("https://example.com/internal");
  await competition.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByText("Synthetic save failure", { exact: true })).toBeVisible();
  await expect(competition.getByLabel("Title", { exact: true })).toHaveValue("Preserve this competition");
});

test("CR loads all response pages before exporting exact totals", async ({ page }, info) => {
  await login(page, "cr");
  // Dev Strict Mode starts two initial loads. Hold the first response until
  // the representative has selected a report, reproducing a slow-network race.
  let firstLoad = true;
  let releaseStale: (() => Promise<void>) | undefined;
  await page.route("**/api/call/getCurrentTaskCompliance", async (route) => {
    if (firstLoad) {
      firstLoad = false;
      releaseStale = () => route.fulfill({ json: { data: { items: [{ key: "deadline:stale", id: "stale", kind: "deadline", title: "Stale initial report", dueAtIso: "2027-01-01T00:00:00Z", scopeLabel: "Wing A" }], rows: [], generatedAtIso: "2026-11-15T00:00:00Z", selectedItemKey: "deadline:stale", nextCursor: null, nextCatalogCursors: {} } } });
      return;
    }
    await route.continue();
  });
  await page.goto("/?view=compliance");
  await expect(page.getByRole("heading", { name: "Current task compliance", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Current task", exact: true }).selectOption(`deadline:${prefix}_open`);
  await expect(page.getByRole("button", { name: "Load more students", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export filtered CSV", exact: true })).toBeDisabled();
  expect(releaseStale).toBeDefined();
  const staleResponse = page.waitForResponse(async (response) => response.url().endsWith("/api/call/getCurrentTaskCompliance") && (await response.json()).data?.selectedItemKey === "deadline:stale");
  await releaseStale!();
  await staleResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("combobox", { name: "Current task", exact: true })).toHaveValue(`deadline:${prefix}_open`);
  await page.getByRole("button", { name: "Load more students", exact: true }).click();
  await expect(page.getByRole("button", { name: "Load more students", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Wing breakdown", exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export filtered CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("current-task-compliance.csv");
  await page.screenshot({ path: resolve(`../../docs/screenshots/compliance-${info.project.name}.png`) });
});
