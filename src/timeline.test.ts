import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createTimeline, type TimelineControls } from "./timeline.js";

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
    async run(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
        // Let the promise chain advance between frames.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    frames(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
      }
    },
  };
}

function makeTimeline(log: string[]): TimelineControls {
  let controls!: TimelineControls;
  createRoot(() => {
    controls = createTimeline([
      {
        from: 0,
        to: 1,
        duration: 100,
        onUpdate: (v) => log.push(`a:${v.toFixed(2)}`),
      },
      {
        from: 0,
        to: 10,
        duration: 100,
        onUpdate: (v) => log.push(`b:${v.toFixed(0)}`),
      },
    ]);
  });
  return controls;
}

describe("createTimeline", () => {
  it("plays steps in order and reports status", async () => {
    const b = stubBrowser();
    const log: string[] = [];
    const tl = makeTimeline(log);

    expect(tl.status()).toBe("idle");
    const done = tl.start();
    expect(tl.status()).toBe("running");
    await b.run(20); // 334ms of frames, plenty for 200ms of steps
    await done;
    expect(tl.status()).toBe("done");

    // Every a: update precedes every b: update.
    const firstB = log.findIndex((entry) => entry.startsWith("b:"));
    expect(firstB).toBeGreaterThan(0);
    expect(log.slice(0, firstB).every((e) => e.startsWith("a:"))).toBe(true);
    expect(log[firstB - 1]).toBe("a:1.00");
    expect(log[log.length - 1]).toBe("b:10");
  });

  it("stop() halts mid-run and resolves start()", async () => {
    const b = stubBrowser();
    const log: string[] = [];
    const tl = makeTimeline(log);

    const done = tl.start();
    b.frames(2);
    tl.stop();
    await done; // must resolve, not hang
    expect(tl.status()).toBe("idle");
    // Never reached the second step.
    expect(log.some((e) => e.startsWith("b:"))).toBe(false);
  });

  it("replay() restarts from the first step", async () => {
    const b = stubBrowser();
    const log: string[] = [];
    const tl = makeTimeline(log);

    let done = tl.start();
    await b.run(20);
    await done;
    const firstRun = log.length;
    expect(firstRun).toBeGreaterThan(0);

    done = tl.replay();
    expect(tl.status()).toBe("running");
    await b.run(20);
    await done;
    expect(tl.status()).toBe("done");
    expect(log.length).toBeGreaterThan(firstRun);
    // The replay starts over with a: updates.
    expect(log[firstRun].startsWith("a:")).toBe(true);
  });

  it("resolves immediately with no steps", async () => {
    stubBrowser();
    let tl!: TimelineControls;
    createRoot(() => {
      tl = createTimeline([]);
    });
    await tl.start();
    expect(tl.status()).toBe("done");
  });

  it("jumps through steps instantly under reduced motion", async () => {
    stubBrowser({ reduced: true });
    const log: string[] = [];
    const tl = makeTimeline(log);
    await tl.start(); // no frames needed
    expect(tl.status()).toBe("done");
    expect(log).toContain("a:1.00");
    expect(log).toContain("b:10");
  });

  it("applies end values instantly on the server", async () => {
    // No window stubbed: SSR path.
    const log: string[] = [];
    const tl = makeTimeline(log);
    await tl.start();
    expect(tl.status()).toBe("done");
    expect(log).toContain("a:1.00");
    expect(log).toContain("b:10");
  });
});
