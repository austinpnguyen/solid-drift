import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
  type Setter,
} from "solid-js";

type MaybeElement = () => Element | null | undefined;

/* ------------------------------------------------------------------ */
/* createDebounced                                                     */
/* ------------------------------------------------------------------ */

/**
 * A signal that follows the source after it stops changing for `delay`
 * ms. The classic search-input pattern: the UI stays live while the
 * query signal waits for a pause before firing network requests.
 *
 * Trailing edge only. The pending update is cancelled on cleanup.
 * SSR-safe: holds the source's initial value on the server.
 *
 * ```tsx
 * const [query, setQuery] = createSignal("")
 * const debounced = createDebounced(query, 300)
 * createEffect(() => {
 *   const q = debounced()
 *   if (q) search(q) // fires only after a 300ms pause
 * })
 * ```
 */
export function createDebounced<T>(
  source: Accessor<T>,
  delay: number,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(untrack(source));
  if (typeof window === "undefined") return value;

  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const next = source();
    clearTimeout(timer);
    timer = setTimeout(() => setValue(() => next), Math.max(0, delay));
  });
  onCleanup(() => clearTimeout(timer));

  return value;
}

/* ------------------------------------------------------------------ */
/* createThrottled                                                     */
/* ------------------------------------------------------------------ */

/**
 * A signal that follows the source at most once per `interval` ms.
 * The first change applies immediately (leading edge); changes inside
 * the window collapse into one trailing update. For scroll or resize
 * handlers that feed expensive work.
 *
 * SSR-safe: holds the source's initial value on the server.
 *
 * ```tsx
 * const throttledY = createThrottled(scrollY, 100)
 * ```
 */
export function createThrottled<T>(
  source: Accessor<T>,
  interval: number,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(untrack(source));
  if (typeof window === "undefined") return value;

  const wait = Math.max(0, interval);
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  createEffect(() => {
    const next = source();
    const t = Date.now();
    clearTimeout(timer);
    timer = undefined;
    if (t - last >= wait) {
      last = t;
      setValue(() => next);
    } else {
      timer = setTimeout(() => {
        last = Date.now();
        timer = undefined;
        setValue(() => next);
      }, wait - (t - last));
    }
  });
  onCleanup(() => clearTimeout(timer));

  return value;
}

/* ------------------------------------------------------------------ */
/* createLocalStorage                                                  */
/* ------------------------------------------------------------------ */

export interface LocalStorageOptions<T> {
  /** Serialize a value. Default JSON.stringify. */
  serialize?: (value: T) => string;
  /** Deserialize a stored string. Default JSON.parse. */
  deserialize?: (raw: string) => T;
  /**
   * React to `storage` events from other tabs. Default true: the
   * signal stays in sync across tabs.
   */
  sync?: boolean;
}

export interface LocalStorageControls<T> {
  value: Accessor<T>;
  set: Setter<T>;
  /** Remove the key from storage and reset to the initial value. */
  remove: () => void;
}

/**
 * A signal persisted to `localStorage`. Reads the stored value on
 * creation (falling back to `initialValue` when missing or corrupt),
 * writes through on every set, and stays in sync across tabs via the
 * `storage` event.
 *
 * SSR-safe and storage-less-safe: without `window.localStorage` it
 * behaves like a plain signal.
 *
 * ```tsx
 * const theme = createLocalStorage<"light" | "dark">("theme", "light")
 * theme.set("dark") // localStorage.theme = '"dark"'
 * ```
 */
export function createLocalStorage<T>(
  key: string,
  initialValue: T,
  options: LocalStorageOptions<T> = {},
): LocalStorageControls<T> {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse as (raw: string) => T,
    sync = true,
  } = options;

  const storage = (): Storage | null => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage;
    } catch {
      return null; // private mode / blocked storage
    }
  };

  const read = (): T => {
    const store = storage();
    if (!store) return initialValue;
    try {
      const raw = store.getItem(key);
      return raw === null ? initialValue : deserialize(raw);
    } catch {
      return initialValue; // corrupt JSON: fall back, don't crash
    }
  };

  const [value, setValue] = createSignal<T>(read());

  const set: Setter<T> = ((next: T | ((prev: T) => T)): T => {
    const resolved =
      typeof next === "function"
        ? (next as (prev: T) => T)(untrack(value))
        : next;
    setValue(() => resolved);
    try {
      storage()?.setItem(key, serialize(resolved));
    } catch {
      // Quota exceeded or blocked: the signal still updates.
    }
    return resolved;
  }) as Setter<T>;

  const remove = (): void => {
    try {
      storage()?.removeItem(key);
    } catch {
      // ignore
    }
    setValue(() => initialValue);
  };

  if (typeof window !== "undefined" && sync) {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== key) return;
      try {
        setValue(() =>
          event.newValue === null ? initialValue : deserialize(event.newValue),
        );
      } catch {
        // ignore corrupt cross-tab writes
      }
    };
    window.addEventListener("storage", onStorage);
    onCleanup(() => window.removeEventListener("storage", onStorage));
  }

  return { value, set, remove };
}

/* ------------------------------------------------------------------ */
/* createMediaQuery                                                    */
/* ------------------------------------------------------------------ */

/**
 * A boolean signal tracking a CSS media query, updating live when the
 * query starts or stops matching. The primitive behind
 * `createPrefersReducedMotion`, generalized.
 *
 * SSR-safe (and safe where `matchMedia` is missing): constant `false`.
 *
 * ```tsx
 * const wide = createMediaQuery("(min-width: 1024px)")
 * const columns = () => (wide() ? 4 : 2)
 * ```
 */
export function createMediaQuery(query: string): Accessor<boolean> {
  const no = () => false;
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return no;
  }
  const mql = window.matchMedia(query);
  const [matches, setMatches] = createSignal(mql.matches);
  const onChange = (event: MediaQueryListEvent): void => {
    setMatches(event.matches);
  };
  mql.addEventListener("change", onChange);
  onCleanup(() => mql.removeEventListener("change", onChange));
  return matches;
}

/* ------------------------------------------------------------------ */
/* createClickOutside                                                  */
/* ------------------------------------------------------------------ */

export interface ClickOutsideOptions {
  /**
   * Events that count as "outside". Default `["pointerdown"]`: fires
   * before `click`, so menus dismiss without a visible flash, and
   * covers touch via Pointer Events.
   */
  events?: string[];
}

/**
 * Call `handler` when the user interacts outside the element:
 * dropdowns, popovers, and menus that dismiss on outside press.
 *
 * Listens on `window` (so it works even when the press lands on an
 * overlaying element), ignores presses inside the ref, and cleans up
 * on unmount. SSR-safe: no-op on the server.
 *
 * ```tsx
 * let menu!: HTMLDivElement
 * const [open, setOpen] = createSignal(false)
 * createClickOutside(() => menu, () => setOpen(false))
 * ```
 */
export function createClickOutside(
  ref: MaybeElement,
  handler: (event: Event) => void,
  options: ClickOutsideOptions = {},
): void {
  if (typeof window === "undefined") return;
  const { events = ["pointerdown"] } = options;

  const onEvent = (event: Event): void => {
    const el = ref();
    if (!el) return;
    const target = event.target as Node | null;
    // Shadow-DOM aware: composedPath pierces shadow roots.
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    const inside =
      (target !== null && el.contains(target)) || path.includes(el);
    if (!inside) handler(event);
  };

  for (const name of events) {
    window.addEventListener(name, onEvent);
  }
  onCleanup(() => {
    for (const name of events) {
      window.removeEventListener(name, onEvent);
    }
  });
}

/* ------------------------------------------------------------------ */
/* createScrollLock                                                    */
/* ------------------------------------------------------------------ */

export interface ScrollLockControls {
  /** Whether the body scroll is currently locked. */
  locked: Accessor<boolean>;
  /** Lock body scroll. Nested locks stack; all must unlock. */
  lock: () => void;
  /** Release one lock. Restores the original overflow when empty. */
  unlock: () => void;
}

let lockCount = 0;
let savedOverflow = "";

/**
 * Lock body scroll while overlays are open: modals, drawers, the
 * bottom sheet. `overflow: hidden` goes on `document.body`, the
 * previous value is restored when the last lock releases, and nested
 * locks are reference-counted so two stacked modals cannot unlock
 * each other early. Unmounting while locked releases the lock.
 *
 * SSR-safe: no-op on the server.
 *
 * ```tsx
 * const scroll = createScrollLock()
 * createEffect(() => {
 *   if (modalOpen()) scroll.lock()
 *   else scroll.unlock()
 * })
 * ```
 */
export function createScrollLock(): ScrollLockControls {
  const [locked, setLocked] = createSignal(false);
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { locked, lock: () => {}, unlock: () => {} };
  }

  let held = 0;

  const lock = (): void => {
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount++;
    held++;
    setLocked(true);
  };

  const unlock = (): void => {
    if (held === 0) return;
    held--;
    lockCount--;
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow;
      setLocked(false);
    } else if (held === 0) {
      setLocked(false);
    }
  };

  onCleanup(() => {
    while (held > 0) unlock();
  });

  return { locked, lock, unlock };
}

/* ------------------------------------------------------------------ */
/* createInfiniteScroll                                                */
/* ------------------------------------------------------------------ */

export interface InfiniteScrollOptions {
  /** Called when the sentinel approaches the viewport. */
  onLoadMore: () => void;
  /**
   * Trigger distance in px before the sentinel enters: the observer's
   * rootMargin. Default 200.
   */
  threshold?: number;
  /**
   * Reactive kill switch, e.g. `() => !hasMore()`. While true the
   * sentinel is unobserved.
   */
  disabled?: Accessor<boolean>;
}

/**
 * Infinite scroll: observe a sentinel element at the end of a list
 * and call `onLoadMore` as it approaches the viewport, prefetching
 * before the user hits the bottom.
 *
 * Built on IntersectionObserver with a `rootMargin` prefetch zone.
 * SSR-safe (and safe without IntersectionObserver): never fires.
 *
 * ```tsx
 * let sentinel!: HTMLDivElement
 * const [items, setItems] = createSignal<string[]>([])
 * const [hasMore, setHasMore] = createSignal(true)
 * createInfiniteScroll(() => sentinel, {
 *   onLoadMore: () => loadPage(),
 *   disabled: () => !hasMore(),
 * })
 * <For each={items()}>{(item) => <Row item={item} />}</For>
 * <div ref={sentinel} />
 * ```
 */
export function createInfiniteScroll(
  ref: MaybeElement,
  options: InfiniteScrollOptions,
): void {
  const { onLoadMore, threshold = 200, disabled } = options;
  if (
    typeof window === "undefined" ||
    typeof IntersectionObserver === "undefined"
  ) {
    return;
  }

  createEffect(() => {
    const el = ref();
    if (!el) return;
    if (disabled?.() === true) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onLoadMore();
        }
      },
      { rootMargin: `${threshold}px` },
    );
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });
}
