import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";

type MaybeElement = () => Element | null | undefined;

/* ------------------------------------------------------------------ */
/* createColorScheme                                                    */
/* ------------------------------------------------------------------ */

/** Resolved color scheme. */
export type ColorScheme = "light" | "dark";

/** Stored preference: an explicit scheme or following the OS. */
export type ColorSchemePreference = ColorScheme | "system";

export interface ColorSchemeOptions {
  /** Preference used when nothing is stored. Default "system". */
  default?: ColorSchemePreference;
  /**
   * localStorage key for the preference. Set to null to disable
   * persistence. Default "solid-drift:color-scheme".
   */
  storageKey?: string | null;
  /**
   * Attribute written on `<html>` with the resolved scheme, so CSS can
   * hook onto it (`html[data-theme="dark"] { ... }`). Default "data-theme".
   */
  attribute?: string;
}

export interface ColorSchemeControls {
  /** Resolved scheme: the preference, or the OS scheme when "system". */
  scheme: Accessor<ColorScheme>;
  /** The stored preference, "system" included. */
  preference: Accessor<ColorSchemePreference>;
  setPreference: (preference: ColorSchemePreference) => void;
  /** Flips between light and dark, leaving "system" behind. */
  toggle: () => void;
}

const isSchemePreference = (value: unknown): value is ColorSchemePreference =>
  value === "light" || value === "dark" || value === "system";

/**
 * Color scheme manager. Resolves "system" through the
 * `(prefers-color-scheme: dark)` media query (reactive to OS changes),
 * persists the preference to localStorage, and writes the resolved
 * scheme to `<html data-theme="light|dark">` plus `color-scheme` so
 * form controls and scrollbars follow.
 *
 * SSR-safe: resolves "system" to "light" on the server.
 *
 * ```tsx
 * const theme = createColorScheme();
 * <button onClick={theme.toggle}>
 *   {theme.scheme() === "dark" ? "Light mode" : "Dark mode"}
 * </button>
 * ```
 */
export function createColorScheme(
  options: ColorSchemeOptions = {},
): ColorSchemeControls {
  const {
    default: defaultPreference = "system",
    storageKey = "solid-drift:color-scheme",
    attribute = "data-theme",
  } = options;

  const readStored = (): ColorSchemePreference | null => {
    if (!storageKey || typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return isSchemePreference(raw) ? raw : null;
    } catch {
      return null;
    }
  };

  const [preference, setPreference] =
    createSignal<ColorSchemePreference>(readStored() ?? defaultPreference);
  const [systemDark, setSystemDark] = createSignal(false);

  if (typeof window !== "undefined") {
    createEffect(() => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      setSystemDark(mq.matches);
      const onChange = (event: MediaQueryListEvent): void => {
        setSystemDark(event.matches);
      };
      mq.addEventListener("change", onChange);
      onCleanup(() => mq.removeEventListener("change", onChange));
    });

    createEffect(() => {
      const stored = preference();
      const resolved: ColorScheme =
        stored === "system" ? (systemDark() ? "dark" : "light") : stored;
      const root = document.documentElement;
      root.setAttribute(attribute, resolved);
      root.style.colorScheme = resolved;
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, preference());
        } catch {
          // Storage can be unavailable (private mode); the in-memory
          // preference still works for the session.
        }
      }
    });
  }

  const scheme = (): ColorScheme => {
    const p = preference();
    if (p !== "system") return p;
    if (typeof window === "undefined") return "light";
    return systemDark() ? "dark" : "light";
  };

  return {
    scheme,
    preference,
    setPreference,
    toggle: () => setPreference(scheme() === "dark" ? "light" : "dark"),
  };
}

/* ------------------------------------------------------------------ */
/* createIdle                                                           */
/* ------------------------------------------------------------------ */

export interface IdleOptions {
  /** Ms of inactivity before `idle()` flips true. Default 60000. */
  timeout?: number;
  /**
   * Activity events that reset the timer. Default mousemove, mousedown,
   * keydown, touchstart and wheel.
   */
  events?: string[];
  /** Start in the idle state. Default false. */
  initialIdle?: boolean;
}

export interface IdleControls {
  /** True once `timeout` ms passed without activity. */
  idle: Accessor<boolean>;
  /** Timestamp of the last activity. */
  lastActive: Accessor<number>;
  /** Mark the user active now and restart the timer. */
  reset: () => void;
}

/**
 * Idle detection. `idle()` becomes true after `timeout` ms without any
 * of the activity events; any activity flips it back and restarts the
 * timer. Useful for auto-hiding chrome, pausing ambient animation, or
 * "are you still there" prompts.
 *
 * SSR-safe: never idle on the server.
 *
 * ```tsx
 * const { idle } = createIdle({ timeout: 30_000 });
 * <div classList={{ "controls-hidden": idle() }}>…</div>
 * ```
 */
export function createIdle(options: IdleOptions = {}): IdleControls {
  const {
    timeout = 60_000,
    events = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"],
    initialIdle = false,
  } = options;

  if (typeof window === "undefined") {
    const falsy = () => false;
    return { idle: falsy, lastActive: () => 0, reset: () => {} };
  }

  const [idle, setIdle] = createSignal(initialIdle);
  const [lastActive, setLastActive] = createSignal(Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;

  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => setIdle(true), Math.max(timeout, 0));
  };

  const onActivity = (): void => {
    setLastActive(Date.now());
    setIdle(false);
    arm();
  };

  createEffect(() => {
    for (const name of events) {
      window.addEventListener(name, onActivity, { passive: true });
    }
    arm();
    onCleanup(() => {
      for (const name of events) {
        window.removeEventListener(name, onActivity);
      }
      clearTimeout(timer);
    });
  });

  return { idle, lastActive, reset: onActivity };
}

/* ------------------------------------------------------------------ */
/* createOnline                                                         */
/* ------------------------------------------------------------------ */

export interface OnlineControls {
  /** Mirrors `navigator.onLine`, updated on online/offline events. */
  online: Accessor<boolean>;
}

/**
 * Network connectivity state. Seeds from `navigator.onLine` and follows
 * the window `online` / `offline` events. SSR-safe: assumes online on
 * the server.
 *
 * ```tsx
 * const { online } = createOnline();
 * <Show when={!online()}>
 *   <p>You are offline. Changes will sync when you reconnect.</p>
 * </Show>
 * ```
 */
export function createOnline(): OnlineControls {
  if (typeof window === "undefined") return { online: () => true };

  const [online, setOnline] = createSignal(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  createEffect(() => {
    const goOnline = (): void => {
      setOnline(true);
    };
    const goOffline = (): void => {
      setOnline(false);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    onCleanup(() => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    });
  });

  return { online };
}

/* ------------------------------------------------------------------ */
/* createInstallPrompt                                                  */
/* ------------------------------------------------------------------ */

/** Minimal shape of the PWA `beforeinstallprompt` event. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallPromptControls {
  /** True once the browser fired `beforeinstallprompt`. */
  canInstall: Accessor<boolean>;
  /**
   * Shows the install prompt. Returns the user's choice, or null when
   * the browser never offered installation. Each captured event can be
   * used once.
   */
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" } | null>;
}

/**
 * PWA install prompt. Captures the `beforeinstallprompt` event (calling
 * `preventDefault()` so the browser does not show its own mini-bar) and
 * exposes it through `prompt()`, which is safe to call from a click
 * handler. SSR-safe: never installable on the server.
 *
 * ```tsx
 * const install = createInstallPrompt();
 * <Show when={install.canInstall()}>
 *   <button
 *     onClick={async () => {
 *       const choice = await install.prompt();
 *       if (choice?.outcome === "accepted") toast("Installed!");
 *     }}
 *   >
 *     Install app
 *   </button>
 * </Show>
 * ```
 */
export function createInstallPrompt(): InstallPromptControls {
  if (typeof window === "undefined") {
    return { canInstall: () => false, prompt: async () => null };
  }

  const [deferred, setDeferred] =
    createSignal<BeforeInstallPromptEvent | null>(null);

  createEffect(() => {
    const onBeforeInstall = (event: Event): void => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    onCleanup(() =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall),
    );
  });

  const prompt = async (): Promise<
    { outcome: "accepted" | "dismissed" } | null
  > => {
    const event = deferred();
    if (!event) return null;
    setDeferred(null);
    await event.prompt();
    return event.userChoice;
  };

  return { canInstall: () => deferred() !== null, prompt };
}

/* ------------------------------------------------------------------ */
/* createUndo                                                           */
/* ------------------------------------------------------------------ */

export interface UndoOptions {
  /** Maximum snapshots kept. Older ones are dropped. Default 50. */
  capacity?: number;
}

export interface UndoControls<T> {
  /** Current value. */
  value: Accessor<T>;
  /** Set a new value, recording the previous one for undo. */
  set: (value: T | ((prev: T) => T)) => void;
  /** Step back; no-op when there is nothing to undo. */
  undo: () => void;
  /** Step forward; no-op when there is nothing to redo. */
  redo: () => void;
  /** Drop all history without touching the value. */
  clear: () => void;
  /** Restore the initial value and drop all history. */
  reset: () => void;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  /** Undo stack, oldest first. */
  past: Accessor<readonly T[]>;
  /** Redo stack, next redo first. */
  future: Accessor<readonly T[]>;
}

/**
 * Undoable state. `set()` records the previous value, `undo()` steps
 * back through history, `redo()` steps forward, and any new `set()`
 * discards the redo stack. Pure logic: no DOM, SSR-safe.
 *
 * ```tsx
 * const doc = createUndo({ title: "", body: "" }, { capacity: 100 });
 * <input
 *   value={doc.value().title}
 *   onInput={(e) => doc.set((d) => ({ ...d, title: e.target.value }))}
 * />
 * <button disabled={!doc.canUndo()} onClick={doc.undo}>Undo</button>
 * <button disabled={!doc.canRedo()} onClick={doc.redo}>Redo</button>
 * ```
 */
export function createUndo<T>(
  initial: T,
  options: UndoOptions = {},
): UndoControls<T> {
  const { capacity = 50 } = options;
  const limit = Math.max(Math.floor(capacity), 1);

  const [value, setValue] = createSignal<T>(initial);
  const [past, setPast] = createSignal<T[]>([]);
  const [future, setFuture] = createSignal<T[]>([]);

  const set = (next: T | ((prev: T) => T)): void => {
    const current = untrack(value);
    const resolved =
      typeof next === "function" ? (next as (prev: T) => T)(current) : next;
    setPast((stack) => [...stack.slice(-(limit - 1)), current]);
    setFuture([]);
    setValue(resolved as Exclude<T, Function>);
  };

  const undo = (): void => {
    const stack = untrack(past);
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    setFuture((redo) => [untrack(value), ...redo]);
    setPast(stack.slice(0, -1));
    setValue(previous as Exclude<T, Function>);
  };

  const redo = (): void => {
    const stack = untrack(future);
    if (stack.length === 0) return;
    const [next, ...rest] = stack;
    setPast((done) => [...done.slice(-(limit - 1)), untrack(value)]);
    setFuture(rest);
    setValue(next as Exclude<T, Function>);
  };

  const clear = (): void => {
    setPast([]);
    setFuture([]);
  };

  const reset = (): void => {
    clear();
    setValue(initial as Exclude<T, Function>);
  };

  return {
    value,
    set,
    undo,
    redo,
    clear,
    reset,
    canUndo: () => past().length > 0,
    canRedo: () => future().length > 0,
    past: past as Accessor<readonly T[]>,
    future: future as Accessor<readonly T[]>,
  };
}

/* ------------------------------------------------------------------ */
/* createFullscreen                                                     */
/* ------------------------------------------------------------------ */

export interface FullscreenOptions {
  /** Called when entering/exiting fails or is unsupported. */
  onError?: (error: unknown) => void;
}

export interface FullscreenControls {
  /** True while the referenced element is the fullscreen element. */
  fullscreen: Accessor<boolean>;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  toggle: () => Promise<void>;
}

/**
 * Fullscreen for an element. Tracks `document.fullscreenElement` so the
 * state stays correct when the user presses Escape or another element
 * takes over. Failures (unsupported browser, denied request) go to
 * `onError` instead of throwing. SSR-safe: never fullscreen on the
 * server.
 *
 * ```tsx
 * let stage!: HTMLDivElement;
 * const fs = createFullscreen(() => stage);
 * <button onClick={fs.toggle}>
 *   {fs.fullscreen() ? "Exit fullscreen" : "Go fullscreen"}
 * </button>
 * <div ref={stage}>…</div>
 * ```
 */
export function createFullscreen(
  ref: MaybeElement,
  options: FullscreenOptions = {},
): FullscreenControls {
  const { onError } = options;

  if (typeof window === "undefined") {
    const falsy = () => false;
    const noop = async (): Promise<void> => {};
    return { fullscreen: falsy, enter: noop, exit: noop, toggle: noop };
  }

  const [fullscreen, setFullscreen] = createSignal(false);

  const sync = (): void => {
    const el = ref();
    setFullscreen(el != null && document.fullscreenElement === el);
  };

  createEffect(() => {
    sync();
    document.addEventListener("fullscreenchange", sync);
    onCleanup(() => document.removeEventListener("fullscreenchange", sync));
  });

  const enter = async (): Promise<void> => {
    const el = ref() as (Element & {
      requestFullscreen?: () => Promise<void>;
    }) | null;
    if (!el || typeof el.requestFullscreen !== "function") {
      onError?.(new Error("Fullscreen is not supported"));
      return;
    }
    try {
      await el.requestFullscreen();
    } catch (error) {
      onError?.(error);
    }
  };

  const exit = async (): Promise<void> => {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch (error) {
      onError?.(error);
    }
  };

  const toggle = async (): Promise<void> => {
    if (fullscreen()) await exit();
    else await enter();
  };

  return { fullscreen, enter, exit, toggle };
}
