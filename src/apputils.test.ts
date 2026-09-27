import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "solid-js";
import {
  createColorScheme,
  createFullscreen,
  createIdle,
  createInstallPrompt,
  createOnline,
  createUndo,
  type BeforeInstallPromptEvent,
} from "./apputils.js";

type Listener = (event: any) => void;

const makeEmitter = () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: vi.fn((type: string, fn: Listener) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: Listener) => {
      listeners.get(type)?.delete(fn);
    }),
    fire: (type: string, event: any = {}) => {
      listeners.get(type)?.forEach((fn) => fn(event));
    },
  };
};

const makeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
};

interface BrowserStubs {
  windowEmitter: ReturnType<typeof makeEmitter>;
  documentEmitter: ReturnType<typeof makeEmitter>;
  storage: ReturnType<typeof makeStorage>;
  documentElement: {
    setAttribute: ReturnType<typeof vi.fn>;
    style: Record<string, string>;
  };
  systemDark: { value: boolean };
  navigatorOnLine: { value: boolean };
  fullscreenEl: { value: unknown };
}

let stubs!: BrowserStubs;

beforeEach(() => {
  vi.useFakeTimers();
  const windowEmitter = makeEmitter();
  const documentEmitter = makeEmitter();
  const storage = makeStorage();
  const documentElement = {
    setAttribute: vi.fn(),
    style: {} as Record<string, string>,
  };
  const systemDark = { value: false };
  const navigatorOnLine = { value: true };
  const fullscreenEl = { value: null as unknown };
  stubs = {
    windowEmitter,
    documentEmitter,
    storage,
    documentElement,
    systemDark,
    navigatorOnLine,
    fullscreenEl,
  };

  vi.stubGlobal("window", {
    addEventListener: windowEmitter.addEventListener,
    removeEventListener: windowEmitter.removeEventListener,
    localStorage: storage,
    matchMedia: (query: string) => ({
      matches: query.includes("prefers-color-scheme") ? systemDark.value : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  vi.stubGlobal("document", {
    documentElement,
    addEventListener: documentEmitter.addEventListener,
    removeEventListener: documentEmitter.removeEventListener,
    get fullscreenElement() {
      return fullscreenEl.value;
    },
    exitFullscreen: vi.fn(async () => {
      fullscreenEl.value = null;
    }),
  });
  vi.stubGlobal("navigator", {
    get onLine() {
      return navigatorOnLine.value;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const owned = <T>(factory: () => T): { controls: T; dispose: () => void } => {
  let controls!: T;
  const dispose = createRoot((d) => {
    controls = factory();
    return d;
  });
  return { controls, dispose };
};

describe("createColorScheme", () => {
  it("follows the OS in system mode and writes to the document", () => {
    const { controls: theme, dispose } = owned(() => createColorScheme());
    expect(theme.preference()).toBe("system");
    expect(theme.scheme()).toBe("light");
    expect(stubs.documentElement.setAttribute).toHaveBeenCalledWith(
      "data-theme",
      "light",
    );
    expect(stubs.documentElement.style.colorScheme).toBe("light");
    dispose();
  });

  it("setPreference and toggle switch the scheme and persist it", () => {
    const { controls: theme, dispose } = owned(() => createColorScheme());
    theme.setPreference("dark");
    expect(theme.scheme()).toBe("dark");
    expect(stubs.documentElement.setAttribute).toHaveBeenLastCalledWith(
      "data-theme",
      "dark",
    );
    expect(stubs.storage._store.get("solid-drift:color-scheme")).toBe("dark");
    theme.toggle();
    expect(theme.scheme()).toBe("light");
    expect(theme.preference()).toBe("light");
    dispose();
  });

  it("restores the stored preference", () => {
    stubs.storage._store.set("solid-drift:color-scheme", "dark");
    const { controls: theme, dispose } = owned(() => createColorScheme());
    expect(theme.preference()).toBe("dark");
    expect(theme.scheme()).toBe("dark");
    dispose();
  });

  it("uses the configured default and attribute", () => {
    const { controls: theme, dispose } = owned(() =>
      createColorScheme({
        default: "dark",
        attribute: "data-color",
        storageKey: null,
      }),
    );
    expect(theme.scheme()).toBe("dark");
    expect(stubs.documentElement.setAttribute).toHaveBeenCalledWith(
      "data-color",
      "dark",
    );
    expect(stubs.storage.setItem).not.toHaveBeenCalled();
    dispose();
  });
});

describe("createIdle", () => {
  it("goes idle after the timeout and wakes on activity", () => {
    const { controls: idleCtl, dispose } = owned(() =>
      createIdle({ timeout: 1000 }),
    );
    expect(idleCtl.idle()).toBe(false);
    vi.advanceTimersByTime(999);
    expect(idleCtl.idle()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(idleCtl.idle()).toBe(true);
    stubs.windowEmitter.fire("mousemove");
    expect(idleCtl.idle()).toBe(false);
    expect(idleCtl.lastActive()).toBeGreaterThan(0);
    dispose();
  });

  it("reset restarts the timer", () => {
    const { controls: idleCtl, dispose } = owned(() =>
      createIdle({ timeout: 1000 }),
    );
    vi.advanceTimersByTime(800);
    idleCtl.reset();
    vi.advanceTimersByTime(800);
    expect(idleCtl.idle()).toBe(false);
    vi.advanceTimersByTime(200);
    expect(idleCtl.idle()).toBe(true);
    dispose();
  });

  it("listens to the configured events only", () => {
    const { dispose } = owned(() => createIdle({ events: ["keydown"] }));
    const names = stubs.windowEmitter.addEventListener.mock.calls.map(
      (call) => call[0] as string,
    );
    expect(names).toEqual(["keydown"]);
    dispose();
  });
});

describe("createOnline", () => {
  it("seeds from navigator.onLine and follows events", () => {
    const { controls: net, dispose } = owned(() => createOnline());
    expect(net.online()).toBe(true);
    stubs.navigatorOnLine.value = false;
    stubs.windowEmitter.fire("offline");
    expect(net.online()).toBe(false);
    stubs.navigatorOnLine.value = true;
    stubs.windowEmitter.fire("online");
    expect(net.online()).toBe(true);
    dispose();
  });
});

describe("createInstallPrompt", () => {
  const firePrompt = (outcome: "accepted" | "dismissed" = "accepted") => {
    const event = {
      preventDefault: vi.fn(),
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome }),
    };
    stubs.windowEmitter.fire("beforeinstallprompt", event);
    return event;
  };

  it("captures the event and resolves the user choice", async () => {
    const { controls: install, dispose } = owned(() => createInstallPrompt());
    expect(install.canInstall()).toBe(false);
    expect(await install.prompt()).toBeNull();
    const event = firePrompt("accepted");
    expect(event.preventDefault).toHaveBeenCalled();
    expect(install.canInstall()).toBe(true);
    const choice = await install.prompt();
    expect(event.prompt).toHaveBeenCalled();
    expect(choice).toEqual({ outcome: "accepted" });
    // Each captured event can be used once.
    expect(install.canInstall()).toBe(false);
    expect(await install.prompt()).toBeNull();
    dispose();
  });

  it("reports a dismissed choice", async () => {
    const { controls: install, dispose } = owned(() => createInstallPrompt());
    firePrompt("dismissed");
    await expect(install.prompt()).resolves.toEqual({
      outcome: "dismissed",
    });
    dispose();
  });
});

describe("createUndo", () => {
  it("records, undoes, and redoes", () => {
    const { controls: doc } = owned(() => createUndo(0));
    expect(doc.value()).toBe(0);
    expect(doc.canUndo()).toBe(false);
    doc.set(1);
    doc.set(2);
    expect(doc.value()).toBe(2);
    expect(doc.canUndo()).toBe(true);
    doc.undo();
    expect(doc.value()).toBe(1);
    expect(doc.canRedo()).toBe(true);
    doc.undo();
    expect(doc.value()).toBe(0);
    expect(doc.canUndo()).toBe(false);
    doc.undo(); // no-op
    expect(doc.value()).toBe(0);
    doc.redo();
    expect(doc.value()).toBe(1);
    doc.redo();
    expect(doc.value()).toBe(2);
    expect(doc.canRedo()).toBe(false);
  });

  it("supports updater functions", () => {
    const { controls: doc } = owned(() => createUndo({ n: 0 }));
    doc.set((prev) => ({ n: prev.n + 5 }));
    expect(doc.value()).toEqual({ n: 5 });
    doc.undo();
    expect(doc.value()).toEqual({ n: 0 });
  });

  it("a new set discards the redo stack", () => {
    const { controls: doc } = owned(() => createUndo(0));
    doc.set(1);
    doc.set(2);
    doc.undo();
    doc.set(3);
    expect(doc.value()).toBe(3);
    expect(doc.canRedo()).toBe(false);
    doc.undo();
    expect(doc.value()).toBe(1);
  });

  it("respects capacity and exposes the stacks", () => {
    const { controls: doc } = owned(() => createUndo(0, { capacity: 2 }));
    doc.set(1);
    doc.set(2);
    doc.set(3);
    expect(doc.past()).toEqual([1, 2]);
    doc.undo();
    expect(doc.value()).toBe(2);
    expect(doc.future()).toEqual([3]);
    doc.clear();
    expect(doc.canUndo()).toBe(false);
    expect(doc.canRedo()).toBe(false);
    expect(doc.value()).toBe(2);
    doc.reset();
    expect(doc.value()).toBe(0);
  });
});

describe("createFullscreen", () => {
  const makeTarget = () => ({
    requestFullscreen: vi.fn(async () => {
      stubs.fullscreenEl.value = target;
    }),
  });
  let target!: { requestFullscreen: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    target = makeTarget();
  });

  it("enters, tracks, and exits fullscreen", async () => {
    const { controls: fs, dispose } = owned(() =>
      createFullscreen(() => target as unknown as Element),
    );
    expect(fs.fullscreen()).toBe(false);
    await fs.enter();
    expect(target.requestFullscreen).toHaveBeenCalled();
    stubs.documentEmitter.fire("fullscreenchange");
    expect(fs.fullscreen()).toBe(true);
    await fs.toggle();
    expect(fs.fullscreen()).toBe(true); // event not fired yet
    stubs.documentEmitter.fire("fullscreenchange");
    expect(fs.fullscreen()).toBe(false);
    dispose();
  });

  it("toggle enters when not fullscreen", async () => {
    const { controls: fs, dispose } = owned(() =>
      createFullscreen(() => target as unknown as Element),
    );
    await fs.toggle();
    expect(target.requestFullscreen).toHaveBeenCalled();
    dispose();
  });

  it("reports unsupported via onError instead of throwing", async () => {
    const onError = vi.fn();
    const { controls: fs, dispose } = owned(() =>
      createFullscreen(() => null, { onError }),
    );
    await fs.enter();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fs.fullscreen()).toBe(false);
    dispose();
  });
});
