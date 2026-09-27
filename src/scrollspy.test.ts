import { describe, expect, it, vi, afterEach } from "vitest";
import { createRoot } from "solid-js";
import {
  createScrollSpy,
  type ScrollSpyControls,
  type ScrollSpyOptions,
} from "./scrollspy.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface FakeEl {
  getBoundingClientRect: () => { top: number };
  scrollIntoView: (options?: unknown) => void;
}

const makeEl = (top: number): FakeEl => ({
  getBoundingClientRect: () => ({ top }),
  scrollIntoView: vi.fn(),
});

const listeners = new Map<string, Set<() => void>>();

/** Fake window + document with controllable section positions. */
const stubDom = (
  tops: Record<string, number>,
  reducedMotion = false,
): Record<string, FakeEl> => {
  listeners.clear();
  const els: Record<string, FakeEl> = {};
  for (const [id, top] of Object.entries(tops)) els[id] = makeEl(top);
  const win = {
    addEventListener: (type: string, fn: () => void) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    matchMedia: () => ({ matches: reducedMotion }),
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    getElementById: (id: string) => els[id] ?? null,
  });
  return els;
};

const fireScroll = (): void => {
  listeners.get("scroll")?.forEach((fn) => fn());
};

const stubRaf = (): { tick: () => void } => {
  let cb: (() => void) | null = null;
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    cb = fn;
    return 1;
  });
  return {
    tick: () => {
      const fn = cb;
      cb = null;
      fn?.();
    },
  };
};

const owned = (
  options: ScrollSpyOptions,
): { spy: ScrollSpyControls; dispose: () => void } => {
  let spy!: ScrollSpyControls;
  const dispose = createRoot((d) => {
    spy = createScrollSpy(options);
    return d;
  });
  return { spy, dispose };
};

describe("createScrollSpy", () => {
  it("is a safe no-op on the server", () => {
    const { spy, dispose } = owned({ targets: ["a"] });
    expect(spy.active()).toBeNull();
    expect(() => spy.scrollTo("a")).not.toThrow();
    expect(() => spy.refresh()).not.toThrow();
    dispose();
  });

  it("picks the deepest section at or above the offset", () => {
    stubDom({ intro: -120, api: 10, faq: 500 });
    const { spy, dispose } = owned({ targets: ["intro", "api", "faq"], offset: 80 });
    expect(spy.active()).toBe("api");
    dispose();
  });

  it("is null when every section sits below the offset", () => {
    stubDom({ intro: 200, api: 600 });
    const { spy, dispose } = owned({ targets: ["intro", "api"] });
    expect(spy.active()).toBeNull();
    dispose();
  });

  it("skips unknown ids and accepts an accessor for targets", () => {
    stubDom({ a: -10, b: -50 });
    const { spy, dispose } = owned({
      targets: () => ["missing", "a", "b"],
    });
    expect(spy.active()).toBe("b");
    dispose();
  });

  it("measures against a custom container", () => {
    const els = stubDom({ panel1: 150, panel2: 400 });
    void els;
    const container = {
      getBoundingClientRect: () => ({ top: 100 }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const { spy, dispose } = owned({
      targets: ["panel1", "panel2"],
      container: container as unknown as HTMLElement,
      offset: 80,
    });
    // panel1 is 50px below the container top: within the offset.
    expect(spy.active()).toBe("panel1");
    expect(container.addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      expect.anything(),
    );
    dispose();
    expect(container.removeEventListener).toHaveBeenCalled();
  });

  it("scrollTo smooth-scrolls to the section", () => {
    const els = stubDom({ api: 300 });
    const { spy, dispose } = owned({ targets: ["api"] });
    spy.scrollTo("api");
    expect(els["api"]!.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    dispose();
  });

  it("scrollTo uses auto behavior under reduced motion", () => {
    const els = stubDom({ api: 300 }, true);
    const { spy, dispose } = owned({ targets: ["api"] });
    spy.scrollTo("api");
    expect(els["api"]!.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
    dispose();
  });

  it("scrollTo ignores unknown ids", () => {
    stubDom({ api: 300 });
    const { spy, dispose } = owned({ targets: ["api"] });
    expect(() => spy.scrollTo("nope")).not.toThrow();
    dispose();
  });

  it("fires onChange only when the active section changes", () => {
    const els = stubDom({ a: -10, b: 500 });
    const onChange = vi.fn();
    const { spy, dispose } = owned({ targets: ["a", "b"], onChange });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("a");
    spy.refresh();
    expect(onChange).toHaveBeenCalledTimes(1); // unchanged
    els["b"]!.getBoundingClientRect = () => ({ top: -20 });
    spy.refresh();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith("b");
    dispose();
  });

  it("throttles scroll handling through the shared clock", () => {
    const els = stubDom({ a: -10, b: 500 });
    const raf = stubRaf();
    const { spy, dispose } = owned({ targets: ["a", "b"] });
    expect(spy.active()).toBe("a");
    els["b"]!.getBoundingClientRect = () => ({ top: -20 });
    fireScroll();
    fireScroll();
    expect(spy.active()).toBe("a"); // not recomputed yet
    raf.tick();
    expect(spy.active()).toBe("b");
    dispose();
  });
});
