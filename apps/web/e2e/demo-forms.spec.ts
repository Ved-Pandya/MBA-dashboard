import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
let links: string[] = [];
test.beforeAll(async () => {
  const { DEMO_ACCOUNTS } = await import("@mba/domain");
  const { buildDemoFixtures } = await import("../../../functions/src/demo-fixtures");
  const plan = buildDemoFixtures(DEMO_ACCOUNTS.map(account => ({ ...account, uid: `forms_${account.key}` })), "forms_admin", "http://127.0.0.1:3100", Date.now());
  links = plan.records.flatMap(record => ["resourceUrl", "externalRegistrationUrl", "internalFormUrl", "registrationUrl"].flatMap(key => typeof record.data[key] === "string" ? [record.data[key] as string] : []));
});

test("every seeded resource and its legacy link opens relevant content", async ({ page }) => {
  test.setTimeout(90_000);
  expect(links).toHaveLength(30);
  expect(new Set(links.map(link => new URL(link).searchParams.get("kind"))).size).toBe(30);
  for (const link of links) {
    const url = new URL(link);
    await page.goto(url.pathname + url.search);
    await expect(page.locator("#description")).not.toHaveText("Loading the sample resource…");
    await expect(page.locator("#title")).toHaveText(url.searchParams.get("title")!);
    expect(await page.locator("[id]").evaluateAll(nodes => new Set(nodes.map(node => node.id)).size === nodes.length)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    url.searchParams.delete("kind"); url.searchParams.delete("status");
    await page.goto(url.pathname + url.search);
    await expect(page.locator("#title")).not.toHaveText("Demo resource unavailable");
    await expect(page.locator("#description")).not.toHaveText("Loading the sample resource…");
  }
});

test("placement form validates relevant fields and keeps submission on the page", async ({ page }, info) => {
  const writes: string[] = [];
  page.on("request", request => { if (request.method() !== "GET") writes.push(request.url()); });
  await page.goto("/demo/sample-form.html?kind=demo_wing_form");
  await page.getByRole("button", { name: "Simulate submission" }).click();
  await expect(page.locator("#result")).toBeHidden();
  await page.getByLabel("Fictional name").fill("Demo Student");
  await page.getByLabel("Demo roll number").fill("24M2901");
  await page.getByLabel("Preferred function").selectOption("Consulting");
  await page.getByLabel("Preferred work location").selectOption("Mumbai");
  await page.getByLabel("Previous work experience").selectOption("Fresher");
  await page.getByLabel("Relevant skills").fill("Fictional market research");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Simulate submission" }).click();
  await expect(page.locator("#result")).toContainText("No information was sent or saved");
  await expect(page.locator("#result")).toContainText("Consulting");
  await expect(page.locator("#result")).toBeFocused();
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  mkdirSync(resolve("../../.test-runtime/demo-forms"), { recursive: true });
  await page.screenshot({ path: resolve(`../../.test-runtime/demo-forms/placement-${info.project.name}.png`), fullPage: true });
  await page.reload();
  await expect(page.getByLabel("Fictional name")).toHaveValue("");
  await expect(page.locator("#result")).toBeHidden();
});

test("library, competition, internship and academic resources have distinct fields", async ({ page }, info) => {
  await page.goto("/demo/sample-form.html?title=Demo%20overdue%20library%20access%20form");
  await expect(page.getByLabel("Database requested")).toBeVisible();
  await expect(page.getByLabel("Preferred function")).toHaveCount(0);
  mkdirSync(resolve("../../.test-runtime/demo-forms"), { recursive: true });
  await page.screenshot({ path: resolve(`../../.test-runtime/demo-forms/library-${info.project.name}.png`), fullPage: true });
  await page.goto("/demo/sample-form.html?kind=demo_case_partial_external");
  await expect(page.getByLabel("Social problem and proposed intervention")).toBeVisible();
  await expect(page.getByLabel("Institution")).toBeVisible();
  await page.goto("/demo/sample-form.html?kind=demo_case_partial_internal");
  await expect(page.getByLabel("Fictional organiser registration reference")).toBeVisible();
  await expect(page.getByLabel("Institution")).toHaveCount(0);
  await expect(page.locator("#next-step")).toContainText("Confirm internal");
  await page.screenshot({ path: resolve(`../../.test-runtime/demo-forms/confirmation-${info.project.name}.png`), fullPage: true });
  await page.goto("/demo/sample-form.html?kind=demo_internship_analytics");
  await expect(page.getByLabel("Describe a fictional data analysis project")).toBeVisible();
  await expect(page.locator("#description")).toContainText("Business Analyst Intern");
  await page.goto("/demo/sample-form.html?kind=demo_preread_fin");
  await expect(page.locator("#brief")).toContainText("Present value");
  await expect(page.locator("form")).toBeHidden();
  await page.goto("/demo/sample-form.html?kind=demo_endterm_fin");
  await expect(page.locator("#brief")).toContainText("calculator");
  await expect(page.getByRole("link", { name: "Return to workspace" })).toHaveAttribute("href", "/?view=academics");
  await page.screenshot({ path: resolve(`../../.test-runtime/demo-forms/exam-${info.project.name}.png`), fullPage: true });
});

test("closed, cancelled, draft and unknown resources have honest states", async ({ page }) => {
  for (const kind of ["demo_closed_form", "demo_cancelled_form", "demo_internship_cancelled"]) {
    await page.goto(`/demo/sample-form.html?kind=${kind}`);
    await expect(page.locator("#availability")).toContainText("Submissions are unavailable");
    await expect(page.locator("button[type=submit]")).toBeDisabled();
    await expect(page.locator("#acknowledgement")).toBeDisabled();
  }
  await page.goto("/demo/sample-form.html?kind=demo_draft_form");
  await expect(page.locator("#availability")).toContainText("Draft preview");
  await expect(page.locator("button[type=submit]")).toBeEnabled();
  await page.goto("/demo/sample-form.html?kind=demo_draft_form&status=published");
  await expect(page.locator("#availability")).toBeHidden();
  await page.goto("/demo/sample-form.html?kind=__proto__&title=Unknown");
  await expect(page.locator("#title")).toHaveText("Demo resource unavailable");
  await expect(page.locator("form")).toBeHidden();
  const title = '<img src=x onerror="window.injected=true">';
  await page.goto(`/demo/sample-form.html?kind=demo_wing_form&title=${encodeURIComponent(title)}`);
  await expect(page.locator("#title")).toHaveText(title);
  await expect(page.locator("#title img")).toHaveCount(0);
});
