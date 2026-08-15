import { z } from "zod";
import { ACADEMIC_EVENT_TYPES, OPPORTUNITY_RESPONSE_STATUSES, TASK_TYPES, WING_IDS } from "./types.js";
import { ROLL_NUMBER_PATTERN } from "./credentials.js";

export const wingIdSchema = z.enum(WING_IDS);

export const taskTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("subject_offering"),
    scopeKey: z.string().startsWith("subject:"),
    subjectOfferingId: z.string().min(1),
    sectionId: z.enum(["A", "B"]),
  }),
  z.object({
    kind: z.literal("wing"),
    scopeKey: z.string().startsWith("wing:"),
    wingId: wingIdSchema,
  }),
]);

export const taskDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(1).max(8_000),
    taskType: z.enum(TASK_TYPES),
    target: taskTargetSchema,
    dueAtIso: z.string().datetime({ offset: true }),
    resourceUrl: z.string().url().max(2_048).optional().or(z.literal("")),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .superRefine((value, ctx) => {
    const subjectType = value.taskType === "subject_assignment" || value.taskType === "pre_read";
    if (subjectType !== (value.target.kind === "subject_offering")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message: subjectType ? "Academic tasks require a subject offering" : "Wing tasks require a wing",
      });
    }
  });

export const rosterRowSchema = z.object({
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(100),
  rollNumber: z.string().trim().toUpperCase().regex(ROLL_NUMBER_PATTERN, "Roll number must match 24M2xxx"),
  sectionId: z.enum(["A", "B"]),
  wingId: wingIdSchema,
  cr: z.boolean().default(false),
  wingPocWings: z.array(wingIdSchema).default([]),
  subjectPocOfferings: z.array(z.string().min(1)).default([]),
});

export const completionSchema = z.object({
  taskId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const exemptionSchema = z.object({
  taskId: z.string().min(1),
  uid: z.string().min(1),
  reason: z.string().trim().min(5).max(500),
});

const optionalUrl = z.string().trim().url().max(2_048).optional().or(z.literal(""));
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm time");

export const timetableRowSchema = z.object({
  subjectCode: z.string().trim().min(2).max(30),
  subjectName: z.string().trim().min(2).max(120),
  sectionId: z.enum(["A", "B"]),
  weekday: z.number().int().min(1).max(7),
  startTime: timeSchema,
  endTime: timeSchema,
  room: z.string().trim().max(80).optional().default(""),
}).refine((row) => row.endTime > row.startTime, { message: "End time must be after start time", path: ["endTime"] });

export const timetableImportSchema = z.object({
  termId: z.string().trim().min(1).max(40),
  termStartIso: z.string().date(),
  termEndIso: z.string().date(),
  rows: z.array(timetableRowSchema).min(1).max(500),
}).refine((value) => value.termEndIso >= value.termStartIso, { message: "Term end must not precede term start", path: ["termEndIso"] });

export const academicEventSchema = z.object({
  offeringId: z.string().trim().min(1).max(80),
  eventType: z.enum(ACADEMIC_EVENT_TYPES),
  title: z.string().trim().min(2).max(160),
  details: z.string().trim().max(8_000).default(""),
  occursAtIso: z.string().datetime({ offset: true }),
  resourceUrl: optionalUrl,
  timetableSlotId: z.string().trim().max(100).optional().or(z.literal("")),
});

export const competitionDraftSchema = z.object({
  title: z.string().trim().min(3).max(160),
  organizer: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(8_000),
  registrationUrl: optionalUrl,
  registrationDeadlineIso: z.string().datetime({ offset: true }),
  minTeamSize: z.number().int().min(1).max(20),
  maxTeamSize: z.number().int().min(1).max(20),
}).refine((value) => value.maxTeamSize >= value.minTeamSize, { message: "Maximum team size must be at least the minimum", path: ["maxTeamSize"] });

export const teamDraftSchema = z.object({
  competitionId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  memberRollNumbers: z.array(z.string().trim().toUpperCase().regex(ROLL_NUMBER_PATTERN)).min(1).max(20),
}).refine((value) => new Set(value.memberRollNumbers).size === value.memberRollNumbers.length, { message: "Team members must be unique", path: ["memberRollNumbers"] });

export const opportunityResponseSchema = z.object({
  opportunityId: z.string().min(1),
  status: z.enum(OPPORTUNITY_RESPONSE_STATUSES).refine((status) => status === "not_participating", "Only not-participating can be set directly"),
});

export const competitionRoundSchema = z.object({
  competitionId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  instructions: z.string().trim().max(8_000).default(""),
  submissionDeadlineIso: z.string().datetime({ offset: true }),
  resourceUrl: optionalUrl,
  eligibleTeamIds: z.array(z.string().min(1)).min(1).max(500),
});

export const internshipDraftSchema = z.object({
  company: z.string().trim().min(2).max(140),
  role: z.string().trim().min(2).max(140),
  description: z.string().trim().min(1).max(8_000),
  registrationUrl: optionalUrl,
  registrationDeadlineIso: z.string().datetime({ offset: true }),
});

export const internshipResponseSchema = z.object({
  internshipId: z.string().min(1),
  status: z.enum(["registered", "not_participating"]),
  confirmationReference: z.string().trim().max(300).optional().default(""),
});
