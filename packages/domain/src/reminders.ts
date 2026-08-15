export type ReminderStage = "minus24h" | "minus2h" | "overdue15m";

const STAGES: ReadonlyArray<{ stage: ReminderStage; offsetMinutes: number }> = [
  { stage: "minus24h", offsetMinutes: -1440 },
  { stage: "minus2h", offsetMinutes: -120 },
  { stage: "overdue15m", offsetMinutes: 15 },
];

export function buildReminderSchedule(dueAt: Date, now = new Date()) {
  return STAGES.map(({ stage, offsetMinutes }) => ({
    stage,
    fireAt: new Date(dueAt.getTime() + offsetMinutes * 60_000),
  })).filter(({ fireAt, stage }) => fireAt > now || stage === "overdue15m");
}

export function buildCatchUpReminderSchedule(dueAt: Date, now = new Date()) {
  const reminders = buildReminderSchedule(dueAt, now);
  if (dueAt > now && !reminders.some(({ stage }) => stage === "minus24h" || stage === "minus2h")) {
    reminders.unshift({ stage: "minus2h", fireAt: now });
  }
  return reminders;
}

export function notificationCopy(stage: ReminderStage, title: string) {
  switch (stage) {
    case "minus24h":
      return { title: "Due in 24 hours", body: `${title} is due tomorrow.` };
    case "minus2h":
      return { title: "Due in 2 hours", body: `${title} needs your attention now.` };
    case "overdue15m":
      return { title: "Deadline missed", body: `${title} is overdue. Mark it complete as soon as you submit.` };
  }
}
