import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Accessor } from "solid-js";
import { createInView } from "./inview.js";

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  targets: Element[] = [];
  disconnected = false;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe = (el: Element): void => {
    this.targets.push(el);
  };
  unobserve = (el: Element): void => {
    this.targets = this.targets.filter((t) => t !== el);
  };
  disconnect = (): void => {
    this.disconnected = true;
  };
  trigger = (isIntersecting: boolean): void => {
    const entries = this.targets.map((target) => ({
      isIntersecting,
      target,
    }));
    this.callback(
      entries as unknown as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  };
}

function stubObserver() {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal(
    "IntersectionObserver",
    MockIntersectionObserver as unknown as typeof IntersectionObserver,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createInView", () => {
  it("returns false on the server (no window/IntersectionObserver)", () => {
    createRoot(() => {
      expect(createInView(() => null)()).toBe(false);
    });
  });

  it("stays false when the ref is null", () => {
    stubObserver();
    let inView!: Accessor<boolean>;
    createRoot(() => {
      inView = createInView(() => null);
    });
    expect(inView()).toBe(false);
    expect(MockIntersectionObserver.instances.length).toBe(0);
  });

  it("becomes true on intersection and latches with once: true", () => {
    stubObserver();
    const el = {} as Element;
    let inView!: Accessor<boolean>;
    createRoot(() => {
      inView = createInView(() => el);
    });
    const io = MockIntersectionObserver.instances[0];
    expect(io).toBeDefined();
    expect(inView()).toBe(false);

    io.trigger(true);
    expect(inView()).toBe(true);
    expect(io.disconnected).toBe(true); // stopped observing

    io.trigger(false);
    expect(inView()).toBe(true); // latched
  });

  it("toggles with once: false", () => {
    stubObserver();
    const el = {} as Element;
    let inView!: Accessor<boolean>;
    createRoot(() => {
      inView = createInView(() => el, { once: false });
    });
    const io = MockIntersectionObserver.instances[0];

    io.trigger(true);
    expect(inView()).toBe(true);
    expect(io.disconnected).toBe(false);

    io.trigger(false);
    expect(inView()).toBe(false);

    io.trigger(true);
    expect(inView()).toBe(true);
  });

  it("passes the threshold option through", () => {
    stubObserver();
    const el = {} as Element;
    createRoot(() => {
      createInView(() => el, { threshold: 0.4 });
    });
    expect(MockIntersectionObserver.instances[0].options).toEqual({
      threshold: 0.4,
    });
  });

  it("uses a 0.15 default threshold", () => {
    stubObserver();
    const el = {} as Element;
    createRoot(() => {
      createInView(() => el);
    });
    expect(MockIntersectionObserver.instances[0].options).toEqual({
      threshold: 0.15,
    });
  });

  it("disconnects the observer on cleanup", () => {
    stubObserver();
    const el = {} as Element;
    let dispose!: () => void;
    createRoot((d) => {
      createInView(() => el);
      dispose = d;
    });
    const io = MockIntersectionObserver.instances[0];
    dispose();
    expect(io.disconnected).toBe(true);
  });
});
