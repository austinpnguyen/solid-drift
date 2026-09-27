import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createScrollColor,
  createScrollLine,
  createScrollTracking,
} from "./scrollfx.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createScrollColor", () => {
  it("interpolates hex stops in linear light", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const color = createScrollColor(
        [
          { at: 0, color: "#ff0000" },
          { at: 1, color: "#0000ff" },
        ],
        { progress: p },
      );
      setP(0);
      expect(color()).toBe("#ff0000");
      setP(1);
      expect(color()).toBe("#0000ff");
      // Linear-light midpoint: sRGB(0.735) per channel, not the muddy #800080
      // that naive channel math produces.
      setP(0.5);
      expect(color()).toBe("#bc00bc");
      dispose();
    });
  });

  it("clamps progress outside the stop range", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const color = createScrollColor(
        [
          { at: 0.2, color: "#ffffff" },
          { at: 0.8, color: "#000000" },
        ],
        { progress: p },
      );
      setP(0);
      expect(color()).toBe("#ffffff");
      setP(1);
      expect(color()).toBe("#000000");
      setP(-5);
      expect(color()).toBe("#ffffff");
      setP(42);
      expect(color()).toBe("#000000");
      dispose();
    });
  });

  it("sorts stops by position", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5);
      const color = createScrollColor(
        [
          { at: 1, color: "#000000" },
          { at: 0, color: "#ffffff" },
        ],
        { progress: p },
      );
      expect(color()).toBe("#bcbcbc");
      dispose();
    });
  });

  it("accepts rgb(), rgba(), hsl(), and named colors", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const color = createScrollColor(
        [
          { at: 0, color: "red" },
          { at: 1, color: "hsl(240, 100%, 50%)" },
        ],
        { progress: p },
      );
      setP(0);
      expect(color()).toBe("#ff0000");
      setP(1);
      expect(color()).toBe("#0000ff");

      const rgb = createScrollColor(
        [
          { at: 0, color: "rgb(255, 0, 0)" },
          { at: 1, color: "rgb(0, 0, 255)" },
        ],
        { progress: p },
      );
      setP(0.5);
      expect(rgb()).toBe("#bc00bc");
      dispose();
    });
  });

  it("interpolates alpha and emits 8-digit hex when not opaque", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5);
      const color = createScrollColor(
        [
          { at: 0, color: "rgba(255, 0, 0, 0)" },
          { at: 1, color: "rgba(255, 0, 0, 1)" },
        ],
        { progress: p },
      );
      expect(color()).toBe("#ff000080");
      setP(1);
      expect(color()).toBe("#ff0000");
      dispose();
    });
  });

  it("supports multi-stop sequences with per-segment easing", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.25);
      const eased = createScrollColor(
        [
          { at: 0, color: "#000000" },
          { at: 0.5, color: "#ffffff", easing: "easeOutCubic" },
          { at: 1, color: "#ffffff" },
        ],
        { progress: p },
      );
      // easeOutCubic(0.5) = 0.875 through the first segment.
      expect(eased()).toBe("#f0f0f0");

      const plain = createScrollColor(
        [
          { at: 0, color: "#000000" },
          { at: 0.5, color: "#ffffff" },
          { at: 1, color: "#ffffff" },
        ],
        { progress: p },
      );
      expect(plain()).toBe("#bcbcbc");
      dispose();
    });
  });

  it("supports rgb and hsl output formats", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5);
      const stops = [
        { at: 0, color: "#000000" },
        { at: 1, color: "#ff0000" },
      ];
      const rgb = createScrollColor(stops, { progress: p, format: "rgb" });
      expect(rgb()).toBe("rgb(188, 0, 0)");
      const hsl = createScrollColor(stops, { progress: p, format: "hsl" });
      expect(hsl()).toBe("hsl(0, 100%, 37%)");
      dispose();
    });
  });

  it("emits rgba()/hsla() output when alpha is present", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5);
      const stops = [
        { at: 0, color: "rgba(255, 0, 0, 0)" },
        { at: 1, color: "rgba(255, 0, 0, 1)" },
      ];
      const rgb = createScrollColor(stops, { progress: p, format: "rgb" });
      expect(rgb()).toBe("rgba(255, 0, 0, 0.5)");
      const hsl = createScrollColor(stops, { progress: p, format: "hsl" });
      expect(hsl()).toBe("hsla(0, 100%, 50%, 0.5)");
      dispose();
    });
  });

  it("throws on an empty stop list", () => {
    expect(() => createScrollColor([])).toThrow();
  });

  it("throws on an unparseable color", () => {
    expect(() =>
      createScrollColor([
        { at: 0, color: "not-a-color" },
        { at: 1, color: "#000000" },
      ]),
    ).toThrow();
  });

  it("holds the final stop color under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const color = createScrollColor(
        [
          { at: 0, color: "#ff0000" },
          { at: 1, color: "#0000ff" },
        ],
        { progress: p },
      );
      expect(color()).toBe("#0000ff");
      setP(1);
      expect(color()).toBe("#0000ff");
      dispose();
    });
  });

  it("uses whole-page progress by default without a window", () => {
    // In a server-like environment (no window) the default progress is
    // constant 0, so the color is the first stop.
    const color = createScrollColor([
      { at: 0, color: "#ff0000" },
      { at: 1, color: "#0000ff" },
    ]);
    expect(color()).toBe("#ff0000");
  });
});

describe("createScrollTracking", () => {
  it("maps progress to letter-spacing", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const tracking = createScrollTracking({ progress: p });
      setP(0);
      expect(tracking()).toBe("0.3em");
      setP(0.5);
      expect(tracking()).toBe("0.15em");
      setP(1);
      expect(tracking()).toBe("0em");
      dispose();
    });
  });

  it("respects from/to, px units, and easing", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5);
      const tracking = createScrollTracking({
        progress: p,
        from: 0,
        to: 20,
        unit: "px",
        easing: "easeOutCubic",
      });
      // easeOutCubic(0.5) = 0.875
      expect(tracking()).toBe("17.5px");
      dispose();
    });
  });

  it("clamps progress outside 0 to 1", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const tracking = createScrollTracking({
        progress: p,
        from: 0.1,
        to: 0.5,
        unit: "px",
      });
      setP(-1);
      expect(tracking()).toBe("0.1px");
      setP(2);
      expect(tracking()).toBe("0.5px");
      dispose();
    });
  });

  it("holds the final tracking under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const tracking = createScrollTracking({ progress: p });
      expect(tracking()).toBe("0em");
      setP(1);
      expect(tracking()).toBe("0em");
      dispose();
    });
  });

  it("uses whole-page progress by default without a window", () => {
    const tracking = createScrollTracking();
    expect(tracking()).toBe("0.3em");
  });
});

describe("createScrollLine", () => {
  it("reveals a horizontal line from the left by default", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const line = createScrollLine({ progress: p });
      setP(0);
      expect(line()).toEqual({
        transform: "scaleX(0)",
        transformOrigin: "left",
      });
      setP(0.4);
      expect(line()).toEqual({
        transform: "scaleX(0.4)",
        transformOrigin: "left",
      });
      setP(1);
      expect(line()).toEqual({
        transform: "scaleX(1)",
        transformOrigin: "left",
      });
      dispose();
    });
  });

  it("supports the y axis with a custom origin", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5);
      const line = createScrollLine({ progress: p, axis: "y", origin: "end" });
      expect(line()).toEqual({
        transform: "scaleY(0.5)",
        transformOrigin: "bottom",
      });
      dispose();
    });
  });

  it("supports center origin and custom from/to", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const line = createScrollLine({
        progress: p,
        origin: "center",
        from: 0.2,
        to: 0.8,
      });
      setP(0);
      expect(line()).toEqual({
        transform: "scaleX(0.2)",
        transformOrigin: "center",
      });
      setP(1);
      expect(line()).toEqual({
        transform: "scaleX(0.8)",
        transformOrigin: "center",
      });
      dispose();
    });
  });

  it("applies easing to the progress", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5);
      const line = createScrollLine({ progress: p, easing: "easeOutCubic" });
      // easeOutCubic(0.5) = 0.875
      expect(line().transform).toBe("scaleX(0.875)");
      dispose();
    });
  });

  it("holds the fully revealed line under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    createRoot((dispose) => {
      const [p, setP] = createSignal(0);
      const line = createScrollLine({ progress: p });
      expect(line()).toEqual({
        transform: "scaleX(1)",
        transformOrigin: "left",
      });
      setP(1);
      expect(line().transform).toBe("scaleX(1)");
      dispose();
    });
  });

  it("uses whole-page progress by default without a window", () => {
    const line = createScrollLine();
    expect(line()).toEqual({
      transform: "scaleX(0)",
      transformOrigin: "left",
    });
  });
});
