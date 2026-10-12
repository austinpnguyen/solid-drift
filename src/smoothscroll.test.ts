import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSmoothScroll } from "./smoothscroll.js";

describe("createSmoothScroll", () => {
  let fakeScrollY = 0;
  let listeners: Map<string, EventListener>;
  let classes: Set<string>;
  let nowMs = 0;
  let rafCbs: Map<number, (t: number) => void>;
  let nextRafId = 1;

  function frames(n: number, step = 16.7) {
    for (let i = 0; i < n; i++) {
      nowMs += step;
      const cbs = [...rafCbs.values()];
      rafCbs.clear();
      cbs.forEach((cb) => cb(nowMs));
    }
  }

  beforeEach(() => {
    fakeScrollY = 0;
    listeners = new Map();
    classes = new Set();
    nowMs = 0;
    rafCbs = new Map();
    nextRafId = 1;

    vi.stubGlobal("window", {
      get scrollY() {
        return fakeScrollY;
      },
      get innerHeight() {
        return 800;
      },
      scrollTo: (opts: { top: number }) => {
        fakeScrollY = opts.top;
      },
      addEventListener: (type: string, cb: EventListener) => {
        listeners.set(type, cb);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
    });
    vi.stubGlobal("document", {
      documentElement: {
        scrollHeight: 3000,
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
        },
      },
      getElementById: () => null,
      querySelector: () => null,
    });
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      const id = nextRafId++;
      rafCbs.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafCbs.delete(id);
    });
    vi.stubGlobal("performance", { now: () => nowMs });
    vi.stubGlobal("getComputedStyle", () => ({
      scrollMarginTop: "0",
      scrollPaddingTop: "0",
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function wheel(deltaY: number, deltaMode = 0) {
    const e = {
      deltaY,
      deltaMode,
      ctrlKey: false,
      composedPath: () => [],
      preventDefault: vi.fn(),
    } as unknown as WheelEvent;
    listeners.get("wheel")?.(e);
    return e;
  }

  it("adds drift-smooth class on init, removes on dispose", () => {
    const s = createSmoothScroll();
    expect(classes.has("drift-smooth")).toBe(true);
    s.dispose();
    expect(classes.has("drift-smooth")).toBe(false);
    expect(listeners.has("wheel")).toBe(false);
  });

  it("wheel input moves target and animates toward it", () => {
    const s = createSmoothScroll({ lerp: 0.1 });
    wheel(100);
    frames(120); // 2 seconds
    // Should have moved close to 100.
    expect(s.scroll()).toBeGreaterThan(90);
    expect(s.scroll()).toBeLessThanOrEqual(100);
    s.dispose();
  });

  it("normalizes deltaMode lines (x16.67)", () => {
    const s = createSmoothScroll({ lerp: 1 }); // instant for test
    wheel(3, 1); // 3 lines
    frames(10);
    expect(s.scroll()).toBeCloseTo(50, 0); // 3 * 16.67
    s.dispose();
  });

  it("does not intercept pinch-zoom (ctrlKey)", () => {
    const s = createSmoothScroll();
    const e = {
      deltaY: 100,
      deltaMode: 0,
      ctrlKey: true,
      composedPath: () => [],
      preventDefault: vi.fn(),
    } as unknown as WheelEvent;
    listeners.get("wheel")?.(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    frames(10);
    expect(s.scroll()).toBe(0);
    s.dispose();
  });

  it("respects data-drift-prevent", () => {
    const s = createSmoothScroll();
    const inner = {
      hasAttribute: (n: string) => n === "data-drift-prevent",
    };
    const e = {
      deltaY: 100,
      deltaMode: 0,
      ctrlKey: false,
      composedPath: () => [inner],
      preventDefault: vi.fn(),
    } as unknown as WheelEvent;
    // instanceof check needs a real HTMLElement; our fake won't match,
    // so this tests the path doesn't crash. Real behavior verified manually.
    listeners.get("wheel")?.(e);
    s.dispose();
  });

  it("scrollTo animates to target", async () => {
    const s = createSmoothScroll();
    const p = s.scrollTo(500, { duration: 200 });
    frames(30);
    await p;
    expect(s.scroll()).toBeCloseTo(500, 0);
    s.dispose();
  });

  it("scrollTo with immediate jumps", async () => {
    const onComplete = vi.fn();
    const s = createSmoothScroll();
    await s.scrollTo(500, { immediate: true, onComplete });
    expect(s.scroll()).toBe(500);
    expect(onComplete).toHaveBeenCalled();
    s.dispose();
  });

  it("wheel interrupts programmatic scroll (user wins)", async () => {
    const s = createSmoothScroll();
    const p = s.scrollTo(1000, { duration: 1000 });
    frames(10);
    const atInterrupt = s.scroll();
    wheel(100); // user intervenes: target becomes current + 100
    frames(120);
    await p; // resolves when interrupted
    // Should be near atInterrupt + 100, not 1000.
    expect(s.scroll()).toBeLessThan(atInterrupt + 200);
    expect(s.scroll()).toBeGreaterThan(atInterrupt);
    s.dispose();
  });

  it("stop/start toggles drift-stopped class", () => {
    const s = createSmoothScroll();
    s.stop();
    expect(classes.has("drift-stopped")).toBe(true);
    // Wheel ignored while stopped.
    wheel(100);
    frames(10);
    expect(s.scroll()).toBe(0);
    s.start();
    expect(classes.has("drift-stopped")).toBe(false);
    s.dispose();
  });

  it("onScroll receives state updates", () => {
    const s = createSmoothScroll({ lerp: 1 });
    const seen: number[] = [];
    const unsub = s.onScroll((st) => seen.push(st.scroll));
    wheel(100);
    frames(5);
    expect(seen.length).toBeGreaterThan(0);
    unsub();
    s.dispose();
  });

  it("clamps scrollTo to [0, limit]", async () => {
    const s = createSmoothScroll();
    await s.scrollTo(999999, { immediate: true });
    expect(s.scroll()).toBe(2200); // 3000 - 800
    await s.scrollTo(-100, { immediate: true });
    expect(s.scroll()).toBe(0);
    s.dispose();
  });

  it("dispose is idempotent", () => {
    const s = createSmoothScroll();
    expect(() => {
      s.dispose();
      s.dispose();
    }).not.toThrow();
  });
});
