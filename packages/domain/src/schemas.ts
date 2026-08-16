import { z } from "zod";
import { ACADEMIC_EVENT_TYPES, COMPETITION_CONFIRMATION_KINDS, CR_TASK_STATUSES, OPPORTUNITY_RESPONSE_STATUSES, SESSION_RESPONSE_STATUSES, TASK_TYPES, WING_IDS } from "./types.js";
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

const optionalCrDueAt = z.string().datetime({ offset: true }).optional().or(z.literal(""));

export const crTaskCreateSchema = z.object({
  title: z.string().trim().min(3).max(140),
  notes: z.string().trim().max(8_000).optional().default(""),
  dueAtIso: optionalCrDueAt,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, "Invalid idempotency key"),
});

export const crTaskUpdateSchema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/, "Invalid CR task ID"),
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(3).max(140).optional(),
  notes: z.string().trim().max(8_000).optional(),
  dueAtIso: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(CR_TASK_STATUSES).optional(),
}).refine((input) => input.title !== undefined || input.notes !== undefined || input.dueAtIso !== undefined || input.status !== undefined, {
  message: "At least one task change is required",
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

export const academicEventFieldsSchema = z.object({
  offeringId: z.string().trim().min(1).max(80),
  eventType: z.enum(ACADEMIC_EVENT_TYPES),
  title: z.string().trim().min(2).max(160),
  details: z.string().trim().max(8_000).default(""),
  occursAtIso: z.string().datetime({ offset: true }),
  resourceUrl: optionalUrl,
  timetableSlotId: z.string().trim().max(100).optional().or(z.literal("")),
  endsAtIso: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  venue: z.string().trim().max(160).optional().default(""),
  syllabus: z.string().trim().max(4_000).optional().default(""),
});
export const academicEventSchema = academicEventFieldsSchema.refine((event) => !event.endsAtIso || new Date(event.endsAtIso).getTime() > new Date(event.occursAtIso).getTime(), { message: "End time must be after the start time", path: ["endsAtIso"] });

export const competitionDraftSchema = z.object({
  title: z.string().trim().min(3).max(160),
  organizer: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(8_000),
  externalRegistrationUrl: z.string().trim().url().max(2_048),
  internalFormUrl: z.string().trim().url().max(2_048),
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

export const sessionIntimationFieldsSchema = z.object({
  title: z.string().trim().min(3).max(160),
  details: z.string().trim().max(8_000).default(""),
  venue: z.string().trim().max(160).optional().default(""),
  sessionStartsAtIso: z.string().datetime({ offset: true }),
  responseDeadlineIso: z.string().datetime({ offset: true }),
});
export const sessionIntimationSchema = sessionIntimationFieldsSchema.refine((value) => new Date(value.responseDeadlineIso).getTime() <= new Date(value.sessionStartsAtIso).getTime(), { message: "The response deadline must not be after the session starts", path: ["responseDeadlineIso"] });

export const sessionResponseSchema = z.object({
  sessionId: z.string().min(1).max(200),
  status: z.enum(SESSION_RESPONSE_STATUSES).refine((status) => status !== "no_response", "Choose attending or not attending"),
});

export const sessionCorrectionSchema = sessionResponseSchema.extend({
  uid: z.string().min(1).max(200),
  reason: z.string().trim().min(3).max(500),
});

export const pollDraftFieldsSchema = z.object({
  question: z.string().trim().min(3).max(300),
  details: z.string().trim().max(4_000).optional().default(""),
  options: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,60}$/), label: z.string().trim().min(1).max(200) })).min(2).max(20),
  closesAtIso: z.string().datetime({ offset: true }),
  linkedSessionId: z.string().trim().max(200).optional().or(z.literal("")),
});
export const pollDraftSchema = pollDraftFieldsSchema.refine((poll) => new Set(poll.options.map((option) => option.id)).size === poll.options.length, { message: "Poll option IDs must be unique", path: ["options"] });

export const pollResponseSchema = z.object({
  pollId: z.string().min(1).max(200),
  optionId: z.string().min(1).max(60),
});

export const competitionConfirmationSchema = z.object({
  competitionId: z.string().min(1).max(200),
  kind: z.enum(COMPETITION_CONFIRMATION_KINDS),
});

export const competitionConfirmationCorrectionSchema = competitionConfirmationSchema.extend({
  uid: z.string().min(1).max(200),
  status: z.enum(["pending", "confirmed"]),
  reason: z.string().trim().min(3).max(500),
});
