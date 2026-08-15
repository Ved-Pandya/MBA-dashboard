import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import type { TaskTarget, TaskType, UserProfile } from "@mba/domain";
import { authEmailToRollNumber, canManageTask, ROLL_NUMBER_PATTERN } from "@mba/domain";
import { db, FieldValue } from "./firebase.js";

export interface Actor extends UserProfile {
  uid: string;
}

const bootstrapRollNumbers = () =>
  (process.env.BOOTSTRAP_ADMIN_ROLL_NUMBERS ?? "")
    .split(",")
    .map((rollNumber) => rollNumber.trim().toUpperCase())
    .filter(Boolean);

export function isBootstrapRollNumber(rollNumber: string) {
  const normalized = rollNumber.trim().toUpperCase();
  return ROLL_NUMBER_PATTERN.test(normalized) && bootstrapRollNumbers().includes(normalized);
}

export async function requireActor(request: CallableRequest<unknown>, allowBootstrap = false): Promise<Actor> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in is required");
  const snap = await db.doc(`users/${request.auth.uid}`).get();
  if (snap.exists) {
    const profile = snap.data() as UserProfile;
    if (profile.status !== "active" && !(allowBootstrap && profile.roles.systemAdmin)) {
      throw new HttpsError("permission-denied", "Your account is not active");
    }
    return { uid: request.auth.uid, ...profile };
  }

  const authEmail = String(request.auth.token.email ?? "").toLowerCase();
  const rollNumber = authEmailToRollNumber(authEmail);
  if (allowBootstrap && isBootstrapRollNumber(rollNumber)) {
    return {
      uid: request.auth.uid,
      authEmail,
      displayName: String(request.auth.token.name ?? "Bootstrap administrator"),
      rollNumber,
      status: "active",
      sectionId: "A",
      wingId: "A",
      roles: { student: true, cr: false, systemAdmin: true },
      scopes: { crSections: {}, wingPocWings: {}, subjectPocOfferings: {} },
    };
  }
  throw new HttpsError("permission-denied", "This roll number is not on the imported roster");
}

export function requireAdmin(actor: Actor) {
  if (!actor.roles.systemAdmin) throw new HttpsError("permission-denied", "System administrator access required");
}

export function requireTaskManager(actor: Actor, taskType: TaskType, target: TaskTarget) {
  const decision = canManageTask(actor, taskType, target, "update");
  if (!decision.allowed) throw new HttpsError("permission-denied", decision.reason ?? "Task is outside your scope");
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpsError("invalid-argument", `${name} is required`);
  return value.trim();
}

export async function writeAudit(input: {
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}) {
  await db.collection("auditEvents").add({ ...input, createdAt: FieldValue.serverTimestamp() });
}

export function asHttpsError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  const message = error instanceof Error ? error.message : "Unexpected server error";
  throw new HttpsError("internal", message);
}

export const callableOptions = {
  region: "asia-south1" as const,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true" && process.env.FUNCTIONS_EMULATOR !== "true",
  consumeAppCheckToken: false,
};
