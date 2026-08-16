export const TASK_TYPES = [
  "subject_assignment",
  "pre_read",
  "case_competition",
  "administrative_form",
] as const;

export const WING_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
export const ACADEMIC_EVENT_TYPES = ["assignment_deadline", "quiz", "midterm", "endterm", "pre_read"] as const;
export const OPPORTUNITY_RESPONSE_STATUSES = ["no_response", "team_draft", "registered", "not_participating"] as const;
export const CR_TASK_STATUSES = ["assigned", "in_progress", "completed"] as const;
export const POC_KINDS = ["wing", "subject", "grooming", "case_competition"] as const;
export const SESSION_RESPONSE_STATUSES = ["no_response", "attending", "not_attending"] as const;
export const COMPETITION_CONFIRMATION_KINDS = ["externalRegistration", "internalForm"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = "draft" | "publishing" | "published" | "closed" | "cancelled";
export type AssignmentStatus = "pending" | "completed" | "exempt";
export type UserStatus = "invited" | "active" | "suspended";
export type SectionId = "A" | "B";
export type WingId = (typeof WING_IDS)[number];
export type AcademicEventType = (typeof ACADEMIC_EVENT_TYPES)[number];
export type OpportunityResponseStatus = (typeof OPPORTUNITY_RESPONSE_STATUSES)[number];
export type CrTaskStatus = (typeof CR_TASK_STATUSES)[number];
export type PocKind = (typeof POC_KINDS)[number];
export type SessionResponseStatus = (typeof SESSION_RESPONSE_STATUSES)[number];
export type CompetitionConfirmationKind = (typeof COMPETITION_CONFIRMATION_KINDS)[number];
export type CompetitionStatus = "draft" | "published" | "registration_closed" | "in_progress" | "completed" | "cancelled";
export type CompetitionTeamStatus = "draft" | "registered" | "withdrawn" | "disqualified";
export type CompetitionRoundStatus = "draft" | "open" | "finalized" | "cancelled";
export type RoundEntryStatus = "pending" | "submitted" | "advanced" | "eliminated" | "waived";

export interface RoleMap {
  student: true;
  cr: boolean;
  systemAdmin: boolean;
}

export interface RoleScopes {
  crSections: Record<string, true>;
  wingPocWings: Record<string, true>;
  subjectPocOfferings: Record<string, true>;
  batchPocRoles: {
    grooming?: true;
    caseCompetition?: true;
  };
}

export interface UserProfile {
  authEmail: string;
  displayName: string;
  rollNumber: string;
  status: UserStatus;
  sectionId: SectionId;
  wingId: WingId;
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

export interface TimetableRow {
  subjectCode: string;
  subjectName: string;
  sectionId: SectionId;
  weekday: number;
  startTime: string;
  endTime: string;
  room?: string;
}

export interface AcademicEventDraft {
  offeringId: string;
  eventType: AcademicEventType;
  title: string;
  details: string;
  occursAtIso: string;
  resourceUrl?: string;
  timetableSlotId?: string;
  endsAtIso?: string;
  venue?: string;
  syllabus?: string;
}

export interface CompetitionDraft {
  title: string;
  organizer: string;
  description: string;
  externalRegistrationUrl: string;
  internalFormUrl: string;
  registrationDeadlineIso: string;
  minTeamSize: number;
  maxTeamSize: number;
}

export interface InternshipDraft {
  company: string;
  role: string;
  description: string;
  registrationUrl?: string;
  registrationDeadlineIso: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}

export type TaskAction = "read" | "create" | "update" | "publish" | "close" | "cancel" | "exempt";
