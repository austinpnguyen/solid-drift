import { describe, expect, it } from "vitest";
import {
  easeInBack,
  easeInOutBack,
  easeOutBounce,
  easeOutElastic,
  easings,
  resolveEasing,
} from "./easing.js";

describe("cartoon easings", () => {
  it("easeInBack dips below zero before moving", () => {
    expect(easeInBack(0)).toBe(0);
    expect(easeInBack(1)).toBeCloseTo(1, 6);
    expect(easeInBack(0.4)).toBeLessThan(0);
  });

  it("easeInOutBack winds up, overshoots, and lands on 1", () => {
    expect(easeInOutBack(0)).toBeCloseTo(0, 10);
    expect(easeInOutBack(1)).toBeCloseTo(1, 6);
    expect(easeInOutBack(0.2)).toBeLessThan(0);
    expect(easeInOutBack(0.8)).toBeGreaterThan(1);
  });

  it("easeOutElastic oscillates with decaying overshoot", () => {
    expect(easeOutElastic(0)).toBe(0);
    expect(easeOutElastic(1)).toBe(1);
    let max = -Infinity;
    for (let i = 1; i < 100; i++) max = Math.max(max, easeOutElastic(i / 100));
    expect(max).toBeGreaterThan(1.1);
    expect(easeOutElastic(0.99)).toBeCloseTo(1, 1);
  });

  it("easeOutBounce bounces inside 0..1", () => {
    expect(easeOutBounce(0)).toBe(0);
    expect(easeOutBounce(1)).toBeCloseTo(1, 6);
    for (let i = 0; i <= 100; i++) {
      const v = easeOutBounce(i / 100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // It visibly bounces: not monotonic on the way down.
    expect(easeOutBounce(0.4)).toBeGreaterThan(easeOutBounce(0.5));
  });

  it("is registered under its names and resolvable", () => {
    for (const name of [
      "easeInBack",
      "easeInOutBack",
      "easeOutElastic",
      "easeOutBounce",
    ] as const) {
      expect(easings[name]).toBeTypeOf("function");
      expect(resolveEasing(name)).toBe(easings[name]);
    }
  });
});
