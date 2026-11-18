import { expect, it } from "vitest";
import { FOCUS_SECONDS, focusReducer, initialFocusState } from "./focus-sprint";

it("uses 25 minutes and wall-clock time even when ticks are delayed", () => {
  const running = focusReducer(initialFocusState, { type: "toggle", now: 1000 });
  expect(running.remaining).toBe(1500);
  expect(focusReducer(running, { type: "tick", now: 31_000 }).remaining).toBe(1470);
});

it("charges once per departure, freezes away time and resumes on return", () => {
  const running = focusReducer(initialFocusState, { type: "toggle", now: 0 });
  const hidden = focusReducer(running, { type: "hidden", now: 30_000 });
  expect(hidden).toMatchObject({ remaining: 1530, endsAt: null, away: true, penalties: 1 });
  expect(focusReducer(hidden, { type: "hidden", now: 31_000 })).toBe(hidden);
  expect(focusReducer(hidden, { type: "tick", now: 600_000 })).toBe(hidden);
  const resumed = focusReducer(hidden, { type: "visible", now: 600_000 });
  expect(resumed.endsAt).toBe(2_130_000);
  expect(focusReducer(resumed, { type: "visible", now: 601_000 })).toBe(resumed);
  expect(focusReducer(resumed, { type: "hidden", now: 630_000 })).toMatchObject({ remaining: 1560, penalties: 2 });
});

it("never penalizes idle, paused or finished sprints, including a hidden deadline boundary", () => {
  expect(focusReducer(initialFocusState, { type: "hidden", now: 0 })).toBe(initialFocusState);
  const running = focusReducer(initialFocusState, { type: "toggle", now: 0 });
  const paused = focusReducer(running, { type: "toggle", now: 30_000 });
  expect(focusReducer(paused, { type: "hidden", now: 40_000 })).toBe(paused);
  const finished = focusReducer(running, { type: "hidden", now: FOCUS_SECONDS * 1000 });
  expect(finished).toMatchObject({ remaining: 0, endsAt: null, away: false, penalties: 0 });
  expect(focusReducer(finished, { type: "hidden", now: 2_000_000 })).toBe(finished);
});

it("reset and a new completed sprint clear penalties", () => {
  const penalized = { remaining: 0, endsAt: null, away: false, penalties: 3 };
  expect(focusReducer(penalized, { type: "toggle", now: 0 })).toMatchObject({ remaining: 1500, penalties: 0 });
  expect(focusReducer(penalized, { type: "reset", now: 0 })).toEqual(initialFocusState);
});
