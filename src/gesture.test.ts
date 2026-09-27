import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Accessor } from "solid-js";
import { createDrag, createSwipe, type DragStatus, type SwipeControls, type SwipeDetails, type SwipeOptions } from "./gesture.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test.
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];

function stubBrowser(opts: { reduced?: boolean } = {}) {
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
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  fireOnEl: (type: string, event?: unknown) => void;
}

function makeEl(): ElStub {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    el: {
      addEventListener: vi.fn((type: string, fn: (event: unknown) => void) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
      }),
      removeEventListener: vi.fn(
        (type: string, fn: (event: unknown) => void) => {
          listeners.get(type)?.delete(fn);
        },
      ),
    },
    fireOnEl(type: string, event: unknown = {}) {
      listeners.get(type)?.forEach((fn) => fn(event));
    },
  };
}

const asElement = (target: ElStub) => target.el as unknown as Element;

interface DragHarness {
  x: Accessor<number>;
  y: Accessor<number>;
  status: Accessor<DragStatus>;
  dispose: () => void;
}

function setup(
  target: ElStub,
  options?: Parameters<typeof createDrag>[1],
): DragHarness {
  let x!: Accessor<number>;
  let y!: Accessor<number>;
  let status!: Accessor<DragStatus>;
  const dispose = createRoot((d) => {
    const drag = createDrag(() => asElement(target), options);
    x = drag.x;
    y = drag.y;
    status = drag.status;
    return d;
  });
  return { x, y, status, dispose };
}

describe("createDrag", () => {
  it("tracks the pointer 1:1 while dragging", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, y, status, dispose } = setup(target);
    expect(status()).toBe("idle");
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    expect(status()).toBe("dragging");
    b.fire("pointermove", { clientX: 250, clientY: 180 });
    expect(x()).toBe(50);
    expect(y()).toBe(30);
    dispose();
  });

  it("runs the full lifecycle: idle, dragging, settling, idle", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, status, dispose } = setup(target);
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.frames(6);
    b.fire("pointermove", { clientX: 300, clientY: 150 });
    b.fire("pointerup", {});
    expect(status()).toBe("settling");
    // 100px in 100ms = 1000 px/s; target = 100 + 1000 * 0.2 = 300.
    b.frames(300);
    expect(status()).toBe("idle");
    expect(x()).toBeCloseTo(300, 0);
    dispose();
  });

  it("glides with momentum right after release", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, dispose } = setup(target);
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.frames(6);
    b.fire("pointermove", { clientX: 300, clientY: 150 });
    b.fire("pointerup", {});
    b.frames(1);
    // Still carrying the release velocity toward the target.
    expect(x()).toBeGreaterThan(100);
    dispose();
  });

  it("clamps to constraints with elastic 0", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, y, dispose } = setup(target, {
      constraints: { left: 0, right: 20, top: 0, bottom: 0 },
      elastic: 0,
    });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.fire("pointermove", { clientX: 300, clientY: 150 });
    expect(x()).toBe(20);
    expect(y()).toBe(0);
    dispose();
  });

  it("overshoots elastically past constraints while dragging", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, dispose } = setup(target, {
      constraints: { right: 20 },
      elastic: 0.5,
    });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.fire("pointermove", { clientX: 260, clientY: 150 });
    // 40px past the edge, halved by the elastic resistance.
    expect(x()).toBe(40);
    dispose();
  });

  it("snaps back inside constraints on release", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, status, dispose } = setup(target, {
      constraints: { right: 20 },
      elastic: 0.5,
    });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.frames(6);
    b.fire("pointermove", { clientX: 260, clientY: 150 });
    expect(x()).toBe(40);
    b.fire("pointerup", {});
    b.frames(300);
    expect(status()).toBe("idle");
    expect(x()).toBeCloseTo(20, 0);
    dispose();
  });

  it("locks to a single axis", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, y, dispose } = setup(target, { axis: "x" });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.fire("pointermove", { clientX: 250, clientY: 200 });
    expect(x()).toBe(50);
    expect(y()).toBe(0);
    dispose();
  });

  it("stays put on release when momentum is off", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, status, dispose } = setup(target, { momentum: false });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.frames(6);
    b.fire("pointermove", { clientX: 300, clientY: 150 });
    b.fire("pointerup", {});
    b.frames(120);
    expect(status()).toBe("idle");
    expect(x()).toBeCloseTo(100, 0);
    dispose();
  });

  it("fires onDragStart and onDragEnd with the release snapshot", () => {
    const b = stubBrowser();
    const target = makeEl();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const { dispose } = setup(target, { onDragStart, onDragEnd });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    b.frames(6);
    b.fire("pointermove", { clientX: 300, clientY: 150 });
    b.fire("pointerup", {});
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    const info = onDragEnd.mock.calls[0][0];
    expect(info.x).toBe(100);
    expect(info.y).toBe(0);
    expect(info.velocityX).toBeCloseTo(1000, -2);
    expect(info.velocityY).toBeCloseTo(0, 1);
    dispose();
  });

  it("ignores non-primary pointers", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, status, dispose } = setup(target);
    target.fireOnEl("pointerdown", {
      isPrimary: false,
      clientX: 200,
      clientY: 150,
    });
    b.fire("pointermove", { isPrimary: false, clientX: 300, clientY: 150 });
    expect(status()).toBe("idle");
    expect(x()).toBe(0);
    dispose();
  });

  it("cancels the settle when a new drag starts", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { x, status, dispose } = setup(target);
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.frames(6);
    b.fire("pointermove", { clientX: 300, clientY: 150 });
    b.fire("pointerup", {});
    expect(status()).toBe("settling");
    target.fireOnEl("pointerdown", { clientX: 300, clientY: 150 });
    expect(status()).toBe("dragging");
    b.fire("pointermove", { clientX: 320, clientY: 150 });
    // Continues from wherever the settle was interrupted.
    expect(x()).toBeGreaterThan(100);
    dispose();
  });

  it("returns zeros on the server", () => {
    const { x, y, status } = createDrag(() => null);
    expect(x()).toBe(0);
    expect(y()).toBe(0);
    expect(status()).toBe("idle");
  });

  it("snaps to the constrained target under reduced motion", () => {
    const b = stubBrowser({ reduced: true });
    const target = makeEl();
    const { x, status, dispose } = setup(target, {
      constraints: { right: 20 },
      elastic: 0.5,
    });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 150 });
    b.fire("pointermove", { clientX: 260, clientY: 150 });
    // Direct manipulation still tracks while dragging.
    expect(x()).toBe(40);
    b.fire("pointerup", {});
    // No glide: lands on the constrained target immediately.
    expect(x()).toBe(20);
    expect(status()).toBe("idle");
    dispose();
  });

  it("removes its listener on cleanup", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { dispose } = setup(target);
    dispose();
    expect(target.el.removeEventListener).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function),
    );
  });
});

describe("createSwipe", () => {
  function setupSwipe(
    target: ElStub,
    options?: SwipeOptions,
  ): SwipeControls & { dispose: () => void } {
    let controls!: SwipeControls;
    const dispose = createRoot((d) => {
      controls = createSwipe(() => asElement(target), options);
      return d;
    });
    return { ...controls, dispose };
  }

  it("recognizes a left swipe past the threshold", () => {
    const b = stubBrowser();
    const target = makeEl();
    const seen: SwipeDetails[] = [];
    const { lastSwipe, dispose } = setupSwipe(target, {
      onSwipe: (d) => seen.push(d),
    });
    target.fireOnEl("pointerdown", { clientX: 300, clientY: 200 });
    b.frames(6); // ~100ms
    b.fire("pointerup", { clientX: 180, clientY: 205 });
    expect(seen).toHaveLength(1);
    expect(seen[0].direction).toBe("left");
    expect(seen[0].distance).toBe(120);
    expect(seen[0].velocity).toBeGreaterThan(0.4);
    expect(lastSwipe()?.direction).toBe("left");
    dispose();
  });

  it("fires the matching per-direction callback", () => {
    const b = stubBrowser();
    const target = makeEl();
    const onSwipeRight = vi.fn();
    const onSwipeUp = vi.fn();
    const { dispose } = setupSwipe(target, { onSwipeRight, onSwipeUp });
    target.fireOnEl("pointerdown", { clientX: 100, clientY: 200 });
    b.frames(3);
    b.fire("pointerup", { clientX: 220, clientY: 200 });
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeRight.mock.calls[0][0].direction).toBe("right");
    expect(onSwipeUp).not.toHaveBeenCalled();
    dispose();
  });

  it("ignores slow long drags and short taps", () => {
    const b = stubBrowser();
    const target = makeEl();
    const onSwipe = vi.fn();
    const { dispose } = setupSwipe(target, { onSwipe });
    // Past the threshold but over maxDuration and under minVelocity:
    // a drag, not a swipe.
    target.fireOnEl("pointerdown", { clientX: 100, clientY: 200 });
    b.frames(60); // ~1000ms: 200px at 0.2 px/ms
    b.fire("pointerup", { clientX: 300, clientY: 200 });
    // Short tap: under the threshold.
    target.fireOnEl("pointerdown", { clientX: 100, clientY: 200 });
    b.frames(6);
    b.fire("pointerup", { clientX: 110, clientY: 202 });
    expect(onSwipe).not.toHaveBeenCalled();
    dispose();
  });

  it("counts a fast flick below the distance threshold", () => {
    const b = stubBrowser();
    const target = makeEl();
    const onSwipe = vi.fn();
    const { dispose } = setupSwipe(target, { onSwipe, threshold: 200 });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 200 });
    b.frames(1); // 16.7ms: 40px at ~2.4 px/ms
    b.fire("pointerup", { clientX: 240, clientY: 200 });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe.mock.calls[0][0].direction).toBe("right");
    dispose();
  });

  it("locks recognition to an axis", () => {
    const b = stubBrowser();
    const target = makeEl();
    const onSwipe = vi.fn();
    const { dispose } = setupSwipe(target, { onSwipe, axis: "x" });
    // Mostly vertical gesture: horizontal travel stays under threshold.
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 200 });
    b.frames(6);
    b.fire("pointerup", { clientX: 210, clientY: 320 });
    expect(onSwipe).not.toHaveBeenCalled();
    dispose();
  });

  it("picks the dominant axis with axis both", () => {
    const b = stubBrowser();
    const target = makeEl();
    const onSwipe = vi.fn();
    const { dispose } = setupSwipe(target, { onSwipe });
    target.fireOnEl("pointerdown", { clientX: 200, clientY: 200 });
    b.frames(6);
    b.fire("pointerup", { clientX: 230, clientY: 320 });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe.mock.calls[0][0].direction).toBe("down");
    dispose();
  });

  it("reset() clears the last swipe", () => {
    const b = stubBrowser();
    const target = makeEl();
    const { lastSwipe, reset, dispose } = setupSwipe(target);
    target.fireOnEl("pointerdown", { clientX: 300, clientY: 200 });
    b.frames(6);
    b.fire("pointerup", { clientX: 150, clientY: 200 });
    expect(lastSwipe()).not.toBeNull();
    reset();
    expect(lastSwipe()).toBeNull();
    dispose();
  });

  it("ignores non-primary pointers and pointercancel", () => {
    const b = stubBrowser();
    const target = makeEl();
    const onSwipe = vi.fn();
    const { dispose } = setupSwipe(target, { onSwipe });
    target.fireOnEl("pointerdown", {
      clientX: 300,
      clientY: 200,
      isPrimary: false,
    });
    b.frames(6);
    b.fire("pointerup", { clientX: 100, clientY: 200 });
    // Cancelled mid-gesture: no swipe even with big travel.
    target.fireOnEl("pointerdown", { clientX: 300, clientY: 200 });
    b.frames(6);
    b.fire("pointercancel", {});
    expect(onSwipe).not.toHaveBeenCalled();
    dispose();
  });

  it("is SSR-safe: lastSwipe stays null", () => {
    const { lastSwipe } = createSwipe(() => null);
    expect(lastSwipe()).toBeNull();
  });
});
