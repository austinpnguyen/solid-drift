import { describe, it, expect } from "vitest";
import {
  clamp,
  mapRange,
  snap,
  snapTo,
  wrap,
  lerp,
  damp,
  random,
} from "./math.js";

describe("math utils", () => {
  it("clamp keeps values in range", () => {
    expect(clamp(0, 10, 5)).toBe(5);
    expect(clamp(0, 10, -5)).toBe(0);
    expect(clamp(0, 10, 15)).toBe(10);
  });

  it("clamp throws when min > max", () => {
    expect(() => clamp(10, 0, 5)).toThrow(/min.*must not exceed max/);
  });

  it("mapRange maps between ranges", () => {
    expect(mapRange(0, 1, 0, 100, 0.5)).toBe(50);
    expect(mapRange(0, 10, 100, 200, 5)).toBe(150);
    expect(mapRange(0, 0, 0, 100, 5)).toBe(0);
  });

  it("snap rounds to step", () => {
    expect(snap(10, 23)).toBe(20);
    expect(snap(10, 27)).toBe(30);
    expect(snap(0, 23)).toBe(23);
  });

  it("snapTo finds nearest point", () => {
    expect(snapTo([0, 100, 250], 90)).toBe(100);
    expect(snapTo([0, 100, 250], 200)).toBe(250);
    expect(snapTo([], 50)).toBe(50);
  });

  it("wrap cycles around", () => {
    expect(wrap(0, 3, 4)).toBe(1);
    expect(wrap(0, 3, -1)).toBe(2);
    expect(wrap(0, 3, 1.5)).toBe(1.5);
  });

  it("lerp interpolates", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 1)).toBe(100);
  });

  it("damp converges toward target", () => {
    let v = 0;
    for (let i = 0; i < 120; i++) {
      v = damp(v, 100, 6, 1 / 60);
    }
    // After 2s with lambda=6, should be within 1% of target.
    expect(Math.abs(v - 100)).toBeLessThan(1);
  });

  it("damp with dt=0 does not move", () => {
    expect(damp(10, 100, 6, 0)).toBe(10);
  });

  it("random stays in range", () => {
    for (let i = 0; i < 100; i++) {
      const v = random(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
    for (let i = 0; i < 100; i++) {
      const v = random(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });
});
