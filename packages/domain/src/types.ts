export const TASK_TYPES = [
  "subject_assignment",
  "pre_read",
  "case_competition",
  "administrative_form",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = "draft" | "publishing" | "published" | "closed" | "cancelled";
export type AssignmentStatus = "pending" | "completed" | "exempt";
export type UserStatus = "invited" | "active" | "suspended";
export type SectionId = "A" | "B";

export interface RoleMap {
  student: true;
  cr: boolean;
  systemAdmin: boolean;
}

export interface RoleScopes {
  crSections: Record<string, true>;
  wingPocWings: Record<string, true>;
  subjectPocOfferings: Record<string, true>;
}

export interface UserProfile {
  authEmail: string;
  displayName: string;
  rollNumber: string;
  status: UserStatus;
  sectionId: SectionId;
  wingId: string;
  roles: RoleMap;
  scopes: RoleScopes;
}

export interface TaskTarget {
  kind: "subject_offering" | "wing";
  scopeKey: string;
  subjectOfferingId?: string;
  sectionId?: SectionId;
  wingId?: string;
}

export interface TaskDraft {
  title: string;
  description: string;
  taskType: TaskType;
  target: TaskTarget;
  dueAtIso: string;
  resourceUrl?: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}

export type TaskAction = "read" | "create" | "update" | "publish" | "close" | "cancel" | "exempt";
