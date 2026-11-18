import { beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ currentUser: { uid: "one", getIdToken: vi.fn(async () => "token") } as { uid: string; getIdToken: () => Promise<string> } | null }));
vi.mock("./firebase", () => ({ getFirebase: () => ({ auth }) }));
import { readReport } from "./callable";

beforeEach(() => { vi.restoreAllMocks(); auth.currentUser = { uid: "one", getIdToken: async () => "token" }; });

it("coalesces concurrent reads but makes a fresh request after completion", async () => {
  let release!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const first = readReport("getWingOpportunityReport", { wingId: "A" });
  const second = readReport("getWingOpportunityReport", { wingId: "A" });
  expect(second).toBe(first);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  release(new Response(JSON.stringify({ data: { wingId: "A" } })));
  await expect(first).resolves.toEqual({ wingId: "A" });
  const fresh = readReport("getWingOpportunityReport", { wingId: "A" });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  release(new Response(JSON.stringify({ data: { wingId: "A" } })));
  await fresh;
});

it("never shares a pending report between signed-in users", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: {} })));
  vi.stubGlobal("fetch", fetch);
  const first = readReport("getCurrentTaskCompliance", {});
  auth.currentUser = { uid: "two", getIdToken: async () => "other-token" };
  const second = readReport("getCurrentTaskCompliance", {});
  expect(second).not.toBe(first);
  await Promise.all([first, second]);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("clears failed reads so retry can recover", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(new Response(JSON.stringify({ data: { rows: [] } })));
  vi.stubGlobal("fetch", fetch);
  await expect(readReport("getCurrentTaskCompliance", {})).rejects.toThrow("Offline");
  await expect(readReport("getCurrentTaskCompliance", {})).resolves.toEqual({ rows: [] });
});
