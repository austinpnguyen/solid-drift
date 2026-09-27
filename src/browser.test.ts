import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createEventListener,
  createElementSize,
  createGeolocation,
  createHotkey,
  createTimeAgo,
  createPermission,
  createScriptLoader,
} from "./browser.js";

function setup<T>(fn: () => T): { result: T; dispose: () => void } {
  let result!: T;
  let dispose!: () => void;
  createRoot((d) => {
    result = fn();
    dispose = d;
  });
  return { result, dispose };
}

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/* ------------------------------ fakes ------------------------------ */

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];

  constructor(private callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.push(el);
  }

  unobserve(el: Element): void {
    this.observed = this.observed.filter((e) => e !== el);
  }

  disconnect(): void {
    this.observed = [];
  }

  trigger(width: number, height: number): void {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

interface FakePosition {
  coords: { latitude: number; longitude: number };
}

class FakeGeolocation {
  lastWatchId = 0;
  watches = new Map<number, (pos: FakePosition) => void>();
  nextError: { code: number; message: string } | null = null;

  getCurrentPosition(
    success: (pos: FakePosition) => void,
    failure?: (err: { code: number; message: string }) => void,
  ): void {
    if (this.nextError) failure?.(this.nextError);
    else success({ coords: { latitude: 10, longitude: 20 } });
  }

  watchPosition(success: (pos: FakePosition) => void): number {
    this.lastWatchId += 1;
    this.watches.set(this.lastWatchId, success);
    return this.lastWatchId;
  }

  clearWatch(id: number): void {
    this.watches.delete(id);
  }

  emit(id: number): void {
    this.watches.get(id)?.({ coords: { latitude: 11, longitude: 21 } });
  }
}

class FakeScriptElement {
  src = "";
  async = false;
  attrs: Record<string, string> = {};
  removed = false;
  private listeners = new Map<string, Array<() => void>>();

  setAttribute(key: string, value: string): void {
    this.attrs[key] = value;
  }

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((l) => l !== listener),
    );
  }

  remove(): void {
    this.removed = true;
  }

  fire(type: "load" | "error"): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function fakeDocument() {
  const scripts: FakeScriptElement[] = [];
  return {
    scripts,
    createElement: (_tag: string): FakeScriptElement => {
      const el = new FakeScriptElement();
      scripts.push(el);
      return el;
    },
    head: {
      appendChild: (_el: FakeScriptElement): void => {},
    },
  };
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
});

/* ------------------------- createEventListener ------------------------- */

describe("createEventListener", () => {
  it("calls the handler and cleans up on dispose", async () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const { dispose } = setup(() =>
      createEventListener(target, "custom", handler),
    );
    await flush();
    target.dispatchEvent(new Event("custom"));
    expect(handler).toHaveBeenCalledTimes(1);
    dispose();
    target.dispatchEvent(new Event("custom"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("is a no-op with an undefined target", async () => {
    const { dispose } = setup(() =>
      createEventListener(() => undefined, "custom", vi.fn()),
    );
    await flush();
    dispose();
  });
});

/* --------------------------- createElementSize --------------------------- */

describe("createElementSize", () => {
  it("reports size from ResizeObserver", async () => {
    const el = {} as HTMLElement;
    const { result: size, dispose } = setup(() =>
      createElementSize(() => el, {
        ResizeObserverImpl:
          FakeResizeObserver as unknown as typeof ResizeObserver,
      }),
    );
    await flush();
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(size.width()).toBe(0);
    FakeResizeObserver.instances[0].trigger(320, 180);
    expect(size.width()).toBe(320);
    expect(size.height()).toBe(180);
    dispose();
  });

  it("stays 0x0 without ResizeObserver", async () => {
    const { result: size, dispose } = setup(() =>
      createElementSize(() => undefined, {
        ResizeObserverImpl: undefined,
      }),
    );
    await flush();
    expect(size.width()).toBe(0);
    expect(size.height()).toBe(0);
    dispose();
  });
});

/* ---------------------------- createGeolocation ---------------------------- */

describe("createGeolocation", () => {
  it("reads the position when supported", async () => {
    const geo = new FakeGeolocation();
    const { result: loc, dispose } = setup(() =>
      createGeolocation({
        navigatorImpl: { geolocation: geo } as unknown as Navigator,
      }),
    );
    expect(loc.supported).toBe(true);
    loc.refresh();
    await flush();
    expect(loc.coords()?.latitude).toBe(10);
    expect(loc.error()).toBeUndefined();
    dispose();
  });

  it("reports unsupported without the API", () => {
    const { result: loc, dispose } = setup(() =>
      createGeolocation({ navigatorImpl: {} as Navigator, immediate: false }),
    );
    expect(loc.supported).toBe(false);
    loc.refresh();
    expect(loc.position()).toBeUndefined();
    dispose();
  });

  it("surfaces geolocation errors", async () => {
    const geo = new FakeGeolocation();
    geo.nextError = { code: 1, message: "denied" };
    const { result: loc, dispose } = setup(() =>
      createGeolocation({
        navigatorImpl: { geolocation: geo } as unknown as Navigator,
      }),
    );
    loc.refresh();
    await flush();
    expect(loc.error()?.code).toBe(1);
    expect(loc.position()).toBeUndefined();
    dispose();
  });

  it("watches the position and clears the watch on dispose", async () => {
    const geo = new FakeGeolocation();
    const { result: loc, dispose } = setup(() =>
      createGeolocation({
        navigatorImpl: { geolocation: geo } as unknown as Navigator,
        watch: true,
        immediate: false,
      }),
    );
    loc.refresh();
    expect(geo.watches.size).toBe(1);
    geo.emit(1);
    await flush();
    expect(loc.coords()?.latitude).toBe(11);
    dispose();
    expect(geo.watches.size).toBe(0);
  });
});

/* ------------------------------ createHotkey ------------------------------ */

describe("createHotkey", () => {
  const keydown = (init: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  }): Event =>
    Object.assign(new Event("keydown"), {
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...init,
    });

  it("fires on a matching combo", async () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const { dispose } = setup(() =>
      createHotkey("ctrl+k", handler, { target }),
    );
    await flush();
    target.dispatchEvent(keydown({ key: "k", ctrlKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("ignores non-matching keys and modifiers", async () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const { dispose } = setup(() =>
      createHotkey("ctrl+k", handler, { target }),
    );
    await flush();
    target.dispatchEvent(keydown({ key: "k" }));
    target.dispatchEvent(keydown({ key: "j", ctrlKey: true }));
    target.dispatchEvent(keydown({ key: "k", ctrlKey: true, shiftKey: true }));
    expect(handler).not.toHaveBeenCalled();
    dispose();
  });

  it("matches cmd as meta and is case-insensitive", async () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const { dispose } = setup(() =>
      createHotkey("cmd+Shift+P", handler, { target }),
    );
    await flush();
    target.dispatchEvent(
      keydown({ key: "p", metaKey: true, shiftKey: true }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("supports multiple combos and the enabled flag", async () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const [enabled, setEnabled] = createSignal(true);
    const { dispose } = setup(() =>
      createHotkey(["ctrl+k", "?"], handler, { target, enabled }),
    );
    await flush();
    target.dispatchEvent(keydown({ key: "?" }));
    expect(handler).toHaveBeenCalledTimes(1);
    setEnabled(false);
    target.dispatchEvent(keydown({ key: "k", ctrlKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
    dispose();
  });
});

/* ------------------------------ createTimeAgo ------------------------------ */

describe("createTimeAgo", () => {
  it("formats past and future times in English", () => {
    const { result: ago, dispose } = setup(() =>
      createTimeAgo(() => Date.now() - 5 * 60 * 1000),
    );
    expect(ago()).toBe("5 minutes ago");
    dispose();

    const future = setup(() => createTimeAgo(() => Date.now() + 3 * 3600 * 1000));
    expect(future.result()).toBe("in 3 hours");
    future.dispose();
  });

  it("says just now for tiny differences", () => {
    const { result: ago, dispose } = setup(() => createTimeAgo(() => Date.now()));
    expect(ago()).toBe("just now");
    dispose();
  });
});

/* ---------------------------- createPermission ---------------------------- */

describe("createPermission", () => {
  it("queries and exposes the state", async () => {
    const nav = {
      permissions: {
        query: vi.fn(async () => ({ state: "granted" })),
      },
    };
    const { result: perm, dispose } = setup(() =>
      createPermission("geolocation", {
        navigatorImpl: nav as unknown as Navigator,
        immediate: false,
      }),
    );
    expect(perm.supported).toBe(true);
    expect(perm.state()).toBeUndefined();
    perm.query();
    await flush();
    expect(perm.state()).toBe("granted");
    expect(nav.permissions.query).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("reports unsupported without the API", () => {
    const { result: perm, dispose } = setup(() =>
      createPermission("geolocation", {
        navigatorImpl: {} as Navigator,
        immediate: false,
      }),
    );
    expect(perm.supported).toBe(false);
    perm.query();
    expect(perm.state()).toBeUndefined();
    dispose();
  });
});

/* --------------------------- createScriptLoader --------------------------- */

describe("createScriptLoader", () => {
  it("injects the script and resolves on load", async () => {
    const doc = fakeDocument();
    const { result: loader, dispose } = setup(() =>
      createScriptLoader("https://x.test/one.js", {
        documentImpl: doc as unknown as Document,
        attrs: { "data-test": "yes" },
      }),
    );
    loader.load();
    expect(loader.status()).toBe("loading");
    expect(doc.scripts).toHaveLength(1);
    expect(doc.scripts[0].src).toBe("https://x.test/one.js");
    expect(doc.scripts[0].async).toBe(true);
    expect(doc.scripts[0].attrs["data-test"]).toBe("yes");
    doc.scripts[0].fire("load");
    expect(loader.loaded()).toBe(true);
    expect(loader.status()).toBe("success");
    dispose();
  });

  it("does not inject twice for the same src", async () => {
    const doc = fakeDocument();
    const { result: loader, dispose } = setup(() =>
      createScriptLoader("https://x.test/two.js", {
        documentImpl: doc as unknown as Document,
      }),
    );
    loader.load();
    doc.scripts[0].fire("load");
    loader.load();
    expect(doc.scripts).toHaveLength(1);
    expect(loader.status()).toBe("success");
    dispose();
  });

  it("surfaces load errors", () => {
    const doc = fakeDocument();
    const { result: loader, dispose } = setup(() =>
      createScriptLoader("https://x.test/three.js", {
        documentImpl: doc as unknown as Document,
      }),
    );
    loader.load();
    doc.scripts[0].fire("error");
    expect(loader.status()).toBe("error");
    expect(loader.error()).toBeInstanceOf(Error);
    dispose();
  });

  it("is a no-op on the server", () => {
    const { result: loader, dispose } = setup(() =>
      createScriptLoader("https://x.test/four.js", {
        documentImpl: undefined,
      }),
    );
    // No global document in this environment, so load() must not throw.
    loader.load();
    expect(loader.status()).toBe("idle");
    expect(loader.loaded()).toBe(false);
    dispose();
  });
});
