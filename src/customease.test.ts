import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import { createCustomEase } from "./customease.js";

describe("createCustomEase", () => {
  let window: Window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let document: any;

  beforeEach(() => {
    window = new Window();
    document = window.document;
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", document);
    // happy-dom has no geometry: mock per path data.
    const proto = (window as unknown as { SVGPathElement: { prototype: object } })
      .SVGPathElement.prototype as unknown as {
      getTotalLength: () => number;
      getPointAtLength: (d: number) => { x: number; y: number };
    };
    proto.getTotalLength = function (this: SVGPathElement) {
      const d = this.getAttribute("d") ?? "";
      if (d === "THROW") throw new Error("boom");
      return 2;
    };
    proto.getPointAtLength = function (this: SVGPathElement, dist: number) {
      const d = this.getAttribute("d") ?? "";
      const t = dist / 2; // 0..1
      if (d === "M0,0 L1,1") return { x: t, y: t };
      if (d === "CURVE") return { x: t, y: t * t };
      if (d === "LOOP") return { x: t < 0.5 ? t * 2 : 2 - t * 2, y: t };
      return { x: t, y: t };
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("linear path gives identity", () => {
    const ease = createCustomEase("M0,0 L1,1");
    expect(ease(0)).toBeCloseTo(0, 3);
    expect(ease(0.25)).toBeCloseTo(0.25, 3);
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
    expect(ease(0.75)).toBeCloseTo(0.75, 3);
    expect(ease(1)).toBeCloseTo(1, 3);
  });

  it("samples are monotonic for a monotonic curve", () => {
    const ease = createCustomEase("CURVE");
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = ease(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    // y = x^2 shape: ease(0.5) ~ 0.25
    expect(ease(0.5)).toBeCloseTo(0.25, 2);
  });

  it("throws for non-monotonic x", () => {
    expect(() => createCustomEase("LOOP")).toThrow("monotonically");
  });

  it("throws for invalid path data", () => {
    expect(() => createCustomEase("THROW")).toThrow("invalid path data");
  });

  it("clamps input outside 0..1", () => {
    const ease = createCustomEase("M0,0 L1,1");
    expect(ease(-1)).toBeCloseTo(0, 3);
    expect(ease(2)).toBeCloseTo(1, 3);
  });

  it("returns a function usable as Easing", () => {
    const ease = createCustomEase("M0,0 L1,1");
    expect(typeof ease).toBe("function");
    expect(ease.length).toBe(1);
  });
});
