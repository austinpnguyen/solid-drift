import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { createRoot as createRootType } from "solid-js";
import type {
  PathDrawControls,
  PathDrawOptions,
  createPathDraw as createPathDrawType,
} from "./pathdraw.js";

// Fresh engine per test: the shared clock keeps module-level rAF state.
let createRoot: typeof createRootType;
let createPathDraw: typeof createPathDrawType;
let fakeNow = 0;
let rafCb: ((t: number) => void) | null = null;

interface PathStub {
  getTotalLength: () => number;
  style: Record<string, string>;
}

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
  ({ createPathDraw } = await import("./pathdraw.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const advance = (ms: number): void => {
  fakeNow += ms;
  const fn = rafCb;
  rafCb = null;
  fn?.(fakeNow);
};

const makePath = (): PathStub => ({
  getTotalLength: () => 100,
  style: {},
});

const owned = (
  path: PathStub,
  options?: PathDrawOptions,
): { d: PathDrawControls; dispose: () => void } => {
  let d!: PathDrawControls;
  const dispose = createRoot((root) => {
    d = createPathDraw(
      () => path as unknown as SVGPathElement,
      options,
    );
    return root;
  });
  return { d, dispose };
};

describe("createPathDraw", () => {
  it("draws the stroke via dashoffset and finishes at 1", () => {
    const onDone = vi.fn();
    const path = makePath();
    const { d, dispose } = owned(path, { duration: 1000, onDone });
    expect(d.running()).toBe(true);
    expect(d.progress()).toBe(0);
    advance(500);
    const mid = d.progress();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(path.style.strokeDasharray).toBe("100");
    expect(Number(path.style.strokeDashoffset)).toBeGreaterThan(0);
    advance(500);
    expect(d.progress()).toBe(1);
    expect(d.running()).toBe(false);
    expect(path.style.strokeDashoffset).toBe("0");
    expect(onDone).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(onDone).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("stop halts and start resumes from the current progress", () => {
    const path = makePath();
    const { d, dispose } = owned(path, { duration: 1000, autoStart: false });
    d.start();
    advance(400);
    const mid = d.progress();
    d.stop();
    expect(d.running()).toBe(false);
    advance(600);
    expect(d.progress()).toBe(mid);
    d.start();
    // Resume keeps a constant speed: 74.4% left takes 744ms.
    advance(744);
    expect(d.progress()).toBe(1);
    expect(d.running()).toBe(false);
    dispose();
  });

  it("reset returns to undrawn", () => {
    const path = makePath();
    const { d, dispose } = owned(path, { duration: 1000 });
    advance(1000);
    expect(d.progress()).toBe(1);
    d.reset();
    expect(d.progress()).toBe(0);
    expect(path.style.strokeDashoffset).toBe("100");
    expect(d.running()).toBe(false);
    d.start();
    advance(1000);
    expect(d.progress()).toBe(1);
    dispose();
  });

  it("renders fully drawn under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    const onDone = vi.fn();
    const path = makePath();
    const { d, dispose } = owned(path, { duration: 1000, onDone });
    expect(d.progress()).toBe(1);
    expect(d.running()).toBe(false);
    expect(path.style.strokeDashoffset).toBe("0");
    expect(onDone).toHaveBeenCalledTimes(1);
    dispose();
  });
});
