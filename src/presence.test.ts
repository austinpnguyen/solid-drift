import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createPresence,
  createScrollReveal,
  createViewTransition,
  type PresenceControls,
  type ScrollRevealControls,
  type ViewTransitionControls,
} from "./presence.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const matchMediaStub = (matches: boolean) =>
  vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

/* ------------------------------------------------------------------ */
/* createPresence                                                       */
/* ------------------------------------------------------------------ */

describe("createPresence", () => {
  const setup = (
    initial: boolean,
    options: { exitDuration?: number } = {},
  ): {
    p: PresenceControls;
    setShow: (value: boolean) => void;
    dispose: () => void;
    onExitStart: ReturnType<typeof vi.fn>;
    onExitComplete: ReturnType<typeof vi.fn>;
  } => {
    const onExitStart = vi.fn();
    const onExitComplete = vi.fn();
    const [show, setShow] = createSignal(initial);
    let p!: PresenceControls;
    const dispose = createRoot((d) => {
      p = createPresence({ when: show, onExitStart, onExitComplete, ...options });
      return d;
    });
    return { p, setShow, dispose, onExitStart, onExitComplete };
  };

  it("starts absent when the signal is initially false", () => {
    const { p, dispose } = setup(false);
    expect(p.mounted()).toBe(false);
    expect(p.status()).toBe("absent");
    expect(p.exiting()).toBe(false);
    dispose();
  });

  it("starts present when the signal is initially true", () => {
    const { p, dispose } = setup(true);
    expect(p.mounted()).toBe(true);
    expect(p.status()).toBe("present");
    dispose();
  });

  it("keeps content mounted through the exit phase, then unmounts", async () => {
    const { p, setShow, dispose, onExitStart, onExitComplete } = setup(true, {
      exitDuration: 300,
    });
    setShow(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.status()).toBe("exiting");
    expect(p.exiting()).toBe(true);
    expect(p.mounted()).toBe(true);
    expect(onExitStart).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(299);
    expect(p.mounted()).toBe(true);
    expect(p.status()).toBe("exiting");

    await vi.advanceTimersByTimeAsync(1);
    expect(p.mounted()).toBe(false);
    expect(p.status()).toBe("absent");
    expect(p.exiting()).toBe(false);
    expect(onExitComplete).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("cancels the exit when the signal flips back to true", async () => {
    const { p, setShow, dispose, onExitComplete } = setup(true, {
      exitDuration: 300,
    });
    setShow(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.status()).toBe("exiting");
    setShow(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.status()).toBe("present");
    expect(p.mounted()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onExitComplete).not.toHaveBeenCalled();
    expect(p.mounted()).toBe(true);
    dispose();
  });

  it("forceExit skips the rest of the exit phase", async () => {
    const { p, setShow, dispose, onExitComplete } = setup(true, {
      exitDuration: 5000,
    });
    setShow(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.status()).toBe("exiting");
    p.forceExit();
    expect(p.mounted()).toBe(false);
    expect(p.status()).toBe("absent");
    expect(onExitComplete).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("forceExit is a no-op when not exiting", () => {
    const { p, dispose, onExitComplete } = setup(true);
    p.forceExit();
    expect(p.mounted()).toBe(true);
    expect(onExitComplete).not.toHaveBeenCalled();
    dispose();
  });

  it("skips the exit phase when the user prefers reduced motion", async () => {
    vi.stubGlobal("window", { matchMedia: matchMediaStub(true) });
    const { p, setShow, dispose, onExitStart, onExitComplete } = setup(true, {
      exitDuration: 5000,
    });
    setShow(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(onExitStart).toHaveBeenCalledTimes(1);
    expect(p.mounted()).toBe(false);
    expect(p.status()).toBe("absent");
    expect(onExitComplete).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("does nothing when hiding content that was never mounted", async () => {
    const { p, setShow, dispose, onExitStart } = setup(false);
    setShow(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.status()).toBe("absent");
    expect(onExitStart).not.toHaveBeenCalled();
    dispose();
  });
});

/* ------------------------------------------------------------------ */
/* createViewTransition                                                 */
/* ------------------------------------------------------------------ */

describe("createViewTransition", () => {
  const setup = (): { vt: ViewTransitionControls; dispose: () => void } => {
    let vt!: ViewTransitionControls;
    const dispose = createRoot((d) => {
      vt = createViewTransition();
      return d;
    });
    return { vt, dispose };
  };

  it("falls back to a direct update when the API is unavailable", async () => {
    const { vt, dispose } = setup();
    expect(vt.supported()).toBe(false);
    let ran = false;
    await vt.transition(() => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(vt.transitioning()).toBe(false);
    dispose();
  });

  it("runs updates inside a view transition when supported", async () => {
    let captured: (() => void | Promise<void>) | undefined;
    let resolveFinished!: () => void;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    vi.stubGlobal("document", {
      startViewTransition: vi.fn((update: () => void | Promise<void>) => {
        captured = update;
        return { finished };
      }),
    });
    const { vt, dispose } = setup();
    expect(vt.supported()).toBe(true);
    let ran = false;
    const done = vt.transition(() => {
      ran = true;
    });
    expect(vt.transitioning()).toBe(true);
    captured?.();
    expect(ran).toBe(true);
    resolveFinished();
    await done;
    expect(vt.transitioning()).toBe(false);
    dispose();
  });

  it("resets transitioning even when the transition is rejected", async () => {
    vi.stubGlobal("document", {
      startViewTransition: () => ({
        finished: Promise.reject(new Error("aborted")),
      }),
    });
    const { vt, dispose } = setup();
    await vt.transition(() => undefined);
    expect(vt.transitioning()).toBe(false);
    dispose();
  });

  it("awaits async updates in the fallback path", async () => {
    const { vt, dispose } = setup();
    const order: string[] = [];
    await vt.transition(async () => {
      await Promise.resolve();
      order.push("update");
    });
    order.push("after");
    expect(order).toEqual(["update", "after"]);
    dispose();
  });
});

/* ------------------------------------------------------------------ */
/* createScrollReveal                                                   */
/* ------------------------------------------------------------------ */

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: (
    entries: Array<{ target: Element; isIntersecting: boolean }>,
    observer: unknown,
  ) => void;
  observed = new Set<Element>();
  unobserved: Element[] = [];

  constructor(
    callback: (
      entries: Array<{ target: Element; isIntersecting: boolean }>,
      observer: unknown,
    ) => void,
  ) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
    this.unobserved.push(el);
  }

  disconnect(): void {
    this.observed.clear();
  }

  trigger(target: Element, isIntersecting = true): void {
    this.callback([{ target, isIntersecting }], this);
  }
}

describe("createScrollReveal", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
  });

  const clientSetup = (
    count: number,
    options: Parameters<typeof createScrollReveal>[1] = {},
  ): { r: ScrollRevealControls; dispose: () => void } => {
    vi.stubGlobal("window", { matchMedia: matchMediaStub(false) });
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    let r!: ScrollRevealControls;
    const dispose = createRoot((d) => {
      r = createScrollReveal(count, options);
      return d;
    });
    return { r, dispose };
  };

  const els = (n: number): HTMLElement[] =>
    Array.from({ length: n }, () => ({}) as unknown as HTMLElement);

  it("starts hidden and reveals items on intersect with stagger", async () => {
    const onReveal = vi.fn();
    const { r, dispose } = clientSetup(3, { stagger: 60, onReveal });
    expect(r.items).toHaveLength(3);
    expect(r.items[0].revealed()).toBe(false);
    expect(r.items[0].style().opacity).toBe("0");

    const elements = els(3);
    r.items.forEach((item, i) => item.ref(elements[i]));
    const io = FakeIntersectionObserver.instances[0];
    expect(io.observed.size).toBe(3);

    io.trigger(elements[1]);
    await vi.advanceTimersByTimeAsync(60);
    expect(r.items[1].revealed()).toBe(true);
    expect(r.items[1].style().opacity).toBe("1");
    expect(onReveal).toHaveBeenCalledWith(1);
    // Item 0 was never intersected, so it stays hidden.
    expect(r.items[0].revealed()).toBe(false);

    io.trigger(elements[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.items[0].revealed()).toBe(true);
    expect(onReveal).toHaveBeenCalledWith(0);
    dispose();
  });

  it("unobserves revealed items when once is true", async () => {
    const { r, dispose } = clientSetup(2, { stagger: 0 });
    const elements = els(2);
    r.items.forEach((item, i) => item.ref(elements[i]));
    const io = FakeIntersectionObserver.instances[0];
    io.trigger(elements[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(io.unobserved).toContain(elements[0]);
    expect(io.observed.has(elements[0])).toBe(false);
    dispose();
  });

  it("keeps observing when once is false", async () => {
    const { r, dispose } = clientSetup(1, { stagger: 0, once: false });
    const elements = els(1);
    r.items[0].ref(elements[0]);
    const io = FakeIntersectionObserver.instances[0];
    io.trigger(elements[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(io.observed.has(elements[0])).toBe(true);
    dispose();
  });

  it("applies the variant transform while hidden", () => {
    const { r, dispose } = clientSetup(1, { variant: "fade-up" });
    expect(r.items[0].style().transform).toBe("translateY(24px)");
    const { r: r2, dispose: dispose2 } = clientSetup(1, { variant: "scale" });
    expect(r2.items[0].style().transform).toBe("scale(0.94)");
    dispose();
    dispose2();
  });

  it("replay resets and re-observes, reset hides without revealing", async () => {
    const { r, dispose } = clientSetup(2, { stagger: 0 });
    const elements = els(2);
    r.items.forEach((item, i) => item.ref(elements[i]));
    const io = FakeIntersectionObserver.instances[0];
    io.trigger(elements[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.items[0].revealed()).toBe(true);

    r.replay();
    expect(r.items[0].revealed()).toBe(false);
    expect(io.observed.has(elements[0])).toBe(true);
    io.trigger(elements[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.items[0].revealed()).toBe(true);

    r.reset();
    expect(r.items[0].revealed()).toBe(false);
    expect(io.observed.has(elements[0])).toBe(false);
    dispose();
  });

  it("reveals instantly with no transition under reduced motion", async () => {
    vi.stubGlobal("window", { matchMedia: matchMediaStub(true) });
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    let r!: ScrollRevealControls;
    const dispose = createRoot((d) => {
      r = createScrollReveal(2, { stagger: 500 });
      return d;
    });
    const elements = els(2);
    r.items.forEach((item, i) => item.ref(elements[i]));
    await vi.advanceTimersByTimeAsync(0);
    expect(r.items[0].revealed()).toBe(true);
    expect(r.items[1].revealed()).toBe(true);
    expect(r.items[0].style().transition).toBe("none");
    dispose();
  });

  it("is SSR-safe: no window means empty styles and no crash", () => {
    let r!: ScrollRevealControls;
    const dispose = createRoot((d) => {
      r = createScrollReveal(2);
      return d;
    });
    expect(r.items[0].revealed()).toBe(false);
    expect(r.items[0].style()).toEqual({});
    expect(() => r.items[0].ref({} as unknown as HTMLElement)).not.toThrow();
    expect(() => r.replay()).not.toThrow();
    expect(() => r.reset()).not.toThrow();
    dispose();
  });

  it("handles zero items", () => {
    const { r, dispose } = clientSetup(0);
    expect(r.items).toHaveLength(0);
    expect(() => r.replay()).not.toThrow();
    dispose();
  });
});
