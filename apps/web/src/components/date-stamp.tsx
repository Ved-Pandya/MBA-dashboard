"use client";

import { useClock } from "@/lib/use-clock";

/** The live India date, shared by the day view and sign-in cover. */
export function DateStamp() {
  const now = useClock();
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "Asia/Kolkata" }).format(now);
  return <div className="date-stamp" aria-hidden="true"><span>{format({ month: "short" })}</span><strong>{format({ day: "2-digit" })}</strong><span>{format({ year: "numeric" })}</span></div>;
}
