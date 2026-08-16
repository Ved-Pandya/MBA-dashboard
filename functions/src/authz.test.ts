import { describe, expect, it } from "vitest";
import { canManageTask, canMutateCrBoard, type UserProfile } from "@mba/domain";

const wingPoc: UserProfile = {
  authEmail: "24m2001@users.deadlineos.app",
  displayName: "Wing POC",
  rollNumber: "24M2001",
  status: "active",
  sectionId: "A",
  wingId: "A",
  roles: { student: true, cr: false, systemAdmin: false },
  scopes: { crSections: {}, wingPocWings: { A: true }, subjectPocOfferings: {}, batchPocRoles: {} },
};

describe("RBAC contract", () => {
  it("blocks a Wing 1 POC from Wing 2", () => {
    const decision = canManageTask(wingPoc, "case_competition", { kind: "wing", scopeKey: "wing:B", wingId: "B" }, "create");
    expect(decision.allowed).toBe(false);
  });

  it("does not turn a CR into a task editor", () => {
    const cr = { ...wingPoc, roles: { student: true as const, cr: true, systemAdmin: false }, scopes: { ...wingPoc.scopes, wingPocWings: {} } };
    const decision = canManageTask(cr, "administrative_form", { kind: "wing", scopeKey: "wing:A", wingId: "A" }, "update");
    expect(decision.allowed).toBe(false);
  });

  it("allows active CRs but not admin-only users to mutate the private CR Board", () => {
    const cr = { ...wingPoc, roles: { student: true as const, cr: true, systemAdmin: false } };
    const admin = { ...wingPoc, roles: { student: true as const, cr: false, systemAdmin: true } };
    expect(canMutateCrBoard(cr)).toBe(true);
    expect(canMutateCrBoard(admin)).toBe(false);
    expect(canMutateCrBoard({ ...cr, status: "suspended" })).toBe(false);
  });
});
