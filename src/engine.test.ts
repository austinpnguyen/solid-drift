import { beforeAll, describe, expect, it, vi } from "vitest";
import { now, schedule } from "./engine.js";

// Module-level on purpose: the engine hooks the visibility listener once,
// on the first schedule() call, so the document stub must outlive every
// test in this file and is never unstubbed.
let fakeTime = 0;
let nextRafId = 1;
const pending = new Map<number, (t: number) => void>();
let documentHidden = false;
let visListener: (() => void) | null = null;

function frames(n: number, step = 16.7) {
  for (let i = 0; i < n; i++) {
    fakeTime += step;
    const cbs = [...pending.values()];
    pending.clear();
    cbs.forEach((cb) => cb(fakeTime));
  }
}

beforeAll(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: (t: number) => void): number => {
      const id = nextRafId++;
      pending.set(id, cb);
      return id;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("document", {
    get hidden() {
      return documentHidden;
    },
    addEventListener: (type: string, cb: () => void) => {
      if (type === "visibilitychange") visListener = cb;
    },
    removeEventListener: () => {},
  });
});

describe("engine auto-pause", () => {
  it("runs scheduled tasks on the shared clock", () => {
    const seen: number[] = [];
    const cancel = schedule((t) => {
      seen.push(t);
      return true;
    });
    frames(3);
    expect(seen).toHaveLength(3);
    expect(seen[1]).toBeGreaterThan(seen[0]);
    expect(seen[2]).toBeGreaterThan(seen[1]);
    cancel();
  });

  it("pauses the loop while hidden and resumes without a time jump", () => {
    const seen: number[] = [];
    const cancel = schedule((t) => {
      seen.push(t);
      return true;
    });
    frames(3);
    expect(seen).toHaveLength(3);
    const lastBefore = seen[seen.length - 1];

    documentHidden = true;
    visListener?.();
    expect(pending.size).toBe(0);

    const frozen = now();
    frames(3);
    expect(seen).toHaveLength(3); // no ticks ran while hidden
    expect(now()).toBe(frozen); // the clock froze

    documentHidden = false;
    visListener?.();
    frames(3);
    expect(seen).toHaveLength(6);
    const firstAfter = seen[3];
    expect(firstAfter).toBeGreaterThan(lastBefore);
    // The hidden gap (3 frames) must not appear as a jump: the next tick
    // continues one frame-step after the last pre-hide tick.
    expect(firstAfter - lastBefore).toBeCloseTo(16.7, 5);
    cancel();
  });

  it("does not schedule frames for tasks added while hidden", () => {
    documentHidden = true;
    visListener?.();
    const seen: number[] = [];
    const cancel = schedule((t) => {
      seen.push(t);
      return true;
    });
    frames(2);
    expect(seen).toHaveLength(0);
    expect(pending.size).toBe(0);

    documentHidden = false;
    visListener?.();
    frames(2);
    expect(seen).toHaveLength(2);
    cancel();
  });

  it("stops the driver when the last task is cancelled", () => {
    const seen: number[] = [];
    const cancel = schedule((t) => {
      seen.push(t);
      return false; // one-shot
    });
    frames(2);
    expect(seen).toHaveLength(1);
    expect(pending.size).toBe(0);
    cancel();
  });
});
