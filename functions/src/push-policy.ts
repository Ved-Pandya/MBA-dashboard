/**
 * Immediate delivery is deliberately bounded for the single-batch Spark deployment.
 * 150 covers the expected 114 students plus CR/POC recipients while leaving unusual
 * fan-out for the scheduled recovery worker.
 */
export const IMMEDIATE_PUSH_JOB_LIMIT = 150;
export const IMMEDIATE_PUSH_CONCURRENCY = 10;
export const SCHEDULED_PUSH_JOB_LIMIT = 25;

function cleanPushText(value: unknown, fallback: string, maxLength: number) {
  const normalized = typeof value === "string"
    ? value
      .replace(/\b(?:24|26)M2\d{3}\b/gi, "a student")
      .replace(/[\u0000-\u001F\u007F]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    : "";
  return (normalized || fallback).slice(0, maxLength);
}

function notificationView(type: string) {
  if (type.includes("academic") || type.includes("pre_read")) return "academics";
  if (type.includes("cr_task")) return "crBoard";
  if (type.includes("session")) return "sessions";
  if (type.includes("poll")) return "polls";
  if (type.includes("team") || type.includes("round") || type.includes("membership")) return "opportunities";
  if (type.includes("competition") || type.includes("internship") || type.includes("opportunity")) return "opportunities";
  if (type.includes("poc")) return "poc";
  return "today";
}

export function buildPushPayload(input: { type: string; jobId: string; title?: unknown; body?: unknown }) {
  return {
    title: cleanPushText(input.title, "DeadlineOS update", 100),
    body: cleanPushText(input.body, "Open DeadlineOS to view the details.", 220),
    url: `/?view=${notificationView(input.type)}&notifications=1`,
    tag: input.jobId,
  };
}

const notificationProducingCallables = new Set([
  "createTestAccounts",
  "seedTestData",
  "prepareDemoData",
  "updateTask",
  "publishTask",
  "closeTask",
  "cancelTask",
  "assignPoc",
  "revokePoc",
  "createCrTask",
  "updateCrTask",
  "createAcademicEvent",
  "updateAcademicEvent",
  "cancelAcademicEvent",
  "updateSessionIntimation",
  "publishSessionIntimation",
  "cancelSessionIntimation",
  "publishGeneralPoll",
  "publishCompetition",
  "updateCompetition",
  "cancelCompetition",
  "publishInternship",
  "updateInternship",
  "cancelInternship",
]);

export function callableMayCreateNotifications(name: string) {
  return notificationProducingCallables.has(name);
}

export function boundedPushOptions(input: { limit?: number; concurrency?: number } = {}) {
  const limit = Math.min(250, Math.max(1, Math.trunc(input.limit ?? SCHEDULED_PUSH_JOB_LIMIT)));
  const concurrency = Math.min(10, Math.max(1, Math.trunc(input.concurrency ?? 1)));
  return { limit, concurrency };
}
