import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { createRoot as createRootType } from "solid-js";
import type {
  VariantDef,
  VariantsControls,
  VariantsOptions,
  createVariants as createVariantsType,
} from "./variants.js";

// Fresh engine per test: the shared clock keeps module-level rAF state.
let createRoot: typeof createRootType;
let createVariants: typeof createVariantsType;
let fakeNow = 0;
let rafCb: ((t: number) => void) | null = null;

const defs: Record<string, VariantDef> = {
  idle: { scale: 1, opacity: 1, label: "idle" },
  hover: { scale: 1.05, opacity: 1, label: "hover" },
  press: { scale: 0.95, opacity: 0.5, label: "press" },
};

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
  ({ createVariants } = await import("./variants.js"));
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

const owned = (
  options?: VariantsOptions,
): { v: VariantsControls; dispose: () => void } => {
  let v!: VariantsControls;
  const dispose = createRoot((d) => {
    v = createVariants(defs, options);
    return d;
  });
  return { v, dispose };
};

describe("createVariants", () => {
  it("starts at the initial variant", () => {
    const { v, dispose } = owned({ initial: "idle" });
    expect(v.current()).toBe("idle");
    expect(v.values().scale).toBe(1);
    expect(v.values().label).toBe("idle");
    dispose();
  });

  it("tweens numeric props and snaps the rest at the end", () => {
    const { v, dispose } = owned({ initial: "idle", duration: 200 });
    v.go("press");
    expect(v.current()).toBe("press");
    advance(100); // halfway: 1 -> 0.95 with easeOutCubic
    const mid = v.values().scale as number;
    expect(mid).toBeGreaterThan(0.95);
    expect(mid).toBeLessThan(1);
    expect(v.values().label).toBe("idle"); // not snapped yet
    advance(100);
    expect(v.values().scale).toBe(0.95);
    expect(v.values().opacity).toBe(0.5);
    expect(v.values().label).toBe("press"); // snapped at the end
    dispose();
  });

  it("interrupts an in-flight transition", () => {
    const { v, dispose } = owned({ initial: "idle", duration: 1000 });
    v.go("press");
    advance(500);
    const midScale = v.values().scale as number;
    expect(midScale).toBeLessThan(1);
    v.go("hover"); // retargets from the current values
    advance(1000);
    expect(v.values().scale).toBe(1.05);
    expect(v.values().label).toBe("hover");
    dispose();
  });

  it("ignores unknown variant names", () => {
    const { v, dispose } = owned({ initial: "idle", duration: 200 });
    v.go("nope");
    expect(v.current()).toBe("idle");
    expect(v.values().scale).toBe(1);
    dispose();
  });

  it("snaps instantly under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    const { v, dispose } = owned({ initial: "idle", duration: 1000 });
    v.go("press");
    expect(v.values().scale).toBe(0.95);
    expect(v.values().label).toBe("press");
    dispose();
  });
});
