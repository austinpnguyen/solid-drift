import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import {
  pauseAll,
  resumeAll,
  isPaused,
  setGlobalTimeScale,
  globalTimeScale,
} from "./global.js";
import { now } from "./engine.js";

let fakeTime = 0;
let nextRafId = 1;
const pending = new Map<number, (t: number) => void>();

function frames(n: number, step = 16.7) {
  for (let i = 0; i < n; i++) {
    fakeTime += step;
    const cbs = [...pending.values()];
    pending.clear();
    cbs.forEach((cb) => cb(fakeTime));
  }
}

beforeAll(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    const id = nextRafId++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("document", {
    get hidden() {
      return false;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("window", {});
});

describe("global controls", () => {
  afterEach(() => {
    resumeAll();
    setGlobalTimeScale(1);
    pending.clear();
  });

  it("pauseAll freezes the clock, resumeAll continues seamlessly", () => {
    const t0 = now();
    frames(10);
    const t1 = now();
    expect(t1).toBeGreaterThan(t0);

    pauseAll();
    expect(isPaused()).toBe(true);
    const frozen = now();
    frames(10);
    expect(now()).toBe(frozen);

    resumeAll();
    expect(isPaused()).toBe(false);
    frames(10);
    expect(now()).toBeGreaterThan(frozen);
  });

  it("pauseAll is idempotent", () => {
    pauseAll();
    const frozen = now();
    pauseAll();
    frames(5);
    expect(now()).toBe(frozen);
    resumeAll();
  });

  it("resumeAll without pause is a no-op", () => {
    expect(() => resumeAll()).not.toThrow();
    expect(isPaused()).toBe(false);
  });

  it("setGlobalTimeScale changes the scale", () => {
    expect(globalTimeScale()).toBe(1);
    setGlobalTimeScale(0.5);
    expect(globalTimeScale()).toBe(0.5);
    setGlobalTimeScale(1);
    expect(globalTimeScale()).toBe(1);
  });

  it("setGlobalTimeScale rejects negative and non-finite", () => {
    setGlobalTimeScale(0.5);
    setGlobalTimeScale(-1);
    expect(globalTimeScale()).toBe(0.5);
    setGlobalTimeScale(NaN);
    expect(globalTimeScale()).toBe(0.5);
    setGlobalTimeScale(Infinity);
    expect(globalTimeScale()).toBe(0.5);
    setGlobalTimeScale(1);
  });

  it("timeScale 0.5 makes duration effectively double", async () => {
    const { animate } = await import("./animate.js");
    setGlobalTimeScale(0.5);
    let lastValue = 0;
    const c = animate(0, 100, {
      duration: 100,
      onUpdate: (v) => {
        lastValue = v;
      },
    });
    // 100ms at 0.5x scale needs 200ms of real time.
    frames(6); // 100ms real
    expect(lastValue).toBeLessThan(100);
    frames(6); // 200ms real total
    expect(lastValue).toBe(100);
    await c.finished;
    setGlobalTimeScale(1);
  });
});
