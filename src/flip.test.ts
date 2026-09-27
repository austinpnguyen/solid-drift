import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Accessor } from "solid-js";
import { animateFlip, createSharedLayout } from "./flip.js";

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

interface TargetStub {
  style: { transform: string };
  setRect: (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => void;
  asElement: () => Element;
}

function makeTarget(): TargetStub {
  const rect = { left: 0, top: 0, width: 100, height: 50 };
  const el = {
    style: { transform: "" },
    getBoundingClientRect: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }),
  };
  Object.defineProperty(el, "offsetHeight", { get: () => 50 });
  return {
    style: el.style,
    setRect: (next) => Object.assign(rect, next),
    asElement: () => el as unknown as Element,
  };
}

describe("animateFlip", () => {
  it("animates from the inverted delta back to identity", async () => {
    const b = stubBrowser();
    const target = makeTarget();

    let mutated = false;
    const controls = animateFlip(
      () => target.asElement(),
      () => {
        mutated = true;
        target.setRect({ left: 200, top: 100, width: 100, height: 50 });
      },
      { duration: 100 },
    );
    expect(mutated).toBe(true);

    b.frames(2); // two rAFs: flush the mutation, then measure and invert
    await Promise.resolve();
    // Inverted state: the element is pushed back to where it was.
    expect(target.style.transform).toContain(
      "translate3d(-200.00px, -100.00px, 0)",
    );

    b.frames(10); // 167ms > 100ms duration
    await controls.finished;
    // Identity reached: the pre-existing transform is restored.
    expect(target.style.transform).toBe("");
  });

  it("animates the size delta as scale", async () => {
    const b = stubBrowser();
    const target = makeTarget();

    const controls = animateFlip(
      () => target.asElement(),
      () => target.setRect({ left: 0, top: 0, width: 200, height: 100 }),
      { duration: 100 },
    );
    b.frames(2);
    await Promise.resolve();
    // 100px grew to 200px: inverted scale is 0.5.
    expect(target.style.transform).toContain("scale(0.5000, 0.5000)");

    b.frames(10);
    await controls.finished;
    expect(target.style.transform).toBe("");
  });

  it("does nothing when the element does not move", async () => {
    const b = stubBrowser();
    const target = makeTarget();

    const controls = animateFlip(
      () => target.asElement(),
      () => {
        /* no layout change */
      },
      { duration: 100 },
    );
    b.frames(4);
    await controls.finished;
    expect(target.style.transform).toBe("");
  });

  it("stop() restores the original transform and resolves", async () => {
    const b = stubBrowser();
    const target = makeTarget();
    target.style.transform = "rotate(5deg)";

    const controls = animateFlip(
      () => target.asElement(),
      () => target.setRect({ left: 200, top: 0, width: 100, height: 50 }),
      { duration: 1000 },
    );
    b.frames(2);
    await Promise.resolve();
    expect(target.style.transform).not.toBe("rotate(5deg)");

    controls.stop();
    await controls.finished;
    expect(target.style.transform).toBe("rotate(5deg)");
  });

  it("runs the mutation with no animation under reduced motion", async () => {
    stubBrowser({ reduced: true });
    const target = makeTarget();

    let mutated = false;
    const controls = animateFlip(
      () => target.asElement(),
      () => {
        mutated = true;
        target.setRect({ left: 200, top: 0, width: 100, height: 50 });
      },
      { duration: 100 },
    );
    await controls.finished;
    expect(mutated).toBe(true);
    expect(target.style.transform).toBe("");
  });

  it("runs the mutation with no animation on the server", async () => {
    // No window stubbed: SSR path.
    const target = makeTarget();
    let mutated = false;
    const controls = animateFlip(
      () => target.asElement(),
      () => {
        mutated = true;
      },
    );
    await controls.finished;
    expect(mutated).toBe(true);
  });

  it("runs the mutation with no animation when the ref is empty", async () => {
    const b = stubBrowser();
    void b;
    let mutated = false;
    const controls = animateFlip(
      () => null,
      () => {
        mutated = true;
      },
    );
    await controls.finished;
    expect(mutated).toBe(true);
  });
});

describe("createSharedLayout", () => {
  it("flies from the donor rect on mount", () => {
    const b = stubBrowser();
    const donor = makeTarget(); // (0, 0) 100x50
    let disposeDonor!: () => void;
    createRoot((d) => {
      createSharedLayout(() => donor.asElement(), { id: "t1-card" });
      disposeDonor = d;
    });
    disposeDonor(); // unmount parks the donor rect

    const el = makeTarget();
    el.setRect({ left: 200, top: 100, width: 200, height: 100 });
    let x!: Accessor<number>;
    let y!: Accessor<number>;
    let scaleX!: Accessor<number>;
    let scaleY!: Accessor<number>;
    let flying!: Accessor<boolean>;
    const dispose = createRoot((d) => {
      const s = createSharedLayout(() => el.asElement(), { id: "t1-card" });
      x = s.x;
      y = s.y;
      scaleX = s.scaleX;
      scaleY = s.scaleY;
      flying = s.flying;
      return d;
    });

    // Inverted delta: starts at the donor's rect, springs home.
    expect(x()).toBe(-200);
    expect(y()).toBe(-100);
    expect(scaleX()).toBe(0.5);
    expect(scaleY()).toBe(0.5);
    expect(flying()).toBe(true);

    b.frames(300);
    expect(x()).toBeCloseTo(0, 1);
    expect(y()).toBeCloseTo(0, 1);
    expect(scaleX()).toBeCloseTo(1, 3);
    expect(scaleY()).toBeCloseTo(1, 3);
    expect(flying()).toBe(false);
    dispose();
  });

  it("starts at identity with no donor", () => {
    stubBrowser();
    const el = makeTarget();
    let x!: Accessor<number>;
    let flying!: Accessor<boolean>;
    const dispose = createRoot((d) => {
      const s = createSharedLayout(() => el.asElement(), { id: "t2-fresh" });
      x = s.x;
      flying = s.flying;
      return d;
    });
    expect(x()).toBe(0);
    expect(flying()).toBe(false);
    dispose();
  });

  it("does not morph size when scale is false", () => {
    const b = stubBrowser();
    void b;
    const donor = makeTarget();
    let disposeDonor!: () => void;
    createRoot((d) => {
      createSharedLayout(() => donor.asElement(), { id: "t3-card" });
      disposeDonor = d;
    });
    disposeDonor();

    const el = makeTarget();
    el.setRect({ left: 200, top: 100, width: 200, height: 100 });
    let x!: Accessor<number>;
    let scaleX!: Accessor<number>;
    const dispose = createRoot((d) => {
      const s = createSharedLayout(() => el.asElement(), {
        id: "t3-card",
        scale: false,
      });
      x = s.x;
      scaleX = s.scaleX;
      return d;
    });
    expect(x()).toBe(-200);
    expect(scaleX()).toBe(1);
    dispose();
  });

  it("consumes the donor so a later mount starts at identity", () => {
    stubBrowser();
    const donor = makeTarget();
    let disposeDonor!: () => void;
    createRoot((d) => {
      createSharedLayout(() => donor.asElement(), { id: "t4-card" });
      disposeDonor = d;
    });
    disposeDonor();

    const second = makeTarget();
    second.setRect({ left: 50, top: 50, width: 100, height: 50 });
    let sx!: Accessor<number>;
    const disposeSecond = createRoot((d) => {
      const s = createSharedLayout(() => second.asElement(), {
        id: "t4-card",
      });
      sx = s.x;
      return d;
    });
    expect(sx()).toBe(-50); // consumed the donor

    const third = makeTarget();
    let tx!: Accessor<number>;
    let flying!: Accessor<boolean>;
    const disposeThird = createRoot((d) => {
      const s = createSharedLayout(() => third.asElement(), { id: "t4-card" });
      tx = s.x;
      flying = s.flying;
      return d;
    });
    expect(tx()).toBe(0); // registry was consumed by the second mount
    expect(flying()).toBe(false);
    disposeSecond();
    disposeThird();
  });

  it("skips the flight under reduced motion", () => {
    stubBrowser({ reduced: true });
    const donor = makeTarget();
    let disposeDonor!: () => void;
    createRoot((d) => {
      createSharedLayout(() => donor.asElement(), { id: "t5-card" });
      disposeDonor = d;
    });
    disposeDonor();

    const el = makeTarget();
    el.setRect({ left: 200, top: 100, width: 100, height: 50 });
    let x!: Accessor<number>;
    let flying!: Accessor<boolean>;
    const dispose = createRoot((d) => {
      const s = createSharedLayout(() => el.asElement(), { id: "t5-card" });
      x = s.x;
      flying = s.flying;
      return d;
    });
    expect(x()).toBe(0);
    expect(flying()).toBe(false);
    dispose();
  });

  it("returns identity on the server", () => {
    // No window stubbed: SSR path.
    const s = createSharedLayout(() => null, { id: "t6-card" });
    expect(s.x()).toBe(0);
    expect(s.y()).toBe(0);
    expect(s.scaleX()).toBe(1);
    expect(s.scaleY()).toBe(1);
    expect(s.flying()).toBe(false);
  });
});
