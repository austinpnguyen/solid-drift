import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal, type Accessor } from "solid-js";
import {
  createDebounced,
  createThrottled,
  createLocalStorage,
  createMediaQuery,
  createClickOutside,
  createScrollLock,
  createInfiniteScroll,
} from "./dom.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function stubWindow(extra: Record<string, unknown> = {}) {
  vi.stubGlobal("window", { ...extra });
}

describe("createDebounced", () => {
  it("follows the source after a pause", async () => {
    stubWindow();
    let setQ!: (v: string) => void;
    let deb!: Accessor<string>;
    const dispose = createRoot((d) => {
      const [q, set] = createSignal("a");
      setQ = set;
      deb = createDebounced(q, 40);
      return d;
    });
    await sleep(0);
    expect(deb()).toBe("a");
    setQ("b");
    setQ("c");
    await sleep(10);
    expect(deb()).toBe("a"); // still waiting out the pause
    await sleep(60);
    expect(deb()).toBe("c");
    dispose();
  });

  it("restarts the wait on every change", async () => {
    stubWindow();
    let setQ!: (v: string) => void;
    let deb!: Accessor<string>;
    const dispose = createRoot((d) => {
      const [q, set] = createSignal("a");
      setQ = set;
      deb = createDebounced(q, 40);
      return d;
    });
    await sleep(0);
    setQ("b");
    await sleep(25);
    setQ("c"); // resets the 40ms window
    await sleep(25);
    expect(deb()).toBe("a");
    await sleep(30);
    expect(deb()).toBe("c");
    dispose();
  });

  it("is SSR-safe: holds the initial value", () => {
    // No window stubbed: server path.
    const dispose = createRoot((d) => {
      const [q] = createSignal("a");
      expect(createDebounced(q, 10)()).toBe("a");
      return d;
    });
    dispose();
  });
});

describe("createThrottled", () => {
  it("applies the leading change and collapses the rest", async () => {
    stubWindow();
    let setN!: (v: number) => void;
    let th!: Accessor<number>;
    const dispose = createRoot((d) => {
      const [n, set] = createSignal(0);
      setN = set;
      th = createThrottled(n, 50);
      return d;
    });
    await sleep(0);
    expect(th()).toBe(0); // leading edge applies immediately
    setN(1);
    setN(2);
    setN(3);
    await sleep(0);
    expect(th()).toBe(0); // inside the window: trailing pending
    await sleep(80);
    expect(th()).toBe(3); // the burst collapsed into one update
    dispose();
  });

  it("is SSR-safe: holds the initial value", () => {
    const dispose = createRoot((d) => {
      const [n] = createSignal(7);
      expect(createThrottled(n, 10)()).toBe(7);
      return d;
    });
    dispose();
  });
});

describe("createLocalStorage", () => {
  function stubStorage(initial: Record<string, string> = {}) {
    const store = new Map<string, string>(Object.entries(initial));
    const listeners = new Map<string, Set<(e: unknown) => void>>();
    stubWindow({
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
      addEventListener: (t: string, fn: (e: unknown) => void) => {
        let set = listeners.get(t);
        if (!set) {
          set = new Set();
          listeners.set(t, set);
        }
        set.add(fn);
      },
      removeEventListener: (t: string, fn: (e: unknown) => void) => {
        listeners.get(t)?.delete(fn);
      },
    });
    return {
      store,
      fireStorage: (key: string, newValue: string | null) => {
        listeners.get("storage")?.forEach((fn) => fn({ key, newValue }));
      },
    };
  }

  it("reads the stored value and falls back when missing or corrupt", () => {
    stubStorage({ theme: '"dark"', broken: "not-json{{{" });
    const dispose = createRoot((d) => {
      expect(createLocalStorage("theme", "light").value()).toBe("dark");
      expect(createLocalStorage("missing", "light").value()).toBe("light");
      expect(createLocalStorage("broken", "light").value()).toBe("light");
      return d;
    });
    dispose();
  });

  it("writes through on set and resets on remove", () => {
    const { store } = stubStorage();
    const dispose = createRoot((d) => {
      const theme = createLocalStorage<"light" | "dark">("theme", "light");
      expect(theme.value()).toBe("light");
      theme.set("dark");
      expect(theme.value()).toBe("dark");
      expect(store.get("theme")).toBe('"dark"');
      theme.set((prev) => (prev === "dark" ? "light" : "dark"));
      expect(theme.value()).toBe("light");
      theme.remove();
      expect(theme.value()).toBe("light");
      expect(store.has("theme")).toBe(false);
      return d;
    });
    dispose();
  });

  it("syncs across tabs via storage events", () => {
    const { fireStorage } = stubStorage();
    let value!: Accessor<string>;
    const dispose = createRoot((d) => {
      value = createLocalStorage("theme", "light").value;
      return d;
    });
    fireStorage("theme", '"dark"');
    expect(value()).toBe("dark");
    fireStorage("other-key", '"dark"');
    expect(value()).toBe("dark"); // unrelated key ignored
    fireStorage("theme", null); // cleared in the other tab
    expect(value()).toBe("light");
    dispose();
  });

  it("behaves like a plain signal without storage", () => {
    // No window stubbed: server path.
    const dispose = createRoot((d) => {
      const theme = createLocalStorage("theme", "light");
      expect(theme.value()).toBe("light");
      theme.set("dark");
      expect(theme.value()).toBe("dark");
      theme.remove();
      expect(theme.value()).toBe("light");
      return d;
    });
    dispose();
  });
});

describe("createMediaQuery", () => {
  function stubMatchMedia() {
    let matches = false;
    const listeners = new Set<(e: unknown) => void>();
    stubWindow({
      matchMedia: (query: string) => ({
        matches,
        media: query,
        addEventListener: (t: string, fn: (e: unknown) => void) => {
          if (t === "change") listeners.add(fn);
        },
        removeEventListener: (t: string, fn: (e: unknown) => void) => {
          listeners.delete(fn);
        },
      }),
    });
    return {
      setMatches: (m: boolean) => {
        matches = m;
        listeners.forEach((fn) => fn({ matches: m }));
      },
    };
  }

  it("tracks the query live", () => {
    const { setMatches } = stubMatchMedia();
    let wide!: Accessor<boolean>;
    const dispose = createRoot((d) => {
      wide = createMediaQuery("(min-width: 1024px)");
      return d;
    });
    expect(wide()).toBe(false);
    setMatches(true);
    expect(wide()).toBe(true);
    setMatches(false);
    expect(wide()).toBe(false);
    dispose();
  });

  it("is SSR-safe: constant false", () => {
    const dispose = createRoot((d) => {
      expect(createMediaQuery("(min-width: 1024px)")()).toBe(false);
      return d;
    });
    dispose();
  });
});

describe("createClickOutside", () => {
  function stubPointer() {
    const listeners = new Map<string, Set<(e: unknown) => void>>();
    stubWindow({
      addEventListener: (t: string, fn: (e: unknown) => void) => {
        let set = listeners.get(t);
        if (!set) {
          set = new Set();
          listeners.set(t, set);
        }
        set.add(fn);
      },
      removeEventListener: (t: string, fn: (e: unknown) => void) => {
        listeners.get(t)?.delete(fn);
      },
    });
    return {
      fire: (target: unknown) => {
        listeners
          .get("pointerdown")
          ?.forEach((fn) => fn({ target, composedPath: () => [] }));
      },
    };
  }

  it("calls the handler only for outside presses", () => {
    const { fire } = stubPointer();
    const inner = { contains: (n: unknown) => n === "inner-node" };
    const handler = vi.fn();
    const dispose = createRoot((d) => {
      createClickOutside(() => inner as unknown as Element, handler);
      return d;
    });
    fire("inner-node");
    expect(handler).not.toHaveBeenCalled();
    fire("outer-node");
    expect(handler).toHaveBeenCalledTimes(1);
    dispose();
    fire("outer-node");
    expect(handler).toHaveBeenCalledTimes(1); // listener removed
    dispose();
  });

  it("is SSR-safe: no-op without a window", () => {
    const dispose = createRoot((d) => {
      expect(() =>
        createClickOutside(
          () => null,
          () => {},
        ),
      ).not.toThrow();
      return d;
    });
    dispose();
  });
});

describe("createScrollLock", () => {
  function stubBody() {
    const style: Record<string, string> = { overflow: "auto" };
    stubWindow();
    vi.stubGlobal("document", { body: { style } });
    return style;
  }

  it("locks body scroll and restores the original overflow", () => {
    const style = stubBody();
    const dispose = createRoot((d) => {
      const scroll = createScrollLock();
      expect(scroll.locked()).toBe(false);
      scroll.lock();
      expect(style.overflow).toBe("hidden");
      expect(scroll.locked()).toBe(true);
      scroll.unlock();
      expect(style.overflow).toBe("auto");
      expect(scroll.locked()).toBe(false);
      return d;
    });
    dispose();
  });

  it("reference-counts nested locks", () => {
    const style = stubBody();
    const dispose = createRoot((d) => {
      const a = createScrollLock();
      const b = createScrollLock();
      a.lock();
      b.lock();
      a.unlock();
      expect(style.overflow).toBe("hidden"); // b still holds
      expect(a.locked()).toBe(false);
      expect(b.locked()).toBe(true);
      b.unlock();
      expect(style.overflow).toBe("auto");
      return d;
    });
    dispose();
  });

  it("releases its locks on unmount", () => {
    const style = stubBody();
    const dispose = createRoot((d) => {
      const scroll = createScrollLock();
      scroll.lock();
      scroll.lock();
      expect(style.overflow).toBe("hidden");
      return d;
    });
    dispose();
    expect(style.overflow).toBe("auto");
  });

  it("is SSR-safe: lock/unlock are no-ops", () => {
    const dispose = createRoot((d) => {
      const scroll = createScrollLock();
      scroll.lock();
      expect(scroll.locked()).toBe(false);
      scroll.unlock();
      return d;
    });
    dispose();
  });
});

describe("createInfiniteScroll", () => {
  interface ObserverStub {
    cb: (entries: Array<{ isIntersecting: boolean }>) => void;
    opts: { rootMargin: string };
    el: unknown;
    disconnectCount: number;
  }

  function stubObserver() {
    const observers: ObserverStub[] = [];
    stubWindow();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        cb: ObserverStub["cb"];
        opts: ObserverStub["opts"];
        el: unknown;
        disconnectCount = 0;
        constructor(
          cb: ObserverStub["cb"],
          opts: ObserverStub["opts"],
        ) {
          this.cb = cb;
          this.opts = opts;
          observers.push(this as unknown as ObserverStub);
        }
        observe(el: unknown) {
          this.el = el;
        }
        disconnect() {
          this.disconnectCount++;
        }
      },
    );
    return observers;
  }

  it("calls onLoadMore as the sentinel approaches", async () => {
    const observers = stubObserver();
    const onLoadMore = vi.fn();
    const sentinel = {};
    const dispose = createRoot((d) => {
      createInfiniteScroll(() => sentinel as unknown as Element, {
        onLoadMore,
        threshold: 200,
      });
      return d;
    });
    await sleep(0); // let the bind effect run
    expect(observers).toHaveLength(1);
    expect(observers[0].opts.rootMargin).toBe("200px");
    expect(observers[0].el).toBe(sentinel);
    observers[0].cb([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    observers[0].cb([{ isIntersecting: false }]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("disabled stops the sentinel from being observed", async () => {
    const observers = stubObserver();
    let setHasMore!: (v: boolean) => void;
    const dispose = createRoot((d) => {
      const [hasMore, set] = createSignal(false);
      setHasMore = set;
      createInfiniteScroll(() => ({}) as unknown as Element, {
        onLoadMore: () => {},
        disabled: () => !hasMore(),
      });
      return d;
    });
    await sleep(0);
    expect(observers).toHaveLength(0); // disabled from the start: nothing observed
    setHasMore(true);
    await sleep(0);
    expect(observers).toHaveLength(1); // enabled: sentinel observed
    setHasMore(false);
    await sleep(0);
    expect(observers[0].disconnectCount).toBe(1); // re-run disconnected it
    dispose();
  });

  it("is SSR-safe: never fires without IntersectionObserver", async () => {
    stubWindow(); // no IntersectionObserver stubbed
    const onLoadMore = vi.fn();
    const dispose = createRoot((d) => {
      createInfiniteScroll(() => ({}) as unknown as Element, { onLoadMore });
      return d;
    });
    await sleep(0);
    expect(onLoadMore).not.toHaveBeenCalled();
    dispose();
  });
});
