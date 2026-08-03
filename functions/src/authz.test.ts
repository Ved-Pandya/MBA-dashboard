import { describe, expect, it } from "vitest";
import { canManageTask, type UserProfile } from "@mba/domain";

const wingPoc: UserProfile = {
  authEmail: "24m2001@users.deadlineos.app",
  displayName: "Wing POC",
  rollNumber: "24M2001",
  status: "active",
  sectionId: "A",
  wingId: "W01",
  roles: { student: true, cr: false, systemAdmin: false },
  scopes: { crSections: {}, wingPocWings: { W01: true }, subjectPocOfferings: {} },
};

describe("RBAC contract", () => {
  it("blocks a Wing 1 POC from Wing 2", () => {
    const decision = canManageTask(wingPoc, "case_competition", { kind: "wing", scopeKey: "wing:W02", wingId: "W02" }, "create");
    expect(decision.allowed).toBe(false);
  });

  it("does not turn a CR into a task editor", () => {
    const cr = { ...wingPoc, roles: { student: true as const, cr: true, systemAdmin: false }, scopes: { ...wingPoc.scopes, wingPocWings: {} } };
    const decision = canManageTask(cr, "administrative_form", { kind: "wing", scopeKey: "wing:W01", wingId: "W01" }, "update");
    expect(decision.allowed).toBe(false);
  });
});
