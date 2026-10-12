import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import { createMorph } from "./morph.js";

// Point at distance d along a square perimeter (origin ox,oy, side 100).
function squarePointAt(ox: number, oy: number) {
  return (d: number) => {
    const dist = ((d % 400) + 400) % 400;
    if (dist < 100) return { x: ox + dist, y: oy };
    if (dist < 200) return { x: ox + 100, y: oy + (dist - 100) };
    if (dist < 300) return { x: ox + 100 - (dist - 200), y: oy + 100 };
    return { x: ox, y: oy + 100 - (dist - 300) };
  };
}

describe("createMorph", () => {
  let window: Window;
  let document: Document;

  function makePath(d: string) {
    const p = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    ) as unknown as SVGPathElement;
    p.setAttribute("d", d);
    p.setAttribute("fill", "#ff0000");
    return p;
  }

  beforeEach(() => {
    window = new Window();
    document = window.document;
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", document);
    vi.stubGlobal("NodeFilter", window.NodeFilter);
    // happy-dom has no geometry engine: mock it on the prototype,
    // dispatching on path data. Paths starting "M50" are the translated
    // target square; "THROW"/"ZERO" simulate broken paths.
    const proto = (window as unknown as { SVGPathElement: { prototype: SVGPathElement } })
      .SVGPathElement.prototype as unknown as {
      getTotalLength: () => number;
      getPointAtLength: (d: number) => { x: number; y: number };
    };
    proto.getTotalLength = function (this: SVGPathElement) {
      const d = this.getAttribute("d") ?? "";
      if (d === "THROW") throw new Error("boom");
      if (d === "ZERO") return 0;
      return 400;
    };
    proto.getPointAtLength = function (this: SVGPathElement, dist: number) {
      const d = this.getAttribute("d") ?? "";
      const o = d.startsWith("M50") ? 50 : 0;
      return squarePointAt(o, o)(dist);
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("interpolates points between source and target", () => {
    const el = makePath("M0,0 L100,0 L100,100 L0,100 Z");
    // Target square translated by (50,50). Same d shape, geometry mocked.
    const morph = createMorph(() => el, {
      to: "M50,50 L150,50 L150,150 L50,150 Z",
      points: 4,
    });

    morph.seek(0);
    expect(el.getAttribute("d")).toContain("0.00,0.00");

    morph.seek(0.5);
    // Midpoint of (0,0)->(50,50) is (25,25), etc.
    const d = el.getAttribute("d")!;
    expect(d).toContain("25.00,25.00");
    expect(d).toContain("125.00,25.00");
    expect(d).toContain("125.00,125.00");
    expect(d).toContain("25.00,125.00");
    expect(d.endsWith("Z")).toBe(true);
    expect(morph.progress()).toBe(0.5);

    morph.seek(1);
    expect(el.getAttribute("d")).toContain("50.00,50.00");
    expect(morph.progress()).toBe(1);
  });

  it("clamps seek outside 0..1", () => {
    const el = makePath("M0,0 L100,0 L100,100 L0,100 Z");
    const morph = createMorph(() => el, {
      to: "M50,50 L150,50 L150,150 L50,150 Z",
      points: 4,
    });
    morph.seek(-5);
    expect(morph.progress()).toBe(0);
    morph.seek(99);
    expect(morph.progress()).toBe(1);
  });

  it("interpolates fill color when target fill differs", () => {
    const el = makePath("M0,0 L100,0 L100,100 L0,100 Z");
    const morph = createMorph(() => el, {
      to: "M50,50 L150,50 L150,150 L50,150 Z",
      points: 4,
      fill: "#0000ff",
    });
    morph.seek(0.5);
    const fill = el.getAttribute("fill")!;
    // Midpoint of red->blue in linear space, formatted hex.
    expect(fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(fill).not.toBe("#ff0000");
    expect(fill).not.toBe("#0000ff");
  });

  it("throws a clear error for invalid path data", () => {
    const el = makePath("THROW");
    const morph = createMorph(() => el, { to: "M0,0 Z", points: 4 });
    expect(() => morph.seek(0.5)).toThrow("invalid path data");
  });

  it("throws a clear error for zero-length paths", () => {
    const el = makePath("ZERO");
    const morph = createMorph(() => el, { to: "M0,0 Z", points: 4 });
    expect(() => morph.seek(0)).toThrow("invalid path data");
  });

  it("throws when the path element is null", () => {
    const morph = createMorph(() => null, {
      to: "M0,0 L10,0 L10,10 L0,10 Z",
    });
    expect(() => morph.seek(0)).toThrow("path element is null");
  });

  it("play() jumps to the end under reduced motion", async () => {
    vi.stubGlobal("window", {
      ...window,
      matchMedia: () => ({ matches: true }),
    });
    // document stub still needed
    vi.stubGlobal("document", document);
    const el = makePath("M0,0 L100,0 L100,100 L0,100 Z");
    const morph = createMorph(() => el, {
      to: "M50,50 L150,50 L150,150 L50,150 Z",
      points: 4,
    });
    await morph.play();
    expect(morph.progress()).toBe(1);
    expect(el.getAttribute("d")).toContain("50.00,50.00");
  });
});
