import { expect, it } from "vitest";
import { academicDateKey, calendarMonthDays, shiftCalendarDay, shiftCalendarMonth } from "./academic-calendar";

it("places events on their IST date across the UTC midnight boundary", () => {
  expect(academicDateKey(new Date("2026-11-19T18:29:59Z"))).toBe("2026-11-19");
  expect(academicDateKey(new Date("2026-11-19T18:30:00Z"))).toBe("2026-11-20");
});

it("builds complete Monday-first weeks with adjacent month dates", () => {
  const days = calendarMonthDays("2026-11");
  expect(days).toHaveLength(42);
  expect(days[0]).toBe("2026-10-26");
  expect(days.at(-1)).toBe("2026-12-06");
  expect(new Set(days).size).toBe(days.length);
  expect(days.filter(day => day.startsWith("2026-11"))).toHaveLength(30);
});

it("includes leap day and supports a four-week February", () => {
  expect(calendarMonthDays("2024-02")).toContain("2024-02-29");
  expect(calendarMonthDays("2027-02")).toHaveLength(28);
});

it("clamps month navigation and crosses year boundaries", () => {
  expect(shiftCalendarMonth("2026-01-31", 1)).toBe("2026-02-28");
  expect(shiftCalendarMonth("2024-03-31", -1)).toBe("2024-02-29");
  expect(shiftCalendarMonth("2026-12-19", 1)).toBe("2027-01-19");
  expect(shiftCalendarDay("2026-12-31", 1)).toBe("2027-01-01");
});
