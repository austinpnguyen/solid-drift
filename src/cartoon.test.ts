import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal, type Accessor } from "solid-js";
import {
  createAnticipation,
  createFollowThrough,
  createSquashStretch,
  createWobble,
} from "./cartoon.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test.
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

describe("createSquashStretch", () => {
  function setup() {
    let scaleX!: Accessor<number>;
    let scaleY!: Accessor<number>;
    let setS!: (n: number) => void;
    const dispose = createRoot((d) => {
      const [s, _setS] = createSignal(0);
      setS = _setS;
      ({ scaleX, scaleY } = createSquashStretch(() => null, { source: s }));
      return d;
    });
    return { scaleX, scaleY, setS, dispose };
  }

  it("stretches along the motion axis while moving fast", () => {
    const b = stubBrowser();
    const { scaleX, scaleY, setS, dispose } = setup();
    // Ramp hard: ~30000 units/s, well past fullSpeed.
    for (let i = 1; i <= 12; i++) {
      setS(i * 500);
      b.frames(1);
    }
    expect(scaleX()).toBeGreaterThan(1.1);
    // Volume preservation shrinks the cross axis.
    expect(scaleY()).toBeLessThan(1);
    dispose();
  });

  it("relaxes back to 1 at rest", () => {
    const b = stubBrowser();
    const { scaleX, scaleY, setS, dispose } = setup();
    for (let i = 1; i <= 12; i++) {
      setS(i * 500);
      b.frames(1);
    }
    b.frames(120);
    expect(scaleX()).toBeCloseTo(1, 2);
    expect(scaleY()).toBeCloseTo(1, 2);
    dispose();
  });

  it("squashes below 1 on a hard stop", () => {
    const b = stubBrowser();
    const { scaleX, setS, dispose } = setup();
    for (let i = 1; i <= 12; i++) {
      setS(i * 500);
      b.frames(1);
    }
    // Sudden stop: no more source changes, the loop keeps running.
    // The squash dip is brief, so scan for it instead of sampling once.
    let dipped = false;
    for (let i = 0; i < 24; i++) {
      b.frames(1);
      if (scaleX() < 0.999) dipped = true;
    }
    expect(dipped).toBe(true);
    b.frames(120);
    expect(scaleX()).toBeCloseTo(1, 2);
    dispose();
  });

  it("applies the deform through the CSS scale property", () => {
    const b = stubBrowser();
    const setProperty = vi.fn();
    let setS!: (n: number) => void;
    const dispose = createRoot((d) => {
      const [s, _setS] = createSignal(0);
      setS = _setS;
      createSquashStretch(() => ({ style: { setProperty } }) as never, {
        source: s,
      });
      return d;
    });
    for (let i = 1; i <= 6; i++) {
      setS(i * 500);
      b.frames(1);
    }
    expect(setProperty).toHaveBeenCalledWith(
      "scale",
      expect.stringMatching(/^1\.\d+ \d\.\d+$/),
    );
    dispose();
  });

  it("returns constant 1 on the server and under reduced motion", () => {
    createRoot((dispose) => {
      const [s] = createSignal(5);
      const r = createSquashStretch(() => null, { source: s });
      expect(r.scaleX()).toBe(1);
      expect(r.scaleY()).toBe(1);
      dispose();
    });
    stubBrowser({ reduced: true });
    const dispose = createRoot((d) => {
      const [s] = createSignal(5);
      const r = createSquashStretch(() => null, { source: s });
      expect(r.scaleX()).toBe(1);
      expect(r.scaleY()).toBe(1);
      return d;
    });
    dispose();
  });
});

describe("createFollowThrough", () => {
  it("chains followers that lag behind the leader, then catch up", () => {
    const b = stubBrowser();
    let followers!: Accessor<number>[];
    let setS!: (n: number) => void;
    const dispose = createRoot((d) => {
      const [s, _setS] = createSignal(0);
      setS = _setS;
      followers = createFollowThrough(s, { links: 3, delayPerLink: 70 });
      return d;
    });
    expect(followers).toHaveLength(3);

    setS(100);
    b.frames(2);
    // Everyone lags at first; leader-side followers are ahead.
    expect(followers[0]()).toBeLessThan(100);
    expect(followers[0]()).toBeGreaterThanOrEqual(followers[2]());

    b.frames(400);
    for (const f of followers) expect(f()).toBeCloseTo(100, 1);
    dispose();
  });

  it("overshoots while catching up", () => {
    const b = stubBrowser();
    let f0!: Accessor<number>;
    let setS!: (n: number) => void;
    const dispose = createRoot((d) => {
      const [s, _setS] = createSignal(0);
      setS = _setS;
      [f0] = createFollowThrough(s, { links: 1 });
      return d;
    });
    setS(100);
    let max = -Infinity;
    for (let i = 0; i < 150; i++) {
      b.frames(1);
      max = Math.max(max, f0());
    }
    expect(max).toBeGreaterThan(101);
    dispose();
  });

  it("returns the source itself under reduced motion and on the server", () => {
    stubBrowser({ reduced: true });
    const dispose = createRoot((d) => {
      const [s] = createSignal(7);
      const followers = createFollowThrough(s, { links: 2 });
      expect(followers).toHaveLength(2);
      for (const f of followers) expect(f).toBe(s);
      return d;
    });
    dispose();
    createRoot((dispose2) => {
      const [s] = createSignal(7);
      const followers = createFollowThrough(s, { links: 2 });
      for (const f of followers) expect(f).toBe(s);
      dispose2();
    });
  });

  it("returns no followers for links: 0", () => {
    stubBrowser();
    const dispose = createRoot((d) => {
      const [s] = createSignal(0);
      expect(createFollowThrough(s, { links: 0 })).toHaveLength(0);
      return d;
    });
    dispose();
  });
});

describe("createAnticipation", () => {
  it("winds up opposite the travel direction before firing", async () => {
    const b = stubBrowser();
    const values: number[] = [];
    let completed = false;
    const ctl = createAnticipation(0, 200, {
      windupDuration: 140,
      holdDuration: 50,
      duration: 300,
      onUpdate: (v) => values.push(v),
      onComplete: () => {
        completed = true;
      },
    });
    b.frames(4); // mid-windup
    expect(Math.min(...values)).toBeLessThan(0);
    b.frames(40);
    await ctl.finished;
    expect(values[values.length - 1]).toBe(200);
    expect(completed).toBe(true);
  });

  it("stop() halts without calling onComplete", async () => {
    const b = stubBrowser();
    let completed = false;
    const ctl = createAnticipation(0, 200, {
      onComplete: () => {
        completed = true;
      },
    });
    b.frames(2);
    ctl.stop();
    await ctl.finished;
    expect(completed).toBe(false);
  });

  it("skips the windup under reduced motion", () => {
    stubBrowser({ reduced: true });
    const values: number[] = [];
    createAnticipation(0, 200, { onUpdate: (v) => values.push(v) });
    // animate() under reduced motion delivers the end value synchronously.
    expect(values).toEqual([200]);
  });
});

describe("createWobble", () => {
  function setup(ref?: () => Element | null | undefined) {
    let result!: ReturnType<typeof createWobble>;
    const dispose = createRoot((d) => {
      result = createWobble(ref, { rotation: 10, frequency: 5, decay: 0.45 });
      return d;
    });
    return { ...result, dispose };
  }

  it("oscillates after a kick, then parks at rest", () => {
    const b = stubBrowser();
    const { rotate, scaleX, scaleY, wobble, dispose } = setup();
    wobble();
    b.frames(3);
    expect(rotate()).not.toBe(0);
    expect(scaleX()).not.toBe(1);
    b.frames(300);
    expect(rotate()).toBe(0);
    expect(scaleX()).toBe(1);
    expect(scaleY()).toBe(1);
    dispose();
  });

  it("retriggering restarts the kick", () => {
    const b = stubBrowser();
    const { rotate, wobble, dispose } = setup();
    wobble(1);
    b.frames(300);
    expect(rotate()).toBe(0);
    wobble(-1);
    b.frames(3);
    expect(rotate()).not.toBe(0);
    dispose();
  });

  it("poking the element triggers a wobble", () => {
    const b = stubBrowser();
    const handlers = new Map<string, (e: unknown) => void>();
    const el = {
      addEventListener: (t: string, h: (e: unknown) => void) =>
        handlers.set(t, h),
      removeEventListener: (t: string) => handlers.delete(t),
    };
    const { rotate, dispose } = setup(() => el as never);
    handlers.get("pointerdown")?.({});
    b.frames(3);
    expect(rotate()).not.toBe(0);
    dispose();
  });

  it("is a no-op under reduced motion and on the server", () => {
    stubBrowser({ reduced: true });
    const { rotate, scaleX, wobble, dispose } = setup();
    wobble();
    expect(rotate()).toBe(0);
    expect(scaleX()).toBe(1);
    dispose();
    createRoot((d2) => {
      const r = createWobble();
      r.wobble();
      expect(r.rotate()).toBe(0);
      d2();
    });
  });
});
