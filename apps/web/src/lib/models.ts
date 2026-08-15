import type { AssignmentStatus, CrTaskStatus, TaskType, UserProfile } from "@mba/domain";
import type { Timestamp } from "firebase/firestore";

export interface AssignmentRecord {
  id: string;
  taskId: string;
  uid: string;
  taskType: TaskType;
  scopeKey: string;
  sectionId: string;
  wingId: string;
  subjectOfferingId?: string | null;
  status: AssignmentStatus;
  completedAt?: Timestamp;
  completedLate?: boolean;
  exemptionReason?: string;
  taskSnapshot: {
    title: string;
    dueAt: Timestamp;
    resourceUrl?: string | null;
    taskStatus: "published" | "closed" | "cancelled";
  };
  studentSnapshot: { displayName: string; rollNumber: string };
}

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  taskId?: string;
  createdAt?: Timestamp;
  readAt?: Timestamp | null;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  taskType: TaskType;
  status: string;
  target: { kind: string; scopeKey: string; subjectOfferingId?: string; sectionId?: "A" | "B"; wingId?: string };
  dueAt: Timestamp;
  resourceUrl?: string;
  ownerUid: string;
}

export interface CrTaskRecord {
  id: string;
  title: string;
  notes: string;
  status: CrTaskStatus;
  dueAt: Timestamp | null;
  createdBy: string;
  updatedBy: string;
  completedBy?: string;
  creatorSnapshot?: { displayName: string; rollNumber: string };
  version: number;
  scheduleVersion: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface AcademicEventRecord {
  id: string;
  offeringId: string;
  sectionId: "A" | "B";
  eventType: "assignment_deadline" | "quiz" | "midterm" | "pre_read";
  title: string;
  details: string;
  occursAt: Timestamp;
  resourceUrl?: string | null;
  status: "published" | "cancelled";
}

export interface CompetitionRecord {
  id: string;
  title: string;
  organizer: string;
  description: string;
  registrationUrl?: string | null;
  registrationDeadline: Timestamp;
  minTeamSize: number;
  maxTeamSize: number;
  status: string;
}

export interface InternshipRecord {
  id: string;
  title: string;
  company: string;
  role: string;
  description: string;
  registrationUrl?: string | null;
  registrationDeadline: Timestamp;
  status: string;
}

export interface CompetitionTeamRecord {
  id: string;
  competitionId: string;
  name: string;
  captainUid: string;
  memberUids: string[];
  members: Array<{ uid: string; displayName: string; rollNumber: string; wingId: string; sectionId: string }>;
  status: "draft" | "registered" | "withdrawn" | "disqualified";
  registeredLate?: boolean;
}

export type Profile = UserProfile;
