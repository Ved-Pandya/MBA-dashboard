import { describe, expect, it } from "vitest";
import { auditData } from "./audit-data.js";

describe("audit optional fields", () => {
  it("omits missing reasons and nested optional metadata without altering timestamps", () => {
    const timestamp = new Date();
    expect(auditData({ reason: undefined, after: { reference: undefined, title: "A" }, createdAt: timestamp })).toEqual({ after: { title: "A" }, createdAt: timestamp });
    expect((auditData({ createdAt: timestamp }) as { createdAt: Date }).createdAt).toBe(timestamp);
  });
});
