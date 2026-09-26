import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Accessor } from "solid-js";
import { createFling, createGravity, createPendulum } from "./physics.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test.
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];
const listeners = new Map<string, Array<(e: never) => void>>();

function stubBrowser(opts: { reduced?: boolean } = {}) {
  listeners.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("window", {
    innerWidth: 400,
    innerHeight: 800,
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: (t: string, h: (e: never) => void) => {
      const list = listeners.get(t) ?? [];
      list.push(h);
      listeners.set(t, list);
    },
    removeEventListener: (t: string, h: (e: never) => void) => {
      listeners.set(
        t,
        (listeners.get(t) ?? []).filter((x) => x !== h),
      );
    },
  });

  return {
    frames(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
      }
    },
    fire(type: string, event: never) {
      for (const h of [...(listeners.get(type) ?? [])]) h(event);
    },
  };
}

function mockElement(rect = { left: 0, top: 0, width: 50, height: 50 }) {
  const handlers = new Map<string, (e: never) => void>();
  return {
    getBoundingClientRect: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }),
    addEventListener: (t: string, h: (e: never) => void) => handlers.set(t, h),
    removeEventListener: (t: string) => handlers.delete(t),
    handlers,
  };
}

const pointerEvent = (x: number, y: number) =>
  ({ clientX: x, clientY: y, preventDefault: () => {} }) as never;

describe("createGravity", () => {
  function setup(options: Parameters<typeof createGravity>[0] = {}) {
    let r!: ReturnType<typeof createGravity>;
    const dispose = createRoot((d) => {
      r = createGravity(options);
      return d;
    });
    return { ...r, dispose };
  }

  it("falls, bounces, and comes to rest on the floor", () => {
    const b = stubBrowser();
    const { x, y, moving, dispose } = setup({ from: 240 });
    expect(y()).toBe(-240);
    expect(moving()).toBe(true);

    const samples: number[] = [];
    for (let i = 0; i < 400; i++) {
      b.frames(1);
      samples.push(y());
    }
    // It touched the floor and bounced back up at least once.
    const firstFloor = samples.findIndex((v) => v >= 0);
    expect(firstFloor).toBeGreaterThan(0);
    expect(samples.slice(firstFloor).some((v) => v < -1)).toBe(true);
    // And finally parks exactly on the floor.
    expect(y()).toBe(0);
    expect(x()).toBe(0);
    expect(moving()).toBe(false);
    dispose();
  });

  it("drop() replays the drop and calls onRest", () => {
    const b = stubBrowser();
    let rests = 0;
    const { y, moving, drop, dispose } = setup({
      from: 120,
      onRest: () => rests++,
    });
    b.frames(400);
    expect(moving()).toBe(false);
    expect(rests).toBe(1);
    drop();
    expect(moving()).toBe(true);
    expect(y()).toBe(-120);
    b.frames(400);
    expect(rests).toBe(2);
    dispose();
  });

  it("rests on the floor under reduced motion and on the server", () => {
    stubBrowser({ reduced: true });
    const { y, moving, drop, dispose } = setup({ from: 240, floor: 10 });
    expect(y()).toBe(10);
    expect(moving()).toBe(false);
    drop();
    expect(y()).toBe(10);
    dispose();
    createRoot((d) => {
      const r = createGravity({ from: 240 });
      expect(r.y()).toBe(0);
      d();
    });
  });
});

describe("createPendulum", () => {
  function setup(
    ref: () => Element | null | undefined,
    options: Parameters<typeof createPendulum>[1] = {},
  ) {
    let r!: ReturnType<typeof createPendulum>;
    const dispose = createRoot((d) => {
      r = createPendulum(ref, options);
      return d;
    });
    return { ...r, dispose };
  }

  it("swings through the bottom and decays to rest", () => {
    const b = stubBrowser();
    // High damping so the test settles quickly; the default is gentler.
    const { angle, x, dispose } = setup(() => null, {
      amplitude: 45,
      damping: 3,
      length: 160,
    });
    expect(angle()).toBe(45);
    expect(x()).toBeCloseTo(160 * Math.sin(Math.PI / 4), 1);

    let minAbs = Infinity;
    for (let i = 0; i < 60; i++) {
      b.frames(1);
      minAbs = Math.min(minAbs, Math.abs(angle()));
    }
    // It swung through (or near) the bottom.
    expect(minAbs).toBeLessThan(12);

    b.frames(600);
    expect(angle()).toBe(0);
    expect(x()).toBe(0);
    dispose();
  });

  it("never exceeds its release amplitude", () => {
    const b = stubBrowser();
    const { angle, dispose } = setup(() => null, {
      amplitude: 30,
      damping: 0.5,
    });
    let max = 0;
    for (let i = 0; i < 200; i++) {
      b.frames(1);
      max = Math.max(max, Math.abs(angle()));
    }
    expect(max).toBeLessThanOrEqual(30.001);
    dispose();
  });

  it("dragging the bob sets the amplitude", () => {
    const b = stubBrowser();
    const el = mockElement({ left: 100, top: 300, width: 40, height: 40 });
    const { angle, swing, dispose } = setup(() => el as never, { length: 160 });
    // Pivot sits 160px above the bob's top center: (120, 140).
    el.handlers.get("pointerdown")?.(pointerEvent(200, 300));
    // atan2(80, 160) is about 26.6 degrees.
    expect(angle()).toBeCloseTo(26.565, 1);
    // Release: it swings from where it was left.
    b.fire("pointerup", pointerEvent(200, 300));
    b.frames(5);
    expect(Math.abs(angle())).toBeLessThan(26.565);
    swing(10);
    expect(angle()).toBe(10);
    dispose();
  });

  it("hangs at rest under reduced motion and on the server", () => {
    stubBrowser({ reduced: true });
    const { angle, swing, dispose } = setup(() => null);
    swing(40);
    expect(angle()).toBe(0);
    dispose();
    createRoot((d) => {
      const r = createPendulum(() => null);
      expect(r.angle()).toBe(0);
      d();
    });
  });
});

describe("createFling", () => {
  function setup(
    ref: () => Element | null | undefined,
    options: Parameters<typeof createFling>[1] = {},
  ) {
    let r!: ReturnType<typeof createFling>;
    const dispose = createRoot((d) => {
      r = createFling(ref, options);
      return d;
    });
    return { ...r, dispose };
  }

  function drag(
    b: ReturnType<typeof stubBrowser>,
    el: ReturnType<typeof mockElement>,
    points: Array<[number, number]>,
  ) {
    el.handlers.get("pointerdown")?.(pointerEvent(...points[0]));
    for (const [px, py] of points.slice(1)) {
      b.frames(1);
      b.fire("pointermove", pointerEvent(px, py));
    }
    b.frames(1);
    b.fire("pointerup", pointerEvent(...points[points.length - 1]));
  }

  it("drags the element with the pointer", () => {
    const b = stubBrowser();
    const el = mockElement();
    const { x, y, moving, dispose } = setup(() => el as never);
    el.handlers.get("pointerdown")?.(pointerEvent(100, 100));
    b.fire("pointermove", pointerEvent(150, 130));
    expect(x()).toBe(50);
    expect(y()).toBe(30);
    expect(moving()).toBe(false);
    dispose();
  });

  it("throws with momentum and friction slows it to a stop", () => {
    const b = stubBrowser();
    const el = mockElement();
    const { x, vx, moving, stop, dispose } = setup(() => el as never, {
      // A huge container: this test is about friction, not edges.
      bounds: () =>
        ({
          getBoundingClientRect: () => ({
            left: -10000,
            top: -10000,
            right: 10000,
            bottom: 10000,
          }),
        }) as never,
    });
    drag(b, el, [
      [100, 100],
      [160, 100],
      [220, 100],
    ]);
    expect(moving()).toBe(true);
    expect(vx()).toBeGreaterThan(500);
    const releaseX = x();
    b.frames(10);
    // Still gliding forward after release.
    expect(x()).toBeGreaterThan(releaseX);
    const v1 = vx();
    b.frames(10);
    expect(vx()).toBeLessThan(v1);
    b.frames(400);
    expect(moving()).toBe(false);
    expect(vx()).toBe(0);
    stop();
    dispose();
  });

  it("bounces off the viewport edges", () => {
    const b = stubBrowser();
    // Element hugs the left edge; the viewport is 400 wide.
    const el = mockElement({ left: 0, top: 0, width: 50, height: 50 });
    const { x, moving, dispose } = setup(() => el as never, {
      bounciness: 0.8,
    });
    drag(b, el, [
      [25, 25],
      [125, 25],
      [225, 25],
    ]);
    b.frames(600);
    // Never escapes the viewport, and it came to rest.
    expect(x()).toBeLessThanOrEqual(350);
    expect(x()).toBeGreaterThanOrEqual(0);
    expect(moving()).toBe(false);
    dispose();
  });

  it("drags but does not fling under reduced motion", () => {
    const b = stubBrowser({ reduced: true });
    const el = mockElement();
    const { x, moving, dispose } = setup(() => el as never);
    drag(b, el, [
      [100, 100],
      [200, 100],
      [300, 100],
    ]);
    expect(x()).toBe(200);
    expect(moving()).toBe(false);
    dispose();
  });

  it("is inert on the server", () => {
    createRoot((d) => {
      const r = createFling(() => null);
      expect(r.x()).toBe(0);
      expect(r.moving()).toBe(false);
      d();
    });
  });
});
