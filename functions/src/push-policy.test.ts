import { describe, expect, it } from "vitest";
import {
  boundedPushOptions,
  callableMayCreateNotifications,
  IMMEDIATE_PUSH_CONCURRENCY,
  IMMEDIATE_PUSH_JOB_LIMIT,
} from "./push-policy.js";

describe("immediate push policy", () => {
  it("covers a 114-student broadcast plus manager recipients in one bounded flush", () => {
    expect(IMMEDIATE_PUSH_JOB_LIMIT).toBe(150);
    expect(IMMEDIATE_PUSH_JOB_LIMIT).toBeGreaterThanOrEqual(114);
    expect(IMMEDIATE_PUSH_CONCURRENCY).toBe(8);
  });

  it("flushes notification-producing mutations but not read or high-volume response calls", () => {
    for (const name of [
      "publishTask",
      "publishCompetition",
      "publishInternship",
      "publishSessionIntimation",
      "publishGeneralPoll",
      "createAcademicEvent",
      "createCrTask",
    ]) {
      expect(callableMayCreateNotifications(name), name).toBe(true);
    }

    for (const name of [
      "getComplianceExport",
      "getCompetitionExport",
      "getSessionReport",
      "setSessionResponse",
      "setPollResponse",
      "setInternshipResponse",
      "markNotificationsRead",
    ]) {
      expect(callableMayCreateNotifications(name), name).toBe(false);
    }
  });

  it("keeps runtime overrides inside safe bounds", () => {
    expect(boundedPushOptions({ limit: 10_000, concurrency: 100 })).toEqual({ limit: 250, concurrency: 10 });
    expect(boundedPushOptions({ limit: 0, concurrency: 0 })).toEqual({ limit: 1, concurrency: 1 });
    expect(boundedPushOptions()).toEqual({ limit: 25, concurrency: 1 });
  });
});
