/**
 * Immediate delivery is deliberately bounded for the single-batch Spark deployment.
 * 150 covers the expected 114 students plus CR/POC recipients while leaving unusual
 * fan-out for the scheduled recovery worker.
 */
export const IMMEDIATE_PUSH_JOB_LIMIT = 150;
export const IMMEDIATE_PUSH_CONCURRENCY = 8;
export const SCHEDULED_PUSH_JOB_LIMIT = 25;

const notificationProducingCallables = new Set([
  "createTestAccounts",
  "seedTestData",
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
  "createTeam",
  "updateTeam",
  "reportTeamMembership",
  "deleteDraftTeam",
  "registerTeam",
  "createNextRound",
  "markRoundSubmitted",
  "correctRoundSubmission",
  "finalizeRound",
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
