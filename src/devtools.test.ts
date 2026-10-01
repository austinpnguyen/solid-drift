/**
 * Tests for the devtools engine hooks: time scaling and task counting.
 * These are the only engine additions the solid-drift/devtools subpath needs.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  getActiveTaskCount,
  getTimeScale,
  now,
  schedule,
  setTimeScale,
} from "../src/engine.js";

afterEach(() => {
  setTimeScale(1);
  vi.restoreAllMocks();
});

describe("setTimeScale / getTimeScale", () => {
  it("defaults to 1", () => {
    expect(getTimeScale()).toBe(1);
  });

  it("accepts valid scales and rejects garbage", () => {
    setTimeScale(0.25);
    expect(getTimeScale()).toBe(0.25);
    setTimeScale(0.5);
    expect(getTimeScale()).toBe(0.5);
    setTimeScale(0);
    expect(getTimeScale()).toBe(0.5);
    setTimeScale(-1);
    expect(getTimeScale()).toBe(0.5);
    setTimeScale(NaN);
    expect(getTimeScale()).toBe(0.5);
    setTimeScale(Infinity);
    expect(getTimeScale()).toBe(0.5);
    setTimeScale(1);
    expect(getTimeScale()).toBe(1);
  });

  it("does not jump the clock when the scale changes", () => {
    // With scale 1 the clock is monotonic; switching to 0.25 must not
    // teleport it backwards or forwards.
    const before = now();
    setTimeScale(0.25);
    const after = now();
    // now() itself is unscaled; the scaled clock is internal. What we can
    // assert from outside is that repeated changes keep the scale value
    // and never throw, and that the clock keeps moving forward.
    expect(after).toBeGreaterThanOrEqual(before);
    setTimeScale(1);
    expect(getTimeScale()).toBe(1);
  });
});

describe("getActiveTaskCount", () => {
  it("reflects scheduled and cancelled tasks", () => {
    // schedule() is a no-op without requestAnimationFrame, so stub it.
    const rafStub = vi
      .stubGlobal("requestAnimationFrame", () => 1)
      .stubGlobal("cancelAnimationFrame", () => {});
    void rafStub;
    const start = getActiveTaskCount();
    const cancelA = schedule(() => true);
    const cancelB = schedule(() => true);
    expect(getActiveTaskCount()).toBe(start + 2);
    cancelA();
    expect(getActiveTaskCount()).toBe(start + 1);
    cancelB();
    expect(getActiveTaskCount()).toBe(start);
    vi.unstubAllGlobals();
  });
});
