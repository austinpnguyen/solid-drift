import { describe, expect, it, vi, afterEach } from "vitest";
import { createRoot, createSignal, type Accessor } from "solid-js";
import { createWaveform } from "./voice.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/*
 * The fake rAF queue and clock are module-level on purpose: the
 * animation engine remembers a pending rAF id across tests, so the
 * queue must outlive any single test. Otherwise a stale id would make
 * schedule() skip queueing and the next test's loop would never run.
 * (Same pattern as the other engine-driven test files in this repo.)
 */
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];

function stubBrowser(): { frames: (n: number) => void } {
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: (t: number) => void): number => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  return {
    frames(n: number): void {
      for (let i = 0; i < n; i++) {
        fakeTime += 16.7;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
      }
    },
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const flush = async (): Promise<void> => {
  await sleep(0);
  await sleep(0);
};

describe("createWaveform re-arm", () => {
  it("re-arms the render loop when enabled() flips from false to true", async () => {
    const { frames } = stubBrowser();
    let setEnabled!: (v: boolean) => void;
    let wf!: { active: Accessor<boolean> };
    const dispose = createRoot((d) => {
      const [enabled, _setEnabled] = createSignal(false);
      setEnabled = _setEnabled;
      wf = createWaveform(() => null, { analyser: () => null, enabled });
      return d;
    });
    await flush();
    frames(3);
    // Starts disabled: the loop parks itself and stays inactive.
    expect(wf.active()).toBe(false);
    // Flip enabled on: the loop must re-arm and start drawing.
    setEnabled(true);
    await flush();
    frames(3);
    expect(wf.active()).toBe(true);
    dispose();
  });

  it("parks the loop when enabled() flips back to false", async () => {
    const { frames } = stubBrowser();
    let setEnabled!: (v: boolean) => void;
    let wf!: { active: Accessor<boolean> };
    const dispose = createRoot((d) => {
      const [enabled, _setEnabled] = createSignal(true);
      setEnabled = _setEnabled;
      wf = createWaveform(() => null, { analyser: () => null, enabled });
      return d;
    });
    await flush();
    frames(3);
    expect(wf.active()).toBe(true);
    setEnabled(false);
    await flush();
    frames(3);
    // The parked task removed itself; the loop stays quiet.
    expect(wf.active()).toBe(false);
    dispose();
  });

  it("draws from the start when enabled defaults to true", async () => {
    const { frames } = stubBrowser();
    let wf!: { active: Accessor<boolean> };
    const dispose = createRoot((d) => {
      wf = createWaveform(() => null, { analyser: () => null });
      return d;
    });
    await flush();
    frames(3);
    expect(wf.active()).toBe(true);
    dispose();
  });

  it("never schedules when given a plain boolean false", async () => {
    const { frames } = stubBrowser();
    let wf!: { active: Accessor<boolean> };
    const dispose = createRoot((d) => {
      wf = createWaveform(() => null, {
        analyser: () => null,
        enabled: false,
      });
      return d;
    });
    await flush();
    frames(3);
    expect(wf.active()).toBe(false);
    dispose();
  });
});
