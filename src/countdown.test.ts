import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { createRoot as createRootType } from "solid-js";
import type {
  CountdownControls,
  CountdownOptions,
  createCountdown as createCountdownType,
} from "./countdown.js";

/*
 * Each test gets a fresh engine module (vi.resetModules): the shared clock
 * keeps module-level rAF state, and a test that fails before stopping its
 * countdown would otherwise poison every later test in the file.
 */
let createRoot: typeof createRootType;
let createCountdown: typeof createCountdownType;
let rafCb: (() => void) | null = null;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    rafCb = fn;
    return 1;
  });
  ({ createRoot } = await import("solid-js"));
  ({ createCountdown } = await import("./countdown.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  rafCb = null;
});

const advance = (ms: number): void => {
  vi.advanceTimersByTime(ms);
  const fn = rafCb;
  rafCb = null;
  fn?.();
};

const owned = (
  target: Date | number | (() => Date | number),
  options?: CountdownOptions,
): { cd: CountdownControls; dispose: () => void } => {
  let cd!: CountdownControls;
  const dispose = createRoot((d) => {
    cd = createCountdown(target, options);
    return d;
  });
  return { cd, dispose };
};

describe("createCountdown", () => {
  it("counts down and splits into parts", () => {
    // 1 day, 1 hour, 1 minute, 5 seconds.
    const { cd, dispose } = owned(Date.now() + 90_065_000);
    expect(cd.days()).toBe(1);
    expect(cd.hours()).toBe(1);
    expect(cd.minutes()).toBe(1);
    expect(cd.seconds()).toBe(5);
    expect(cd.done()).toBe(false);
    expect(cd.running()).toBe(true);
    advance(1000);
    expect(cd.seconds()).toBe(4);
    cd.stop();
    advance(0); // flush the engine
    dispose();
  });

  it("finishes at zero and fires onDone once", () => {
    const onDone = vi.fn();
    const { cd, dispose } = owned(Date.now() + 2500, { onDone });
    advance(1000);
    expect(cd.done()).toBe(false);
    advance(1000);
    expect(cd.done()).toBe(false);
    advance(1000);
    expect(cd.remaining()).toBe(0);
    expect(cd.done()).toBe(true);
    expect(cd.running()).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    advance(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(cd.remaining()).toBe(0);
    dispose();
  });

  it("is done immediately for a past target", () => {
    const onDone = vi.fn();
    const { cd, dispose } = owned(Date.now() - 1000, { onDone });
    expect(cd.done()).toBe(true);
    expect(cd.remaining()).toBe(0);
    expect(cd.running()).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("stop halts updates; start resumes against the same target", () => {
    const { cd, dispose } = owned(Date.now() + 10_000, { autoStart: false });
    expect(cd.running()).toBe(false);
    cd.start();
    expect(cd.running()).toBe(true);
    advance(3000);
    expect(cd.remaining()).toBe(7000);
    cd.stop();
    expect(cd.running()).toBe(false);
    advance(3000);
    expect(cd.remaining()).toBe(7000); // no recompute while stopped
    cd.start();
    advance(1000);
    // Wall-clock target: 3000ms of stopped time still elapsed.
    expect(cd.remaining()).toBe(3000);
    cd.stop();
    advance(0); // flush the engine
    dispose();
  });

  it("reset recomputes from now", () => {
    const { cd, dispose } = owned(Date.now() + 10_000);
    advance(4000);
    expect(cd.remaining()).toBe(6000);
    cd.reset();
    expect(cd.remaining()).toBe(6000);
    expect(cd.done()).toBe(false);
    cd.stop();
    advance(0); // flush the engine
    dispose();
  });

  it("follows a reactive target", () => {
    let target = Date.now() + 20_000;
    const { cd, dispose } = owned(() => target, { interval: 500 });
    advance(1000);
    expect(cd.remaining()).toBe(19_000);
    target = Date.now() + 60_000;
    advance(1000);
    expect(cd.remaining()).toBe(59_000);
    cd.stop();
    advance(0); // flush the engine
    dispose();
  });
});
