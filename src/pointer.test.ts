import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Accessor } from "solid-js";
import { createMagnetic, createTilt } from "./pointer.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface BrowserStub {
  frames: (n: number, step?: number) => void;
  fire: (type: string, event?: unknown) => void;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test. Otherwise a stale id would make schedule() skip
// queueing and the next test's animations would never run.
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];

function stubBrowser(opts: { reduced?: boolean } = {}): BrowserStub {
  const listeners = new Map<string, Set<(event: unknown) => void>>();

  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });

  const addEventListener = vi.fn(
    (type: string, fn: (event: unknown) => void) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn);
    },
  );
  const removeEventListener = vi.fn(
    (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
  );

  vi.stubGlobal("window", {
    addEventListener,
    removeEventListener,
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
    fire(type: string, event: unknown = {}) {
      listeners.get(type)?.forEach((fn) => fn(event));
    },
    addEventListener,
    removeEventListener,
  };
}

interface ElStub {
  el: {
    getBoundingClientRect: () => {
      left: number;
      top: number;
      width: number;
      height: number;
      right: number;
      bottom: number;
    };
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  fireOnEl: (type: string) => void;
}

/** 200x100 element at (100, 100), center is (200, 150). */
function makeEl(): ElStub {
  const listeners = new Map<string, Set<() => void>>();
  return {
    el: {
      getBoundingClientRect: () => ({
        left: 100,
        top: 100,
        width: 200,
        height: 100,
        right: 300,
        bottom: 200,
      }),
      addEventListener: vi.fn((type: string, fn: () => void) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: () => void) => {
        listeners.get(type)?.delete(fn);
      }),
    },
    fireOnEl(type: string) {
      listeners.get(type)?.forEach((fn) => fn());
    },
  };
}

const asElement = (target: ElStub) => target.el as unknown as Element;

describe("createMagnetic", () => {
  it("pulls toward the pointer inside the radius", () => {
    const b = stubBrowser();
    const target = makeEl();
    let x!: Accessor<number>;
    let y!: Accessor<number>;
    const dispose = createRoot((d) => {
      const m = createMagnetic(() => asElement(target), {
        radius: 140,
        strength: 0.35,
        spring: { stiffness: 500, damping: 40 },
      });
      x = m.x;
      y = m.y;
      return d;
    });
    // Pointer 40px right of center: target x = 40 * 0.35 * (1 - 40/140).
    b.fire("pointermove", { clientX: 240, clientY: 150 });
    b.frames(200);
    expect(x()).toBeCloseTo(10, 0);
    expect(y()).toBeCloseTo(0, 1);
    dispose();
  });

  it("springs back to rest outside the radius", () => {
    const b = stubBrowser();
    const target = makeEl();
    let x!: Accessor<number>;
    const dispose = createRoot((d) => {
      x = createMagnetic(() => asElement(target), {
        spring: { stiffness: 500, damping: 40 },
      }).x;
      return d;
    });
    b.fire("pointermove", { clientX: 240, clientY: 150 });
    b.frames(200);
    expect(x()).toBeGreaterThan(1);
    b.fire("pointermove", { clientX: 2000, clientY: 2000 });
    b.frames(200);
    expect(x()).toBeCloseTo(0, 2);
    dispose();
  });

  it("moves smoothly, not instantly", () => {
    const b = stubBrowser();
    const target = makeEl();
    let x!: Accessor<number>;
    const dispose = createRoot((d) => {
      x = createMagnetic(() => asElement(target)).x;
      return d;
    });
    b.fire("pointermove", { clientX: 240, clientY: 150 });
    b.frames(1);
    // Spring physics: partway there, not snapped to the target.
    expect(x()).toBeGreaterThan(0);
    expect(x()).toBeLessThan(10);
    dispose();
  });

  it("removes its listener on cleanup", () => {
    const b = stubBrowser();
    const target = makeEl();
    const dispose = createRoot((d) => {
      createMagnetic(() => asElement(target));
      return d;
    });
    dispose();
    expect(b.removeEventListener).toHaveBeenCalledWith(
      "pointermove",
      expect.any(Function),
    );
  });

  it("returns zeros on the server and under reduced motion", () => {
    const { x, y } = createMagnetic(() => null);
    expect(x()).toBe(0);
    expect(y()).toBe(0);

    stubBrowser({ reduced: true });
    const target = makeEl();
    let mx!: Accessor<number>;
    let my!: Accessor<number>;
    const dispose = createRoot((d) => {
      const m = createMagnetic(() => asElement(target));
      mx = m.x;
      my = m.y;
      return d;
    });
    expect(mx()).toBe(0);
    expect(my()).toBe(0);
    dispose();
  });
});

describe("createTilt", () => {
  it("tilts toward the pointer position", () => {
    const b = stubBrowser();
    const target = makeEl();
    let rotateX!: Accessor<number>;
    let rotateY!: Accessor<number>;
    const dispose = createRoot((d) => {
      const t = createTilt(() => asElement(target), {
        maxAngle: 10,
        spring: { stiffness: 500, damping: 40 },
      });
      rotateX = t.rotateX;
      rotateY = t.rotateY;
      return d;
    });
    // Right edge: full positive rotateY.
    b.fire("pointermove", { clientX: 300, clientY: 150 });
    b.frames(200);
    expect(rotateY()).toBeCloseTo(10, 0);
    // Bottom edge: full negative rotateX.
    b.fire("pointermove", { clientX: 200, clientY: 200 });
    b.frames(200);
    expect(rotateX()).toBeCloseTo(-10, 0);
    expect(rotateY()).toBeCloseTo(0, 0);
    dispose();
  });

  it("settles back to flat on pointerleave", () => {
    const b = stubBrowser();
    const target = makeEl();
    let rotateY!: Accessor<number>;
    const dispose = createRoot((d) => {
      rotateY = createTilt(() => asElement(target), {
        spring: { stiffness: 500, damping: 40 },
      }).rotateY;
      return d;
    });
    b.fire("pointermove", { clientX: 300, clientY: 150 });
    b.frames(200);
    expect(Math.abs(rotateY())).toBeGreaterThan(1);
    target.fireOnEl("pointerleave");
    b.frames(200);
    expect(rotateY()).toBeCloseTo(0, 2);
    dispose();
  });

  it("ignores pointer positions outside the element", () => {
    const b = stubBrowser();
    const target = makeEl();
    let rotateY!: Accessor<number>;
    const dispose = createRoot((d) => {
      rotateY = createTilt(() => asElement(target), {
        spring: { stiffness: 500, damping: 40 },
      }).rotateY;
      return d;
    });
    b.fire("pointermove", { clientX: 900, clientY: 900 });
    b.frames(60);
    expect(rotateY()).toBeCloseTo(0, 2);
    dispose();
  });

  it("returns zeros on the server and under reduced motion", () => {
    const { rotateX, rotateY } = createTilt(() => null);
    expect(rotateX()).toBe(0);
    expect(rotateY()).toBe(0);

    stubBrowser({ reduced: true });
    const target = makeEl();
    let rx!: Accessor<number>;
    let ry!: Accessor<number>;
    const dispose = createRoot((d) => {
      const t = createTilt(() => asElement(target));
      rx = t.rotateX;
      ry = t.rotateY;
      return d;
    });
    expect(rx()).toBe(0);
    expect(ry()).toBe(0);
    dispose();
  });
});
