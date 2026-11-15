import { describe, expect, it } from "vitest";
import { planTimetable } from "./timetable-plan.js";
import type { TimetableRow } from "@mba/domain";

const row: TimetableRow = { subjectCode: "FIN101", subjectName: "Finance", sectionId: "A", weekday: 1, startTime: "09:00", endTime: "10:00", room: "" };
describe("timetable identity", () => {
  it("preserves same-term POC identities and stays stable when rows are reordered", () => {
    const rows = [row, { ...row, weekday: 2 }];
    const prior = [{ id: "FIN-A", subjectCode: "FIN101", sectionId: "A" }];
    const a = planTimetable("TERM-1", rows, prior), b = planTimetable("TERM-1", [...rows].reverse(), prior);
    expect(a.offerings[0]!.id).toBe("FIN-A");
    expect(a.slots.map((item) => item.id).sort()).toEqual(b.slots.map((item) => item.id).sort());
  });
  it("does not collide across terms and rejects duplicate class positions", () => {
    expect(planTimetable("TERM-1", [row], []).offerings[0]!.id).not.toBe(planTimetable("TERM-2", [row], []).offerings[0]!.id);
    expect(() => planTimetable("TERM-1", [row, { ...row, room: "other" }], [])).toThrow("Duplicate class");
  });
});
