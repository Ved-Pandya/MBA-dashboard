import { describe, expect, it } from "vitest";
import { buildReminderSchedule, canManageTask, rollNumberToAuthEmail, rosterRowSchema, taskDraftSchema, type UserProfile } from "./index.js";

const actor: UserProfile = {
  authEmail: "24m2001@users.deadlineos.app",
  displayName: "POC",
  rollNumber: "1",
  status: "active",
  sectionId: "A",
  wingId: "W01",
  roles: { student: true, cr: false, systemAdmin: false },
  scopes: { crSections: {}, wingPocWings: { W01: true }, subjectPocOfferings: { "FIN-A": true } },
};

describe("domain invariants", () => {
  it("rejects cross-category targeting", () => {
    const result = taskDraftSchema.safeParse({
      title: "Finance case",
      description: "Read and submit",
      taskType: "subject_assignment",
      target: { kind: "wing", scopeKey: "wing:W01", wingId: "W01" },
      dueAtIso: "2027-01-01T12:00:00+05:30",
    });
    expect(result.success).toBe(false);
  });

  it("permits only exact POC scopes", () => {
    expect(canManageTask(actor, "administrative_form", { kind: "wing", scopeKey: "wing:W01", wingId: "W01" }, "create").allowed).toBe(true);
    expect(canManageTask(actor, "administrative_form", { kind: "wing", scopeKey: "wing:W02", wingId: "W02" }, "create").allowed).toBe(false);
  });

  it("builds the locked alert ladder", () => {
    const jobs = buildReminderSchedule(new Date("2027-01-03T00:00:00Z"), new Date("2027-01-01T00:00:00Z"));
    expect(jobs.map((job) => job.stage)).toEqual(["minus24h", "minus2h", "overdue15m"]);
  });

  it("maps roll numbers to internal Auth identities without exposing an email login", () => {
    expect(rollNumberToAuthEmail("  24m2001 ")).toBe("24m2001@users.deadlineos.app");
    expect(rosterRowSchema.safeParse({
      password: "StrongPass123!", displayName: "Aarav Shah", rollNumber: "24M2001",
      sectionId: "A", wingId: "W01", cr: false, wingPocWings: [], subjectPocOfferings: [],
    }).success).toBe(true);
  });
});
