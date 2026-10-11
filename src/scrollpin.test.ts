import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { createScrollPin } from "./scrollpin.js";

let fakeScrollY = 0;
let rafCbs = new Map<number, (t: number) => void>();
let nextRafId = 1;
let scrollListener: (() => void) | null = null;

function makeEl(top: number, height: number): HTMLElement {
  const style = {
    position: "",
    top: "",
    left: "",
    width: "",
    height: "",
    setProperty: () => {},
  };
  const el = {
    style,
    dataset: {},
    parentNode: {
      insertBefore: vi.fn(),
    },
    getBoundingClientRect: () => ({
      top: top - fakeScrollY,
      left: 0,
      width: 300,
      height,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
    remove: vi.fn(),
  } as unknown as HTMLElement;
  return el;
}

function scrollTo(y: number) {
  fakeScrollY = y;
  scrollListener?.();
  // Flush rAF.
  const cbs = [...rafCbs.values()];
  rafCbs.clear();
  cbs.forEach((cb) => cb(0));
}

beforeAll(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    const id = nextRafId++;
    rafCbs.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafCbs.delete(id);
  });
  vi.stubGlobal("window", {
    get scrollY() {
      return fakeScrollY;
    },
    addEventListener: (type: string, cb: () => void) => {
      if (type === "scroll") scrollListener = cb;
    },
    removeEventListener: () => {
      scrollListener = null;
    },
    visualViewport: null,
  });
  vi.stubGlobal("document", {
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: vi.fn(),
    }),
  });
});

describe("createScrollPin", () => {
  afterEach(() => {
    fakeScrollY = 0;
    rafCbs.clear();
    scrollListener = null;
  });

  it("pins when scroll enters range and unpins on leave", () => {
    const el = makeEl(500, 200);
    const pin = createScrollPin(() => el, { start: 500, end: 1000 });
    expect(pin.active()).toBe(false);

    scrollTo(600);
    expect(pin.active()).toBe(true);
    expect(el.style.position).toBe("fixed");

    scrollTo(1100);
    expect(pin.active()).toBe(false);
    expect(el.style.position).toBe("");
    pin.dispose();
  });

  it("reports progress 0..1 across the range", () => {
    const el = makeEl(500, 200);
    const pin = createScrollPin(() => el, { start: 500, end: 1000 });
    scrollTo(500);
    expect(pin.progress()).toBe(0);
    scrollTo(750);
    expect(pin.progress()).toBe(0.5);
    scrollTo(1000);
    expect(pin.progress()).toBe(1);
    pin.dispose();
  });

  it("supports += end syntax", () => {
    const el = makeEl(500, 200);
    const pin = createScrollPin(() => el, { start: 500, end: "+=500" });
    scrollTo(750);
    expect(pin.active()).toBe(true);
    expect(pin.progress()).toBe(0.5);
    scrollTo(1001);
    expect(pin.active()).toBe(false);
    pin.dispose();
  });

  it("calls scrub with progress while pinned", () => {
    const el = makeEl(500, 200);
    const seen: number[] = [];
    const pin = createScrollPin(() => el, {
      start: 500,
      end: 1000,
      scrub: (p) => seen.push(p),
    });
    scrollTo(750);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(0.5);
    pin.dispose();
  });

  it("fires enter/leave callbacks", () => {
    const el = makeEl(500, 200);
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const pin = createScrollPin(() => el, { start: 500, end: 1000, onEnter, onLeave });
    scrollTo(600);
    expect(onEnter).toHaveBeenCalledTimes(1);
    scrollTo(1100);
    expect(onLeave).toHaveBeenCalledTimes(1);
    pin.dispose();
  });

  it("dispose restores DOM and is idempotent", () => {
    const el = makeEl(500, 200);
    const pin = createScrollPin(() => el, { start: 500, end: 1000 });
    scrollTo(600);
    expect(pin.active()).toBe(true);
    pin.dispose();
    expect(pin.active()).toBe(false);
    expect(el.style.position).toBe("");
    expect(() => pin.dispose()).not.toThrow();
  });

  it("a throwing scrub callback does not break the pin", () => {
    const el = makeEl(500, 200);
    const pin = createScrollPin(() => el, {
      start: 500,
      end: 1000,
      scrub: () => {
        throw new Error("boom");
      },
    });
    expect(() => scrollTo(750)).not.toThrow();
    expect(pin.active()).toBe(true);
    pin.dispose();
  });
});
