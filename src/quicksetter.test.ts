import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { createQuickSetter, createQuickTo } from "./quicksetter.js";

let fakeTime = 0;
let nextRafId = 1;
const pending = new Map<number, (t: number) => void>();

function frames(n: number, step = 16.7) {
  for (let i = 0; i < n; i++) {
    fakeTime += step;
    const cbs = [...pending.values()];
    pending.clear();
    cbs.forEach((cb) => cb(fakeTime));
  }
}

function makeEl(): HTMLElement {
  const props = new Map<string, string>();
  const style = {
    setProperty: (k: string, v: string) => props.set(k, v),
    getPropertyValue: (k: string) => props.get(k) ?? "",
    transform: "",
    _props: props,
  };
  return { style, dataset: {} } as unknown as HTMLElement;
}

beforeAll(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    const id = nextRafId++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("document", {
    get hidden() {
      return false;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("window", {});
});

describe("createQuickSetter", () => {
  afterEach(() => {
    pending.clear();
    vi.unstubAllGlobals();
    // Re-stub after unstub.
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
      const id = nextRafId++;
      pending.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      pending.delete(id);
    });
    vi.stubGlobal("performance", { now: () => fakeTime });
    vi.stubGlobal("document", {
      get hidden() {
        return false;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("window", {});
  });

  it("writes transform props without clobbering", () => {
    const el = makeEl();
    const setX = createQuickSetter(() => el, "x");
    const setY = createQuickSetter(() => el, "y");
    setX(10);
    setY(20);
    frames(2);
    const t = (el.style as unknown as { transform: string }).transform;
    expect(t).toContain("translateX(10px)");
    expect(t).toContain("translateY(20px)");
  });

  it("writes plain CSS props with px", () => {
    const el = makeEl();
    const set = createQuickSetter(() => el, "width");
    set(100);
    frames(2);
    const props = (el.style as unknown as { _props: Map<string, string> })._props;
    expect(props.get("width")).toBe("100px");
  });

  it("keeps unitless props unitless", () => {
    const el = makeEl();
    const set = createQuickSetter(() => el, "opacity");
    set(0.5);
    frames(2);
    const props = (el.style as unknown as { _props: Map<string, string> })._props;
    expect(props.get("opacity")).toBe("0.5");
  });

  it("null target is a no-op", () => {
    const set = createQuickSetter(() => null, "x");
    expect(() => {
      set(10);
      frames(2);
    }).not.toThrow();
  });

  it("coalesces multiple sets per frame, last wins", () => {
    const el = makeEl();
    const set = createQuickSetter(() => el, "x");
    for (let i = 0; i < 100; i++) set(i);
    frames(2);
    const t = (el.style as unknown as { transform: string }).transform;
    expect(t).toContain("translateX(99px)");
  });
});

describe("createQuickTo", () => {
  it("converges toward the target", () => {
    const el = makeEl();
    const set = createQuickTo(() => el, "x", { damping: 20 });
    set(100);
    frames(120); // 2 seconds of frames
    const store = (el as unknown as { __driftQuick: Record<string, number> }).__driftQuick;
    // Should be very close to 100 after 2s with damping 20.
    expect(Math.abs((store?.x ?? 0) - 100)).toBeLessThan(1);
  });

  it("null target is a no-op", () => {
    const set = createQuickTo(() => null, "x");
    expect(() => {
      set(10);
      frames(2);
    }).not.toThrow();
  });
});
