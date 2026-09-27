import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { createRoot as createRootType } from "solid-js";
import type {
  MarqueeControls,
  MarqueeOptions,
  createMarquee as createMarqueeType,
} from "./marquee.js";

// Fresh engine per test: the shared clock keeps module-level rAF state.
let createRoot: typeof createRootType;
let createMarquee: typeof createMarqueeType;
let fakeNow = 0;
let rafCb: ((t: number) => void) | null = null;

beforeEach(async () => {
  vi.resetModules();
  fakeNow = 0;
  rafCb = null;
  vi.stubGlobal("requestAnimationFrame", (fn: (t: number) => void) => {
    rafCb = fn;
    return 1;
  });
  vi.stubGlobal("performance", { now: () => fakeNow });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  ({ createRoot } = await import("solid-js"));
  ({ createMarquee } = await import("./marquee.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const step = (ms: number): void => {
  fakeNow += ms;
  const fn = rafCb;
  rafCb = null;
  fn?.(fakeNow);
};

/*
 * The marquee clamps per-frame dt (a background tab must not teleport the
 * strip), so long advances are split into 100ms frames like real rAF.
 */
const advance = (ms: number): void => {
  let left = ms;
  while (left > 0) {
    const chunk = Math.min(left, 100);
    step(chunk);
    left -= chunk;
  }
};

const owned = (
  options?: MarqueeOptions,
): { m: MarqueeControls; dispose: () => void } => {
  let m!: MarqueeControls;
  const dispose = createRoot((d) => {
    m = createMarquee(options);
    return d;
  });
  return { m, dispose };
};

describe("createMarquee", () => {
  it("advances the offset at speed and wraps at the content size", () => {
    const { m, dispose } = owned({ speed: 100 });
    m.setContentSize(200);
    expect(m.offset()).toBe(0);
    expect(m.running()).toBe(true);
    advance(1000);
    expect(m.offset()).toBe(100);
    advance(1000);
    expect(m.offset()).toBe(0); // wrapped
    advance(500);
    expect(m.offset()).toBe(50);
    m.stop();
    advance(0);
    dispose();
  });

  it("scrolls the other way for right/down", () => {
    const { m, dispose } = owned({ speed: 100, direction: "right" });
    m.setContentSize(200);
    advance(1000);
    expect(m.offset()).toBe(100); // (200 - 100) % 200
    advance(1000);
    expect(m.offset()).toBe(0);
    m.stop();
    advance(0);
    dispose();
  });

  it("stop halts the offset and start resumes", () => {
    const { m, dispose } = owned({ speed: 100, autoStart: false });
    m.setContentSize(1000);
    expect(m.running()).toBe(false);
    m.start();
    advance(1000);
    expect(m.offset()).toBe(100);
    m.stop();
    expect(m.running()).toBe(false);
    advance(1000);
    expect(m.offset()).toBe(100);
    m.start();
    advance(1000);
    expect(m.offset()).toBe(200);
    m.stop();
    advance(0);
    dispose();
  });

  it("stays static under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    const { m, dispose } = owned({ speed: 100 });
    m.setContentSize(200);
    advance(2000);
    expect(m.offset()).toBe(0);
    expect(m.running()).toBe(false);
    m.start();
    advance(1000);
    expect(m.offset()).toBe(0);
    dispose();
  });
});
