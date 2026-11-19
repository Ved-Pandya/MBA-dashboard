const DAY = 86_400_000;

/** Academic calendar keys are wall dates in India, independent of device timezone. */
export function academicDateKey(value: number | Date) {
  return new Date(Number(value) + 330 * 60_000).toISOString().slice(0, 10);
}

export function shiftCalendarDay(value: string, days: number) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function shiftCalendarMonth(value: string, months: number) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

export function calendarMonthDays(month: string) {
  const first = `${month}-01`;
  const date = new Date(`${first}T00:00:00Z`);
  const leading = (date.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => shiftCalendarDay(first, index - leading));
}
