import type { Timestamp } from "firebase/firestore";

export function asDate(value: Timestamp | Date | string) {
  if (typeof value === "string") return new Date(value);
  if (value instanceof Date) return value;
  return value.toDate();
}

export function formatDeadline(value: Timestamp | Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(asDate(value));
}

export function urgency(value: Timestamp | Date | string, status: string, now = Date.now()) {
  if (status !== "pending") return "done" as const;
  const minutes = (asDate(value).getTime() - now) / 60_000;
  if (minutes < 0) return "overdue" as const;
  if (minutes <= 24 * 60) return "urgent" as const;
  return "upcoming" as const;
}

export function relativeDeadline(value: Timestamp | Date | string, now = Date.now()) {
  const minutes = Math.round((asDate(value).getTime() - now) / 60_000);
  const abs = Math.abs(minutes);
  if (abs < 60) return minutes < 0 ? `${abs}m overdue` : `in ${abs}m`;
  const hours = Math.round(abs / 60);
  if (hours < 48) return minutes < 0 ? `${hours}h overdue` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return minutes < 0 ? `${days}d overdue` : `in ${days}d`;
}

export function indiaDayStart(now: number) {
  const offset = 330 * 60_000;
  return new Date(Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset);
}

export function isOpenAssignment(item: { status: string; taskSnapshot: { taskStatus: string } }) {
  return item.status === "pending" && item.taskSnapshot.taskStatus === "published";
}
