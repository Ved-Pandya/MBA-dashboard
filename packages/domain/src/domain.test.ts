import { describe, expect, it } from "vitest";
import { academicEventSchema, buildCatchUpReminderSchedule, buildReminderSchedule, canManageTask, crTaskCreateSchema, crTaskUpdateSchema, isVapidPrivateKey, isVapidPublicKey, normalizeConfigValue, normalizeVapidKey, rollNumberToAuthEmail, rosterRowSchema, taskDraftSchema, teamDraftSchema, type UserProfile } from "./index.js";

const actor: UserProfile = {
  authEmail: "24m2001@users.deadlineos.app",
  displayName: "POC",
  rollNumber: "1",
  status: "active",
  sectionId: "A",
  wingId: "A",
  roles: { student: true, cr: false, systemAdmin: false },
  scopes: { crSections: {}, wingPocWings: { A: true }, subjectPocOfferings: { "FIN-A": true } },
};

describe("domain invariants", () => {
  it("rejects cross-category targeting", () => {
    const result = taskDraftSchema.safeParse({
      title: "Finance case",
      description: "Read and submit",
      taskType: "subject_assignment",
      target: { kind: "wing", scopeKey: "wing:A", wingId: "A" },
      dueAtIso: "2027-01-01T12:00:00+05:30",
    });
    expect(result.success).toBe(false);
  });

  it("permits only exact POC scopes", () => {
    expect(canManageTask(actor, "administrative_form", { kind: "wing", scopeKey: "wing:A", wingId: "A" }, "create").allowed).toBe(true);
    expect(canManageTask(actor, "administrative_form", { kind: "wing", scopeKey: "wing:B", wingId: "B" }, "create").allowed).toBe(false);
  });

  it("builds the locked alert ladder", () => {
    const jobs = buildReminderSchedule(new Date("2027-01-03T00:00:00Z"), new Date("2027-01-01T00:00:00Z"));
    expect(jobs.map((job) => job.stage)).toEqual(["minus24h", "minus2h", "overdue15m"]);
  });

  it("creates only the applicable catch-up reminder before a near CR deadline", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    const jobs = buildCatchUpReminderSchedule(new Date("2027-01-01T01:00:00Z"), now);
    expect(jobs.map((job) => job.stage)).toEqual(["minus2h", "overdue15m"]);
    expect(jobs[0]?.fireAt).toEqual(now);
  });

  it("maps roll numbers to internal Auth identities without exposing an email login", () => {
    expect(rollNumberToAuthEmail("  24m2001 ")).toBe("24m2001@users.deadlineos.app");
    expect(rosterRowSchema.safeParse({
      password: "StrongPass123!", displayName: "Aarav Shah", rollNumber: "24M2001",
      sectionId: "A", wingId: "A", cr: false, wingPocWings: [], subjectPocOfferings: [],
    }).success).toBe(true);
    expect(rosterRowSchema.safeParse({
      password: "StrongPass123!", displayName: "Legacy Wing", rollNumber: "24M2002",
      sectionId: "A", wingId: "W01", cr: false, wingPocWings: [], subjectPocOfferings: [],
    }).success).toBe(false);
  });

  it("validates team uniqueness and informational academic events", () => {
    expect(teamDraftSchema.safeParse({ competitionId: "comp-1", name: "North Stars", memberRollNumbers: ["24M2001", "24M2001"] }).success).toBe(false);
    expect(academicEventSchema.safeParse({ offeringId: "FIN-A", eventType: "pre_read", title: "Read Chapter 4", details: "", occursAtIso: "2027-01-01T09:00:00+05:30" }).success).toBe(true);
  });

  it("validates private CR task inputs and exact statuses", () => {
    expect(crTaskCreateSchema.safeParse({ title: "Coordinate venue", notes: "Confirm capacity", dueAtIso: "2027-01-01T09:00:00+05:30", idempotencyKey: "request_1234" }).success).toBe(true);
    expect(crTaskUpdateSchema.safeParse({ taskId: "task-1", expectedVersion: 1, status: "in_progress" }).success).toBe(true);
    expect(crTaskUpdateSchema.safeParse({ taskId: "task-1", expectedVersion: 1, status: "cancelled" }).success).toBe(false);
    expect(crTaskUpdateSchema.safeParse({ taskId: "task-1", expectedVersion: 1 }).success).toBe(false);
  });

  it("normalizes quoted and padded VAPID environment values", () => {
    const publicKey = `B${"A".repeat(86)}`;
    const privateKey = "A".repeat(43);
    expect(normalizeVapidKey(` \"${publicKey}=\" `)).toBe(publicKey);
    expect(normalizeVapidKey(` '${privateKey}=' `)).toBe(privateKey);
    expect(normalizeConfigValue(" 'mailto:admin@example.com' ")).toBe("mailto:admin@example.com");
    expect(isVapidPublicKey(publicKey)).toBe(true);
    expect(isVapidPrivateKey(privateKey)).toBe(true);
    expect(isVapidPublicKey(`${publicKey}=`)).toBe(false);
  });
});
