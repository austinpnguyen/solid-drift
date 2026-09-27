import { describe, expect, it, vi, afterEach } from "vitest";
import { createRoot } from "solid-js";
import { createSkeleton, type SkeletonControls, type SkeletonOptions } from "./skeleton.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const stubWindow = (reducedMotion = false): void => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: reducedMotion }),
  });
};

/** rAF stub that also advances the fake-timer clock the engine reads. */
const stubRaf = (): { advance: (ms: number) => void } => {
  let cb: (() => void) | null = null;
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    cb = fn;
    return 1;
  });
  return {
    advance: (ms: number) => {
      vi.advanceTimersByTime(ms);
      const fn = cb;
      cb = null;
      fn?.();
    },
  };
};

const owned = (
  options?: SkeletonOptions,
): { sk: SkeletonControls; dispose: () => void } => {
  let sk!: SkeletonControls;
  const dispose = createRoot((d) => {
    sk = createSkeleton(options ?? {});
    return d;
  });
  return { sk, dispose };
};

describe("createSkeleton", () => {
  it("shows after the delay, not before", async () => {
    stubWindow();
    const { sk, dispose } = owned({ delay: 30 });
    sk.setLoading(true);
    expect(sk.loading()).toBe(true);
    expect(sk.show()).toBe(false);
    await sleep(10);
    expect(sk.show()).toBe(false);
    await sleep(40);
    expect(sk.show()).toBe(true);
    dispose();
  });

  it("never shows when loading finishes before the delay", async () => {
    stubWindow();
    const { sk, dispose } = owned({ delay: 40 });
    sk.setLoading(true);
    await sleep(10);
    sk.setLoading(false);
    await sleep(60);
    expect(sk.show()).toBe(false);
    expect(sk.loading()).toBe(false);
    dispose();
  });

  it("stays visible for minVisible after loading ends", async () => {
    stubWindow();
    const { sk, dispose } = owned({ delay: 10, minVisible: 80 });
    sk.setLoading(true);
    await sleep(30);
    expect(sk.show()).toBe(true);
    sk.setLoading(false);
    await sleep(30);
    expect(sk.show()).toBe(true); // minVisible not elapsed yet
    await sleep(60);
    expect(sk.show()).toBe(false);
    dispose();
  });

  it("a second setLoading(true) cancels a pending hide", async () => {
    stubWindow();
    const { sk, dispose } = owned({ delay: 10, minVisible: 80 });
    sk.setLoading(true);
    await sleep(30);
    sk.setLoading(false);
    sk.setLoading(true);
    await sleep(100);
    expect(sk.show()).toBe(true);
    dispose();
  });

  it("sweeps the shimmer phase while shown", () => {
    vi.useFakeTimers();
    stubWindow();
    const raf = stubRaf();
    const { sk, dispose } = owned({ delay: 50, shimmerDuration: 1000 });
    sk.setLoading(true);
    vi.advanceTimersByTime(50);
    expect(sk.show()).toBe(true);
    raf.advance(0);
    expect(sk.phase()).toBe(0);
    raf.advance(250);
    expect(sk.phase()).toBeCloseTo(0.25, 2);
    raf.advance(250);
    expect(sk.phase()).toBeCloseTo(0.5, 2);
    sk.setLoading(false);
    expect(sk.show()).toBe(false);
    expect(sk.phase()).toBe(0);
    raf.advance(0); // flush the engine
    dispose();
  });

  it("freezes the shimmer under reduced motion", () => {
    vi.useFakeTimers();
    stubWindow(true);
    stubRaf();
    const { sk, dispose } = owned({ delay: 0 });
    sk.setLoading(true);
    expect(sk.show()).toBe(true);
    expect(sk.phase()).toBe(0);
    dispose();
  });

  it("never shows on the server", async () => {
    const { sk, dispose } = owned({ delay: 10 });
    sk.setLoading(true);
    await sleep(30);
    expect(sk.show()).toBe(false);
    dispose();
  });
});
