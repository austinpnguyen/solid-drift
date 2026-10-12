import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import { createMotionPath } from "./motionpath.js";

// Straight horizontal path from (0,0) to (200,0): point at distance d.
function linePointAt(d: number) {
  return { x: d, y: 0 };
}

describe("createMotionPath", () => {
  let window: Window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let document: any;

  function makeTarget() {
    const el = document.createElement("div");
    // Mock size for align:"center".
    el.getBoundingClientRect = () => ({
      width: 40,
      height: 20,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 40,
      bottom: 20,
      toJSON: () => ({}),
    });
    return el as HTMLElement;
  }

  beforeEach(() => {
    window = new Window();
    document = window.document;
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", document);
    // Mock SVG geometry on the prototype.
    const proto = (window as unknown as { SVGPathElement: { prototype: object } })
      .SVGPathElement.prototype as unknown as {
      getTotalLength: () => number;
      getPointAtLength: (d: number) => { x: number; y: number };
    };
    proto.getTotalLength = () => 200;
    proto.getPointAtLength = (d: number) => linePointAt(d);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves the element through path milestones", () => {
    const el = makeTarget();
    const mp = createMotionPath(() => el, {
      path: "M0,0 L200,0",
      align: "top-left",
    });

    mp.seek(0);
    expect(el.style.transform).toContain("translate(0.00px, 0.00px)");
    mp.seek(0.25);
    expect(el.style.transform).toContain("translate(50.00px, 0.00px)");
    mp.seek(0.5);
    expect(el.style.transform).toContain("translate(100.00px, 0.00px)");
    mp.seek(0.75);
    expect(el.style.transform).toContain("translate(150.00px, 0.00px)");
    mp.seek(1);
    expect(el.style.transform).toContain("translate(200.00px, 0.00px)");
    expect(mp.progress()).toBe(1);
  });

  it('align "center" offsets by half the element size', () => {
    const el = makeTarget();
    const mp = createMotionPath(() => el, {
      path: "M0,0 L200,0",
      align: "center",
    });
    mp.seek(0.5);
    // (100,0) minus half of 40x20.
    expect(el.style.transform).toContain("translate(80.00px, -10.00px)");
  });

  it("autoRotate follows the tangent", () => {
    const el = makeTarget();
    const mp = createMotionPath(() => el, {
      path: "M0,0 L200,0",
      align: "top-left",
      autoRotate: true,
    });
    mp.seek(0.5);
    // Horizontal path: tangent angle 0deg.
    expect(el.style.transform).toContain("rotate(0.00deg)");
  });

  it("autoRotate accepts a degree offset", () => {
    const el = makeTarget();
    const mp = createMotionPath(() => el, {
      path: "M0,0 L200,0",
      align: "top-left",
      autoRotate: 90,
    });
    mp.seek(0.5);
    expect(el.style.transform).toContain("rotate(90.00deg)");
  });

  it("no rotate when autoRotate is false", () => {
    const el = makeTarget();
    const mp = createMotionPath(() => el, {
      path: "M0,0 L200,0",
      align: "top-left",
    });
    mp.seek(0.5);
    expect(el.style.transform).not.toContain("rotate");
  });

  it("throws on invalid path data", () => {
    const el = makeTarget();
    const proto = (window as unknown as { SVGPathElement: { prototype: object } })
      .SVGPathElement.prototype as unknown as { getTotalLength: () => number };
    proto.getTotalLength = () => 0;
    const mp = createMotionPath(() => el, { path: "M0,0 L200,0" });
    expect(() => mp.seek(0)).toThrow("invalid path data");
  });

  it("throws when path element is null", () => {
    const el = makeTarget();
    const mp = createMotionPath(() => el, { path: () => null });
    expect(() => mp.seek(0)).toThrow("path element is null");
  });

  it("play() jumps to the end under reduced motion", async () => {
    vi.stubGlobal("window", {
      ...window,
      matchMedia: () => ({ matches: true }),
    });
    vi.stubGlobal("document", document);
    const el = makeTarget();
    const mp = createMotionPath(() => el, {
      path: "M0,0 L200,0",
      align: "top-left",
    });
    await mp.play();
    expect(mp.progress()).toBe(1);
    expect(el.style.transform).toContain("translate(200.00px, 0.00px)");
  });
});
