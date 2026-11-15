import { describe, expect, it } from "vitest";
import { indiaDayStart, isOpenAssignment, urgency } from "./date";

describe("deadline lifecycle and India day boundaries", () => {
  it("removes closed/cancelled pending work from active obligations", () => {
    for (const taskStatus of ["closed", "cancelled"]) expect(isOpenAssignment({ status: "pending", taskSnapshot: { taskStatus } })).toBe(false);
    expect(isOpenAssignment({ status: "pending", taskSnapshot: { taskStatus: "published" } })).toBe(true);
  });
  it("crosses the India midnight boundary independently of the host timezone", () => {
    expect(indiaDayStart(Date.parse("2026-11-15T18:29:59Z")).toISOString()).toBe("2026-11-14T18:30:00.000Z");
    expect(indiaDayStart(Date.parse("2026-11-15T18:30:00Z")).toISOString()).toBe("2026-11-15T18:30:00.000Z");
  });
  it("changes urgency when the clock crosses a deadline without new data", () => {
    const deadline = "2026-11-15T10:00:00Z";
    expect(urgency(deadline, "pending", Date.parse("2026-11-15T09:59:00Z"))).toBe("urgent");
    expect(urgency(deadline, "pending", Date.parse("2026-11-15T10:01:00Z"))).toBe("overdue");
  });
});
