/**
 * Browser and DOM utilities.
 *
 * Reactive wrappers around geolocation, element sizing, event listeners,
 * keyboard shortcuts, relative time, permissions, and script loading.
 * Everything is SSR-safe: unsupported or server environments degrade to
 * no-ops instead of throwing.
 */

import {
  createSignal,
  createEffect,
  onCleanup,
  type Accessor,
} from "solid-js";
import type { RequestStatus } from "./network.js";

/* ------------------------------------------------------------------ */
/* createEventListener                                                   */
/* ------------------------------------------------------------------ */

/**
 * Attach an event listener to a target (or target accessor) with automatic
 * cleanup. Safe to call with an undefined target; nothing is attached.
 */
export function createEventListener<E extends Event = Event>(
  target: EventTarget | (() => EventTarget | undefined | null),
  type: string,
  handler: (event: E) => void,
  options?: AddEventListenerOptions,
): void {
  createEffect(() => {
    const el = typeof target === "function" ? target() : target;
    if (!el) return;
    const listener = (event: Event): void => {
      handler(event as E);
    };
    el.addEventListener(type, listener, options);
    onCleanup(() => {
      el.removeEventListener(type, listener, options);
    });
  });
}

/* ------------------------------------------------------------------ */
/* createElementSize                                                     */
/* ------------------------------------------------------------------ */

export interface ElementSizeOptions {
  /** Inject a ResizeObserver implementation (tests). */
  ResizeObserverImpl?: typeof ResizeObserver;
}

export interface ElementSize {
  width: Accessor<number>;
  height: Accessor<number>;
}

/**
 * Reactive element size via ResizeObserver. Reports 0x0 until the first
 * measurement, and on the server.
 */
export function createElementSize(
  target: () => HTMLElement | undefined | null,
  options: ElementSizeOptions = {},
): ElementSize {
  const RO =
    options.ResizeObserverImpl ??
    (typeof ResizeObserver !== "undefined" ? ResizeObserver : undefined);
  const [width, setWidth] = createSignal(0);
  const [height, setHeight] = createSignal(0);

  createEffect(() => {
    const el = target();
    if (!el || !RO) return;
    const observer = new RO((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setWidth(rect.width);
        setHeight(rect.height);
      }
    });
    observer.observe(el);
    onCleanup(() => {
      observer.disconnect();
    });
  });

  return { width, height };
}

/* ------------------------------------------------------------------ */
/* createGeolocation                                                     */
/* ------------------------------------------------------------------ */

export interface GeolocationOptions extends PositionOptions {
  /** Read immediately on the client. Default true. */
  immediate?: boolean;
  /** Keep watching the position instead of reading once. Default false. */
  watch?: boolean;
  /** Inject a navigator implementation (tests). */
  navigatorImpl?: Navigator;
}

export interface GeolocationControls {
  position: Accessor<GeolocationPosition | undefined>;
  coords: Accessor<GeolocationCoordinates | undefined>;
  error: Accessor<GeolocationPositionError | undefined>;
  /** False on the server or where the API is missing. */
  supported: boolean;
  /** Re-read the position. */
  refresh: () => void;
}

/**
 * Reactive geolocation. Reads once by default; pass `watch: true` for live
 * updates (cleaned up automatically). `supported` is false on the server.
 */
export function createGeolocation(
  options: GeolocationOptions = {},
): GeolocationControls {
  const { immediate = true, watch = false, navigatorImpl, ...positionOptions } =
    options;
  const geo =
    navigatorImpl?.geolocation ??
    (typeof navigator !== "undefined" ? navigator.geolocation : undefined);
  const supported = !!geo;

  const [position, setPosition] = createSignal<GeolocationPosition | undefined>(
    undefined,
  );
  const [error, setError] = createSignal<
    GeolocationPositionError | undefined
  >(undefined);
  let watchId: number | undefined;

  const stopWatching = (): void => {
    if (watchId !== undefined && geo) {
      geo.clearWatch(watchId);
      watchId = undefined;
    }
  };

  const read = (): void => {
    if (!geo) return;
    setError(undefined);
    if (watch) {
      stopWatching();
      watchId = geo.watchPosition(
        (pos) => setPosition(pos),
        (err) => setError(err),
        positionOptions,
      );
    } else {
      geo.getCurrentPosition(
        (pos) => setPosition(pos),
        (err) => setError(err),
        positionOptions,
      );
    }
  };

  const refresh = (): void => {
    read();
  };

  if (typeof window !== "undefined" && immediate) {
    read();
  }
  onCleanup(stopWatching);

  return {
    position,
    coords: () => position()?.coords,
    error,
    supported,
    refresh,
  };
}

/* ------------------------------------------------------------------ */
/* createHotkey                                                          */
/* ------------------------------------------------------------------ */

interface ParsedHotkey {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

function parseHotkey(combo: string): ParsedHotkey {
  const parsed: ParsedHotkey = {
    key: "",
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
  };
  for (const raw of combo.toLowerCase().split("+")) {
    const part = raw.trim();
    if (part === "ctrl" || part === "control") parsed.ctrl = true;
    else if (part === "cmd" || part === "meta" || part === "command")
      parsed.meta = true;
    else if (part === "alt" || part === "opt" || part === "option")
      parsed.alt = true;
    else if (part === "shift") parsed.shift = true;
    else parsed.key = part;
  }
  return parsed;
}

function matchesHotkey(event: KeyboardEvent, combo: ParsedHotkey): boolean {
  return (
    event.ctrlKey === combo.ctrl &&
    event.metaKey === combo.meta &&
    event.altKey === combo.alt &&
    event.shiftKey === combo.shift &&
    event.key.toLowerCase() === combo.key
  );
}

export interface HotkeyOptions {
  /** Where to listen. Defaults to window on the client. */
  target?: EventTarget | (() => EventTarget | undefined | null);
  /** Call preventDefault on match. Default true. */
  preventDefault?: boolean;
  /** Disable the hotkey without removing it. */
  enabled?: boolean | Accessor<boolean>;
}

/**
 * Keyboard shortcut handler. Combos look like "ctrl+k", "cmd+shift+p",
 * or "?" (modifiers: ctrl, cmd/meta, alt/opt, shift). The handler runs
 * when every modifier and the key match.
 */
export function createHotkey(
  keys: string | string[],
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const combos = (Array.isArray(keys) ? keys : [keys]).map(parseHotkey);
  const { preventDefault = true } = options;

  const resolveTarget = (): EventTarget | undefined | null => {
    if (options.target === undefined) {
      return typeof window !== "undefined" ? window : undefined;
    }
    return typeof options.target === "function"
      ? (options.target as () => EventTarget | undefined | null)()
      : (options.target as EventTarget);
  };

  const isEnabled = (): boolean =>
    typeof options.enabled === "function"
      ? (options.enabled as Accessor<boolean>)()
      : (options.enabled ?? true);

  const onKeydown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (!isEnabled()) return;
    for (const combo of combos) {
      if (matchesHotkey(keyboardEvent, combo)) {
        if (preventDefault) keyboardEvent.preventDefault();
        handler(keyboardEvent);
        break;
      }
    }
  };

  createEventListener(resolveTarget, "keydown", onKeydown);
}

/* ------------------------------------------------------------------ */
/* createTimeAgo                                                         */
/* ------------------------------------------------------------------ */

export interface TimeAgoOptions {
  /** How often to recompute, in ms. Default 30000. */
  updateIntervalMs?: number;
  /** BCP 47 locale for Intl.RelativeTimeFormat. */
  locale?: string;
}

function formatTimeAgo(targetMs: number, nowMs: number, locale?: string): string {
  const diffSec = Math.round((targetMs - nowMs) / 1000);
  if (Math.abs(diffSec) < 5) return "just now";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = diffSec;
  for (const [amount, unit] of divisions) {
    if (Math.abs(value) < amount) {
      return rtf.format(Math.round(value), unit);
    }
    value /= amount;
  }
  return rtf.format(Math.round(value), "year");
}

/**
 * Reactive relative time ("5 minutes ago", "yesterday", "in 3 hours").
 * Recomputes on `updateIntervalMs`; renders once on the server.
 */
export function createTimeAgo(
  date: () => Date | number | string,
  options: TimeAgoOptions = {},
): Accessor<string> {
  const { updateIntervalMs = 30000, locale } = options;
  const [now, setNow] = createSignal(Date.now());

  if (typeof window !== "undefined") {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, updateIntervalMs);
    onCleanup(() => {
      clearInterval(timer);
    });
  }

  return () => formatTimeAgo(new Date(date()).getTime(), now(), locale);
}

/* ------------------------------------------------------------------ */
/* createPermission                                                      */
/* ------------------------------------------------------------------ */

export type PermissionStateValue = "granted" | "denied" | "prompt";

export interface PermissionOptions {
  /** Query immediately on the client. Default true. */
  immediate?: boolean;
  /** Inject a navigator implementation (tests). */
  navigatorImpl?: Navigator;
}

export interface PermissionControls {
  state: Accessor<PermissionStateValue | undefined>;
  /** False on the server or where the Permissions API is missing. */
  supported: boolean;
  query: () => void;
}

/**
 * Reactive wrapper around the Permissions API. `state()` is "granted",
 * "denied", "prompt", or undefined while unknown.
 */
export function createPermission(
  name: string,
  options: PermissionOptions = {},
): PermissionControls {
  const { immediate = true, navigatorImpl } = options;
  const nav =
    navigatorImpl ?? (typeof navigator !== "undefined" ? navigator : undefined);
  const supported = !!nav?.permissions?.query;

  const [state, setState] = createSignal<PermissionStateValue | undefined>(
    undefined,
  );

  const query = (): void => {
    if (!supported || !nav?.permissions) return;
    void nav.permissions
      .query({ name } as PermissionDescriptor)
      .then(
        (status) => {
          setState(status.state as PermissionStateValue);
        },
        () => {
          setState(undefined);
        },
      );
  };

  if (typeof window !== "undefined" && immediate) {
    query();
  }

  return { state, supported, query };
}

/* ------------------------------------------------------------------ */
/* createScriptLoader                                                    */
/* ------------------------------------------------------------------ */

export interface ScriptLoaderOptions {
  attrs?: Record<string, string>;
  /** Inject a document implementation (tests). */
  documentImpl?: Document;
}

export interface ScriptLoaderControls {
  loaded: Accessor<boolean>;
  error: Accessor<unknown>;
  status: Accessor<RequestStatus>;
  /** Inject the script (no-op when already loaded). */
  load: () => void;
}

/** Script URLs that already loaded successfully in this page. */
const loadedScripts = new Set<string>();

/**
 * Load an external script once and track it reactively. Repeat calls with
 * the same src resolve immediately without injecting a second tag.
 * No-op on the server.
 */
export function createScriptLoader(
  src: string | (() => string),
  options: ScriptLoaderOptions = {},
): ScriptLoaderControls {
  const doc =
    options.documentImpl ??
    (typeof document !== "undefined" ? document : undefined);

  const [status, setStatus] = createSignal<RequestStatus>("idle");
  const [error, setError] = createSignal<unknown>(undefined);

  const resolveSrc = (): string =>
    typeof src === "function" ? (src as () => string)() : (src as string);

  const load = (): void => {
    const target = resolveSrc();
    if (loadedScripts.has(target)) {
      setStatus("success");
      return;
    }
    if (!doc) return;
    setStatus("loading");
    setError(undefined);

    const el = doc.createElement("script");
    el.src = target;
    el.async = true;
    for (const [key, value] of Object.entries(options.attrs ?? {})) {
      el.setAttribute(key, value);
    }
    const onLoad = (): void => {
      loadedScripts.add(target);
      cleanup();
      setStatus("success");
    };
    const onError = (): void => {
      cleanup();
      setError(new Error(`Failed to load script: ${target}`));
      setStatus("error");
    };
    const cleanup = (): void => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    doc.head.appendChild(el);
    onCleanup(() => {
      cleanup();
      el.remove();
    });
  };

  return {
    loaded: () => status() === "success",
    error,
    status,
    load,
  };
}
