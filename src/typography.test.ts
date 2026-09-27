import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal, type Accessor } from "solid-js";
import {
  createFontSwap,
  createTextCutout,
  createTextGradient,
  createTextPhysics,
  createTextScramble,
  createTextTunnel,
  createTextWave,
  createTyping,
  createCountUp,
} from "./typography.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test.
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];

function stubBrowser(opts: { reduced?: boolean } = {}) {
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });

  return {
    frames(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
      }
    },
  };
}

/** Minimal DOM stand-in: just enough for the text-splitting helpers. */
class FakeSpan {
  private _text: string | null = "";
  style: Record<string, string> = {};
  attrs = new Map<string, string>();
  children: FakeSpan[] = [];

  get textContent(): string | null {
    return this._text;
  }
  set textContent(v: string | null) {
    this._text = v ?? "";
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  appendChild(c: FakeSpan) {
    this.children.push(c);
    return c;
  }
}

class FakeElement extends FakeSpan {
  handlers = new Map<string, () => void>();
  ownerDocument = { createElement: () => new FakeSpan() };

  override get textContent(): string | null {
    return super.textContent;
  }
  override set textContent(v: string | null) {
    super.textContent = v;
    this.children = [];
  }
  addEventListener(t: string, h: () => void) {
    this.handlers.set(t, h);
  }
  removeEventListener(t: string) {
    this.handlers.delete(t);
  }
  fire(t: string) {
    this.handlers.get(t)?.();
  }
}

function textOf(el: FakeElement): string {
  return el.children.map((c) => c.textContent ?? "").join("");
}

describe("createFontSwap", () => {
  it("rolls each letter into the new font", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "Hi";
    let result!: ReturnType<typeof createFontSwap>;
    const dispose = createRoot((d) => {
      result = createFontSwap(() => el as unknown as Element, {
        to: "serif",
        duration: 30,
        stagger: 5,
      });
      return d;
    });
    expect(el.children).toHaveLength(2);

    result.swap(true);
    expect(result.swapped()).toBe(true);
    b.frames(30);
    for (const c of el.children) {
      expect(c.style.fontFamily).toBe("serif");
      expect(c.style.transform ?? "").toBe("");
    }
    result.swap(false);
    b.frames(30);
    for (const c of el.children) {
      expect(c.style.fontFamily).toBe("");
    }
    expect(result.swapped()).toBe(false);
    dispose();
  });

  it("swaps on hover events", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "Hi";
    let result!: ReturnType<typeof createFontSwap>;
    const dispose = createRoot((d) => {
      result = createFontSwap(() => el as unknown as Element, {
        to: "serif",
        duration: 30,
      });
      return d;
    });
    el.fire("pointerenter");
    b.frames(20);
    expect(el.children[0].style.fontFamily).toBe("serif");
    el.fire("pointerleave");
    b.frames(20);
    expect(el.children[0].style.fontFamily).toBe("");
    expect(result.swapped()).toBe(false);
    dispose();
  });

  it("swaps instantly under reduced motion", () => {
    stubBrowser({ reduced: true });
    const el = new FakeElement();
    el.textContent = "Hi";
    let result!: ReturnType<typeof createFontSwap>;
    const dispose = createRoot((d) => {
      result = createFontSwap(() => el as unknown as Element, { to: "serif" });
      return d;
    });
    result.swap(true);
    expect(el.children[0].style.fontFamily).toBe("serif");
    expect(result.swapped()).toBe(true);
    dispose();
  });
});

describe("createTyping", () => {
  it("types characters with per-character timing", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "Hey.";
    let result!: ReturnType<typeof createTyping>;
    const dispose = createRoot((d) => {
      result = createTyping(() => el as unknown as Element, {
        speed: 30,
        variance: 0,
        autostart: false,
      });
      return d;
    });
    result.start();
    expect(result.typing()).toBe(true);
    b.frames(2);
    expect(el.children[0].textContent).toBe("H");
    b.frames(1);
    expect(el.children[0].textContent).toBe("He");
    b.frames(120);
    expect(el.children[0].textContent).toBe("Hey.");
    expect(result.typing()).toBe(false);
    expect(result.completed()).toBe(true);
    // The cursor parks itself when done.
    expect(el.children[1].style.display).toBe("none");
    dispose();
  });

  it("replay() types again from empty", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "AB";
    let result!: ReturnType<typeof createTyping>;
    const dispose = createRoot((d) => {
      result = createTyping(() => el as unknown as Element, {
        speed: 30,
        variance: 0,
        autostart: false,
      });
      return d;
    });
    result.start();
    b.frames(120);
    expect(result.completed()).toBe(true);
    result.replay();
    expect(result.completed()).toBe(false);
    expect(el.children[0].textContent).toBe("");
    b.frames(120);
    expect(el.children[0].textContent).toBe("AB");
    dispose();
  });

  it("shows the full text instantly under reduced motion", () => {
    stubBrowser({ reduced: true });
    const el = new FakeElement();
    el.textContent = "Hello";
    let result!: ReturnType<typeof createTyping>;
    const dispose = createRoot((d) => {
      result = createTyping(() => el as unknown as Element, { variance: 0 });
      return d;
    });
    expect(el.children[0].textContent).toBe("Hello");
    expect(result.typing()).toBe(false);
    expect(result.completed()).toBe(true);
    dispose();
  });
});

describe("createTextPhysics", () => {
  it("rains letters in and settles them into their slots", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "Hi";
    let settledCalls = 0;
    let result!: ReturnType<typeof createTextPhysics>;
    const dispose = createRoot((d) => {
      result = createTextPhysics(() => el as unknown as Element, {
        onSettle: () => settledCalls++,
      });
      return d;
    });
    expect(result.settled()).toBe(true);

    result.drop();
    expect(result.settled()).toBe(false);
    b.frames(8);
    // Mid-flight the letters are above their slots and rotated.
    const mid = el.children[0].style.transform;
    expect(mid).toMatch(/translate\(.*-.*px/);
    b.frames(500);
    expect(result.settled()).toBe(true);
    expect(settledCalls).toBe(1);
    for (const c of el.children) {
      expect(c.style.transform).toBe("translate(0.0px, 0.0px) rotate(0.0deg)");
      expect(c.style.opacity).toBe("1");
    }
    dispose();
  });

  it("scatter() flings letters apart so they can rain again", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "Hi";
    let result!: ReturnType<typeof createTextPhysics>;
    const dispose = createRoot((d) => {
      result = createTextPhysics(() => el as unknown as Element);
      return d;
    });
    result.drop();
    b.frames(500);
    expect(result.settled()).toBe(true);
    result.scatter();
    expect(result.settled()).toBe(false);
    b.frames(120);
    expect(result.settled()).toBe(true);
    expect(el.children[0].style.opacity).toBe("0");
    // And they can rain back in.
    result.drop();
    b.frames(500);
    expect(result.settled()).toBe(true);
    expect(el.children[0].style.opacity).toBe("1");
    dispose();
  });

  it("parks letters instantly under reduced motion", () => {
    stubBrowser({ reduced: true });
    const el = new FakeElement();
    el.textContent = "Hi";
    let result!: ReturnType<typeof createTextPhysics>;
    const dispose = createRoot((d) => {
      result = createTextPhysics(() => el as unknown as Element);
      return d;
    });
    result.drop();
    expect(result.settled()).toBe(true);
    for (const c of el.children) {
      expect(c.style.transform).toBe("translate(0.0px, 0.0px) rotate(0.0deg)");
    }
    dispose();
  });
});

describe("createTextTunnel", () => {
  it("builds depth layers that zoom toward the viewer", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "ZOOM";
    let result!: ReturnType<typeof createTextTunnel>;
    const dispose = createRoot((d) => {
      result = createTextTunnel(() => el as unknown as Element, {
        layers: 4,
        period: 2,
      });
      return d;
    });
    // One invisible sizer plus four zoom layers.
    expect(el.children).toHaveLength(5);
    expect(el.children[0].style.visibility).toBe("hidden");
    b.frames(10);
    expect(result.progress()).toBeGreaterThan(0);
    const layer = el.children[1];
    expect(layer.style.transform).toMatch(/^scale\(/);
    expect(layer.style.opacity).not.toBe("");
    // The layers tile the full depth range: some near, some far.
    const scales = el.children
      .slice(1)
      .map((c) => parseFloat(c.style.transform.slice(6, -1)));
    expect(Math.max(...scales)).toBeGreaterThan(Math.min(...scales));
    result.stop();
    dispose();
  });

  it("leaves a single static line under reduced motion", () => {
    stubBrowser({ reduced: true });
    const el = new FakeElement();
    el.textContent = "ZOOM";
    const dispose = createRoot((d) => {
      createTextTunnel(() => el as unknown as Element, { layers: 4 });
      return d;
    });
    expect(el.children).toHaveLength(0);
    expect(el.textContent).toBe("ZOOM");
    dispose();
  });
});

describe("createTextCutout", () => {
  it("clips an animated gradient inside the letterforms", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "NEBULA";
    const dispose = createRoot((d) => {
      createTextCutout(() => el as unknown as Element, { mode: "gradient" });
      return d;
    });
    expect(el.style.color).toBe("transparent");
    expect(el.style.backgroundClip).toBe("text");
    expect(el.style.backgroundImage).toMatch(/radial-gradient/);
    b.frames(5);
    expect(el.style.backgroundPosition).toMatch(/%/);
    dispose();
  });

  it("window mode frames a transparent fill with a stroke", () => {
    stubBrowser();
    const el = new FakeElement();
    el.textContent = "DEEP";
    const dispose = createRoot((d) => {
      createTextCutout(() => el as unknown as Element, {
        mode: "window",
        stroke: "#fff",
        strokeWidth: 2,
      });
      return d;
    });
    expect(el.style.color).toBe("transparent");
    expect(el.style.webkitTextStroke).toBe("2px #fff");
    dispose();
  });
});

describe("createTextGradient", () => {
  it("paints each character its own cycling hue", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "ABC";
    const dispose = createRoot((d) => {
      createTextGradient(() => el as unknown as Element, {
        hue: 0,
        spread: 120,
        period: 4,
      });
      return d;
    });
    expect(el.children).toHaveLength(3);
    b.frames(2);
    const colors = el.children.map((c) => c.style.color);
    expect(colors[0]).toMatch(/^hsl\(/);
    // The hue spreads across the string.
    expect(new Set(colors).size).toBe(3);
    const first = colors[0];
    b.frames(30);
    // The cycle rotates over time.
    expect(el.children[0].style.color).not.toBe(first);
    dispose();
  });

  it("parks on the first frame under reduced motion", () => {
    stubBrowser({ reduced: true });
    const el = new FakeElement();
    el.textContent = "AB";
    const dispose = createRoot((d) => {
      createTextGradient(() => el as unknown as Element, {
        hue: 10,
        spread: 60,
      });
      return d;
    });
    expect(el.children[0].style.color).toBe("hsl(10.0, 85%, 62%)");
    expect(el.children[1].style.color).toBe("hsl(70.0, 85%, 62%)");
    dispose();
  });
});

describe("createTextScramble", () => {
  it("decodes each character left to right", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "AB";
    let result!: ReturnType<typeof createTextScramble>;
    const dispose = createRoot((d) => {
      result = createTextScramble(() => el as unknown as Element, {
        stagger: 28,
        duration: 100,
        frameRate: 50,
        autostart: false,
      });
      return d;
    });
    result.start();
    expect(result.scrambling()).toBe(true);
    b.frames(4);
    // Mid-decode the glyphs are not the final letters (the charset has
    // no letters, so this is deterministic).
    expect(textOf(el)).not.toBe("AB");
    b.frames(30);
    expect(textOf(el)).toBe("AB");
    expect(result.scrambling()).toBe(false);
    dispose();
  });

  it("reveals instantly under reduced motion", () => {
    stubBrowser({ reduced: true });
    const el = new FakeElement();
    el.textContent = "AB";
    let result!: ReturnType<typeof createTextScramble>;
    const dispose = createRoot((d) => {
      result = createTextScramble(() => el as unknown as Element, {
        autostart: true,
      });
      return d;
    });
    expect(textOf(el)).toBe("AB");
    expect(result.scrambling()).toBe(false);
    dispose();
  });

  it("seeds an empty element from the text option", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "";
    let result!: ReturnType<typeof createTextScramble>;
    const dispose = createRoot((d) => {
      result = createTextScramble(() => el as unknown as Element, {
        text: "Hi",
        stagger: 28,
        duration: 100,
        frameRate: 50,
        autostart: false,
      });
      return d;
    });
    result.start();
    expect(result.scrambling()).toBe(true);
    // Two characters were seeded from the option, not from empty content.
    expect(el.children).toHaveLength(2);
    b.frames(30);
    expect(textOf(el)).toBe("Hi");
    expect(result.scrambling()).toBe(false);
    dispose();
  });
});

describe("createTextWave", () => {
  it("bobs each character on a traveling wave", () => {
    const b = stubBrowser();
    const el = new FakeElement();
    el.textContent = "hey";
    let result!: ReturnType<typeof createTextWave>;
    const dispose = createRoot((d) => {
      result = createTextWave(() => el as unknown as Element, {
        amplitude: 9,
        period: 1,
      });
      return d;
    });
    expect(el.children).toHaveLength(3);
    b.frames(2);
    const poses = el.children.map((c) => c.style.transform);
    expect(poses[0]).toMatch(/^translateY\(/);
    // Neighbors sit at different phases of the wave.
    expect(new Set(poses).size).toBeGreaterThan(1);
    result.stop();
    dispose();
  });

  it("leaves the text still under reduced motion", () => {
    stubBrowser({ reduced: true });
    const el = new FakeElement();
    el.textContent = "hey";
    const dispose = createRoot((d) => {
      createTextWave(() => el as unknown as Element);
      return d;
    });
    expect(el.children[0].style.transform).toBe(undefined);
    dispose();
  });
});

describe("typography SSR", () => {
  it("is inert without a window", () => {
    const el = new FakeElement();
    el.textContent = "Hi";
    createRoot((dispose) => {
      const t = createTyping(() => el as unknown as Element);
      expect(t.typing()).toBe(false);
      const s = createTextScramble(() => el as unknown as Element);
      expect(s.scrambling()).toBe(false);
      const p = createTextPhysics(() => el as unknown as Element);
      expect(p.settled()).toBe(true);
      p.drop();
      createTextTunnel(() => el as unknown as Element);
      createTextCutout(() => el as unknown as Element);
      createTextGradient(() => el as unknown as Element);
      createTextWave(() => el as unknown as Element);
      const f = createFontSwap(() => el as unknown as Element, { to: "serif" });
      expect(f.swapped()).toBe(false);
      // Nothing touched the DOM.
      expect(el.children).toHaveLength(0);
      expect(el.textContent).toBe("Hi");
      dispose();
    });
  });
});

interface CountUpHarness {
  display: Accessor<string>;
  set: (v: number) => void;
  dispose: () => void;
}

function setupCountUp(
  initial: number,
  options?: Parameters<typeof createCountUp>[1],
): CountUpHarness {
  let display!: Accessor<string>;
  let set!: (v: number) => void;
  const dispose = createRoot((d) => {
    const [source, setSource] = createSignal(initial);
    display = createCountUp(source, options);
    set = setSource;
    return d;
  });
  return { display, set, dispose };
}

describe("createCountUp", () => {
  it("formats the initial value immediately", () => {
    stubBrowser();
    const { display, dispose } = setupCountUp(1234.5, {
      decimals: 2,
      prefix: "$",
      separator: ",",
    });
    expect(display()).toBe("$1,234.50");
    dispose();
  });

  it("tweens toward a new source value", () => {
    const b = stubBrowser();
    const { display, set, dispose } = setupCountUp(0, { duration: 1000 });
    set(100);
    b.frames(30); // halfway through the tween
    const mid = parseFloat(display());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    b.frames(60); // past the duration
    expect(display()).toBe("100");
    dispose();
  });

  it("retargets mid-flight with no snapping", () => {
    const b = stubBrowser();
    const { display, set, dispose } = setupCountUp(0, { duration: 1000 });
    set(100);
    b.frames(30);
    const mid = parseFloat(display());
    set(200);
    b.frames(90);
    expect(display()).toBe("200");
    expect(mid).toBeLessThan(200);
    dispose();
  });

  it("applies decimals, prefix, suffix, and separator", () => {
    stubBrowser();
    const a = setupCountUp(42, { suffix: "%" });
    expect(a.display()).toBe("42%");
    a.dispose();
    const b2 = setupCountUp(-9876543.21, {
      decimals: 2,
      separator: ",",
    });
    expect(b2.display()).toBe("-9,876,543.21");
    b2.dispose();
    const c = setupCountUp(7, { decimals: 3 });
    expect(c.display()).toBe("7.000");
    c.dispose();
  });

  it("jumps straight to the target under reduced motion", () => {
    stubBrowser({ reduced: true });
    const { display, set, dispose } = setupCountUp(0, { duration: 1000 });
    set(100);
    expect(display()).toBe("100");
    dispose();
  });

  it("renders the formatted source on the server", () => {
    // No window stubbed: SSR path.
    const { display } = setupCountUp(1234.5, {
      decimals: 2,
      prefix: "$",
      separator: ",",
    });
    expect(display()).toBe("$1,234.50");
  });
});
