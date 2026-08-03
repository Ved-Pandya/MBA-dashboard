import type { AssignmentStatus, TaskType, UserProfile } from "@mba/domain";
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

export type Profile = UserProfile;
