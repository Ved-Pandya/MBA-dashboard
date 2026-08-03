import { z } from "zod";
import { TASK_TYPES } from "./types.js";
import { ROLL_NUMBER_PATTERN } from "./credentials.js";

const wingIdSchema = z.string().regex(/^W(0[1-9]|10)$/, "Wing must be W01 through W10");

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
