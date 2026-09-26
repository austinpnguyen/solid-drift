import { afterEach, describe, expect, it, vi } from "vitest";
import { animateFlip } from "./flip.js";

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
