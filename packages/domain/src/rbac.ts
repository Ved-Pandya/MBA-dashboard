import type { AuthorizationDecision, TaskAction, TaskTarget, TaskType, UserProfile } from "./types.js";

export function isSubjectTask(type: TaskType): boolean {
  return type === "subject_assignment" || type === "pre_read";
}

export function canManageTask(
  actor: UserProfile,
  taskType: TaskType,
  target: TaskTarget,
  _action: Exclude<TaskAction, "read">,
): AuthorizationDecision {
  if (actor.status !== "active") return { allowed: false, reason: "Account is not active" };
  if (actor.roles.systemAdmin) return { allowed: true };

  if (isSubjectTask(taskType)) {
    if (target.kind !== "subject_offering" || !target.subjectOfferingId) {
      return { allowed: false, reason: "Academic tasks require a subject offering" };
    }
    return actor.scopes.subjectPocOfferings[target.subjectOfferingId]
      ? { allowed: true }
      : { allowed: false, reason: "Subject offering is outside this POC's scope" };
  }

  if (target.kind !== "wing" || !target.wingId) {
    return { allowed: false, reason: "Case competitions and forms require a wing" };
  }
  return actor.scopes.wingPocWings[target.wingId]
    ? { allowed: true }
    : { allowed: false, reason: "Wing is outside this POC's scope" };
}

export function canReadAssignment(actor: UserProfile, actorUid: string, assignment: { uid: string; scopeKey: string }): boolean {
  if (actor.status !== "active") return false;
  if (actor.roles.systemAdmin || actor.roles.cr || actorUid === assignment.uid) return true;
  const [kind, id] = assignment.scopeKey.split(":");
  if (!id) return false;
  return kind === "wing"
    ? Boolean(actor.scopes.wingPocWings[id])
    : Boolean(actor.scopes.subjectPocOfferings[id]);
}

export function canMutateCrBoard(actor: UserProfile): boolean {
  return actor.status === "active" && actor.roles.cr === true;
}
