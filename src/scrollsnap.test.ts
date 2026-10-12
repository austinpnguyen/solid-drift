import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScrollSnap } from "./scrollsnap.js";

describe("createScrollSnap", () => {
  let fakeScrollY = 0;
  let listeners: Map<string, () => void>;
  let timers: { cb: () => void; time: number }[];
  let nowMs: number;

  beforeEach(() => {
    fakeScrollY = 0;
    listeners = new Map();
    timers = [];
    nowMs = 0;

    vi.stubGlobal("window", {
      get scrollY() {
        return fakeScrollY;
      },
      scrollTo: (_x: number, y: number) => {
        fakeScrollY = y;
      },
      addEventListener: (type: string, cb: () => void) => {
        listeners.set(type, cb);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
      matchMedia: () => ({ matches: true }),
    });
    vi.stubGlobal("performance", { now: () => nowMs });
    // Use real setTimeout but control it manually.
    vi.stubGlobal("setTimeout", ((cb: () => void, ms: number) => {
      const id = timers.length + 1;
      timers.push({ cb, time: nowMs + ms });
      return id;
    }) as typeof setTimeout);
    vi.stubGlobal("clearTimeout", ((id: number) => {
      timers = timers.filter((_, i) => i !== id - 1);
    }) as typeof clearTimeout);
    vi.stubGlobal("requestAnimationFrame", (_cb: (t: number) => void) => {
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fireScroll(y: number, dtMs = 16) {
    nowMs += dtMs;
    fakeScrollY = y;
    listeners.get("scroll")?.();
  }

  function advanceTimers(ms: number) {
    nowMs += ms;
    const due = timers.filter((t) => t.time <= nowMs);
    timers = timers.filter((t) => t.time > nowMs);
    due.forEach((t) => t.cb());
  }

  it("snaps to the nearest point after scroll stops", () => {
    const onSnap = vi.fn();
    const snap = createScrollSnap({
      velocityThreshold: Infinity,
      points: [0, 500, 1000],
      onSnap,
    });
    for (let y = 0; y <= 600; y += 30) fireScroll(y);
    advanceTimers(200);
    expect(onSnap).toHaveBeenCalledWith(1);
    expect(fakeScrollY).toBe(500);
    snap.dispose();
  });

  it("snaps to the farther point when closer to it", () => {
    const onSnap = vi.fn();
    const snap = createScrollSnap({
      velocityThreshold: Infinity,
      points: [0, 500, 1000],
      onSnap,
    });
    for (let y = 0; y <= 900; y += 30) fireScroll(y);
    advanceTimers(200);
    expect(onSnap).toHaveBeenCalledWith(2);
    expect(fakeScrollY).toBe(1000);
    snap.dispose();
  });

  it("resolves element points", () => {
    const onSnap = vi.fn();
    const el = {
      getBoundingClientRect: () => ({ top: 400 - fakeScrollY, left: 0 }),
    } as unknown as HTMLElement;
    const snap = createScrollSnap({
      velocityThreshold: Infinity,
      points: [() => el],
      onSnap,
    });
    for (let y = 0; y <= 350; y += 30) fireScroll(y);
    advanceTimers(200);
    expect(onSnap).toHaveBeenCalledWith(0);
    snap.dispose();
  });

  it("supports function returning numbers", () => {
    const onSnap = vi.fn();
    const snap = createScrollSnap({
      velocityThreshold: Infinity,
      points: () => [0, 300],
      onSnap,
    });
    for (let y = 0; y <= 250; y += 30) fireScroll(y);
    advanceTimers(200);
    expect(onSnap).toHaveBeenCalledWith(1);
    snap.dispose();
  });

  it("dispose is idempotent and removes listener", () => {
    const snap = createScrollSnap({
      velocityThreshold: Infinity,
      points: [0, 500],
    });
    expect(listeners.has("scroll")).toBe(true);
    snap.dispose();
    expect(listeners.has("scroll")).toBe(false);
    expect(() => snap.dispose()).not.toThrow();
  });

  it("does nothing with empty points", () => {
    const onSnap = vi.fn();
    const snap = createScrollSnap({
      velocityThreshold: Infinity,
      points: [],
      onSnap,
    });
    fireScroll(100);
    advanceTimers(200);
    expect(onSnap).not.toHaveBeenCalled();
    snap.dispose();
  });
});
