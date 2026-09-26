import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal, type Accessor } from "solid-js";
import { createTrail } from "./trail.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test. Otherwise a stale id would make schedule() skip
// queueing and the next test's animations would never run.
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];

function stubBrowser(opts: { reduced?: boolean } = {}) {
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });

  return {
    frames(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
      }
    },
  };
}

function setup(options: Parameters<typeof createTrail>[1] = {}) {
  let t!: Accessor<number>;
  let setS!: (n: number) => void;
  let s!: Accessor<number>;
  const dispose = createRoot((d) => {
    const [sig, _setS] = createSignal(0);
    s = sig;
    setS = _setS;
    t = createTrail(sig, options);
    return d;
  });
  return { t, s, setS, dispose };
}

describe("createTrail", () => {
  it("replays the source value after the delay", () => {
    const b = stubBrowser();
    const { t, setS, dispose } = setup({ delay: 100 });
    expect(t()).toBe(0);

    setS(100); // step at t = 0
    b.frames(3); // t = 50: the step has not arrived yet
    expect(t()).toBe(0);
    b.frames(4); // t = 117: past the 100ms delay
    expect(t()).toBe(100);
    dispose();
  });

  it("parks exactly on the latest value when the source rests", () => {
    const b = stubBrowser();
    const { t, setS, dispose } = setup({ delay: 60 });
    setS(10);
    setS(20);
    setS(30);
    b.frames(30);
    expect(t()).toBe(30);
    dispose();
  });

  it("follows a moving source with the delay intact", () => {
    const b = stubBrowser();
    const { t, s, setS, dispose } = setup({ delay: 50 });
    // Ramp the source up over several frames.
    for (let i = 1; i <= 6; i++) {
      setS(i * 10);
      b.frames(1);
    }
    // The trail lags behind the leading source value.
    expect(t()).toBeLessThan(s());
    b.frames(20);
    expect(t()).toBe(s());
    dispose();
  });

  it("returns the source itself when delay is 0", () => {
    stubBrowser();
    const { t, s, setS, dispose } = setup({ delay: 0 });
    expect(t).toBe(s);
    setS(2);
    expect(t()).toBe(2);
    dispose();
  });

  it("returns the source itself on the server", () => {
    // No window stubbed: SSR path.
    createRoot((dispose) => {
      const [s] = createSignal(7);
      expect(createTrail(s)).toBe(s);
      dispose();
    });
  });

  it("returns the source itself under reduced motion", () => {
    stubBrowser({ reduced: true });
    const { t, s, setS, dispose } = setup();
    expect(t).toBe(s);
    setS(5);
    expect(t()).toBe(5);
    dispose();
  });
});
