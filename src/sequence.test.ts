import { describe, it, expect, vi, afterEach } from "vitest";
import { createSequence } from "./sequence.js";

function makeEl(): HTMLElement {
  const style = {
    _props: new Map<string, string>(),
    setProperty(k: string, v: string) {
      this._props.set(k, v);
    },
    getPropertyValue(k: string) {
      return this._props.get(k) ?? "";
    },
    transform: "",
    opacity: "",
  };
  return {
    style: style as unknown as CSSStyleDeclaration,
    dataset: {},
  } as unknown as HTMLElement;
}

function getTransform(el: HTMLElement): string {
  return (el.style as unknown as { transform: string }).transform;
}

function getOpacity(el: HTMLElement): string {
  return (el.style as unknown as { _props: Map<string, string> })._props.get("opacity") ?? "";
}

describe("createSequence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lays out sequential steps by default", () => {
    const el = makeEl();
    const t = () => el;
    const seq = createSequence([
      { target: t, props: { opacity: [0, 1] }, duration: 100 },
      { target: t, props: { opacity: [1, 0] }, duration: 200 },
      { target: t, props: { opacity: [0, 1] }, duration: 300 },
    ]);
    expect(seq.duration()).toBe(600);
    seq.dispose();
  });

  it("resolves '<' '>' '-=' '+=' positions", () => {
    const el = makeEl();
    const t = () => el;
    const seq = createSequence([
      { target: t, props: { x: [0, 100] }, duration: 100 }, // 0..100
      { target: t, props: { x: [0, 100] }, duration: 100, at: "<" }, // 0..100
      { target: t, props: { x: [0, 100] }, duration: 100, at: "-=50" }, // 50..150
      { target: t, props: { x: [0, 100] }, duration: 100, at: "+=25" }, // 175..275
      { target: t, props: { x: [0, 100] }, duration: 100, at: 500 }, // 500..600
      { target: t, props: { x: [0, 100] }, duration: 100, at: "<+=50" }, // 550..650
    ]);
    expect(seq.duration()).toBe(650);
    seq.dispose();
  });

  it("resolves labels and label offsets", () => {
    const el = makeEl();
    const t = () => el;
    const seq = createSequence();
    seq.addLabel("intro", 200);
    seq.add({ target: t, props: { opacity: [0, 1] }, duration: 100, at: "intro" });
    seq.add({ target: t, props: { opacity: [0, 1] }, duration: 100, at: "intro+=50" });
    expect(seq.duration()).toBe(350);
    seq.dispose();
  });

  it("throws on unknown label", () => {
    const el = makeEl();
    const t = () => el;
    expect(() =>
      createSequence([
        { target: t, props: { opacity: [0, 1] }, duration: 100, at: "nope" },
      ]),
    ).toThrow(/unknown label "nope"/);
  });

  it("seek renders correct values including overlap", () => {
    const el = makeEl();
    const t = () => el;
    const seq = createSequence([
      { target: t, props: { x: [0, 100] }, duration: 100, easing: (t) => t },
      { target: t, props: { opacity: [0, 1] }, duration: 100, at: 50, easing: (t) => t },
    ]);
    seq.seek(0);
    expect(getTransform(el)).toContain("translateX(0px)");
    seq.seek(75);
    expect(getTransform(el)).toContain("translateX(75px)");
    expect(getOpacity(el)).toBe("0.25");
    seq.seek(200);
    expect(getTransform(el)).toContain("translateX(100px)");
    expect(getOpacity(el)).toBe("1");
    seq.dispose();
  });

  it("seek clamps outside [0, duration]", () => {
    const el = makeEl();
    const t = () => el;
    const seq = createSequence([
      { target: t, props: { x: [0, 100] }, duration: 100, easing: (t) => t },
    ]);
    seq.seek(-50);
    expect(getTransform(el)).toContain("translateX(0px)");
    seq.seek(9999);
    expect(getTransform(el)).toContain("translateX(100px)");
    seq.dispose();
  });

  it("supports keyframes arrays", () => {
    const el = makeEl();
    const t = () => el;
    const seq = createSequence([
      { target: t, props: { x: [0, 50, 100] }, duration: 100, easing: (t) => t },
    ]);
    seq.seek(50);
    expect(getTransform(el)).toContain("translateX(50px)");
    seq.seek(25);
    expect(getTransform(el)).toContain("translateX(25px)");
    seq.dispose();
  });

  it("skips null targets silently", () => {
    const seq = createSequence([
      { target: () => null, props: { x: [0, 100] }, duration: 100 },
      { target: () => undefined, props: { x: [0, 100] }, duration: 100 },
    ]);
    expect(() => seq.seek(50)).not.toThrow();
    seq.dispose();
  });

  it("nests sequences with correct timing", () => {
    const el = makeEl();
    const t = () => el;
    const inner = createSequence([
      { target: t, props: { x: [0, 100] }, duration: 100, easing: (t) => t },
    ]);
    const outer = createSequence([
      { target: t, props: { opacity: [0, 0.5] }, duration: 100, easing: (t) => t },
      inner,
    ]);
    expect(outer.duration()).toBe(200);
    outer.seek(150);
    expect(getTransform(el)).toContain("translateX(50px)");
    outer.dispose();
    inner.dispose();
  });

  it("play applies end values under reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const el = makeEl();
    const t = () => el;
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const seq = createSequence([
      { target: t, props: { x: [0, 100] }, duration: 1000, onStart, onComplete },
    ]);
    await seq.play();
    expect(getTransform(el)).toContain("translateX(100px)");
    expect(seq.status()).toBe("done");
    expect(onStart).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    seq.dispose();
  });

  it("add() appends after construction", () => {
    const el = makeEl();
    const t = () => el;
    const seq = createSequence([
      { target: t, props: { x: [0, 100] }, duration: 100 },
    ]);
    expect(seq.duration()).toBe(100);
    seq.add({ target: t, props: { x: [0, 100] }, duration: 100 });
    expect(seq.duration()).toBe(200);
    seq.dispose();
  });

  it("timeScale accepts valid values", () => {
    const seq = createSequence();
    expect(() => seq.timeScale(2)).not.toThrow();
    expect(() => seq.timeScale(0.5)).not.toThrow();
    seq.dispose();
  });

  it("dispose is idempotent", () => {
    const seq = createSequence();
    expect(() => {
      seq.dispose();
      seq.dispose();
    }).not.toThrow();
  });
});
