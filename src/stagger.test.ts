import { describe, expect, it } from "vitest";
import { createStagger } from "./stagger.js";

describe("createStagger", () => {
  it("returns index * delayMs", () => {
    const at = createStagger(5, 80);
    expect(at(0)).toBe(0);
    expect(at(1)).toBe(80);
    expect(at(2)).toBe(160);
    expect(at(4)).toBe(320);
  });

  it("supports a zero delay", () => {
    expect(createStagger(3, 0)(2)).toBe(0);
  });

  it("from last reverses the order", () => {
    const at = createStagger(5, 80, { from: "last" });
    expect(at(0)).toBe(320);
    expect(at(4)).toBe(0);
    expect(at(2)).toBe(160);
  });

  it("from center spreads outward", () => {
    const at = createStagger(5, 80, { from: "center" });
    expect(at(2)).toBe(0); // center
    expect(at(0)).toBe(160); // edge: dist 2 * 80
    expect(at(4)).toBe(160);
    expect(at(1)).toBe(80);
    expect(at(3)).toBe(80);
  });

  it("from number uses that index as origin", () => {
    const at = createStagger(5, 80, { from: 0 });
    expect(at(0)).toBe(0);
    expect(at(4)).toBe(320);
  });

  it("grid 3x3 from center: center 0, corners max", () => {
    const at = createStagger(9, 100, { grid: [3, 3], from: "center" });
    expect(at(4)).toBe(0); // center
    const corner = at(0); // corner dist sqrt(2) * 100
    expect(corner).toBeCloseTo(Math.SQRT2 * 100, 5);
    expect(at(8)).toBeCloseTo(corner, 5);
    // Edge middle should be less than corner.
    expect(at(1)).toBeLessThan(corner);
  });

  it("grid with axis x only measures horizontal distance", () => {
    const at = createStagger(9, 100, { grid: [3, 3], from: "center", axis: "x" });
    // Center column (indices 1, 4, 7) all have dist 0 in x.
    expect(at(1)).toBe(0);
    expect(at(4)).toBe(0);
    expect(at(7)).toBe(0);
    // Corners have dist 1.
    expect(at(0)).toBe(100);
  });

  it("out of range index returns 0", () => {
    const at = createStagger(5, 80);
    expect(at(-1)).toBe(0);
    expect(at(5)).toBe(0);
  });
});
