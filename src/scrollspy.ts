import { createSignal, onCleanup } from "solid-js";
import { schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface ScrollSpyOptions {
  /** Section element ids in document order, or an accessor for them. */
  targets: string[] | (() => string[]);
  /**
   * Scroll container; defaults to the window. Pass an element for a
   * scrollable panel, or a getter when the ref is not mounted yet.
   */
  container?: HTMLElement | Window | (() => HTMLElement | Window | null);
  /** Pixels below the container top where a section becomes active. Default 0. */
  offset?: number;
  /** Smooth-scroll in scrollTo. Default true (auto under reduced motion). */
  smooth?: boolean;
  onChange?: (id: string | null) => void;
}

export interface ScrollSpyControls {
  /** Id of the deepest section at or above the offset line, or null. */
  active: () => string | null;
  /** Scroll the section into view. No-op on the server or for unknown ids. */
  scrollTo: (id: string) => void;
  /** Recompute the active section immediately. */
  refresh: () => void;
}

function isClient(): boolean {
  return typeof globalThis.window !== "undefined";
}

function getDocument(): Document | undefined {
  return (globalThis as unknown as { document?: Document }).document;
}

/**
 * createScrollSpy
 *
 * Navigation scroll spy: `active()` is the id of the deepest target
 * section whose top sits at or above the `offset` line of the scroll
 * container. Scroll handling is rAF-throttled on the shared clock.
 *
 * ```tsx
 * const spy = createScrollSpy({ targets: ["intro", "api", "faq"], offset: 80 });
 * <nav>
 *   <For each={["intro", "api", "faq"]}>
 *     {(id) => (
 *       <a classList={{ active: spy.active() === id }}
 *          onClick={() => spy.scrollTo(id)}>{id}</a>
 *     )}
 *   </For>
 * </nav>
 * ```
 */
export function createScrollSpy(
  options: ScrollSpyOptions,
): ScrollSpyControls {
  const { offset = 0, smooth = true, onChange } = options;
  const [active, setActive] = createSignal<string | null>(null);

  const resolveTargets = (): string[] =>
    typeof options.targets === "function" ? options.targets() : options.targets;

  const resolveContainer = (): HTMLElement | Window | null => {
    if (!isClient()) return null;
    const c = options.container;
    if (typeof c === "function") return c() ?? null;
    return c ?? globalThis.window;
  };

  const sectionTop = (
    el: HTMLElement,
    container: HTMLElement | Window,
  ): number => {
    const rect = el.getBoundingClientRect().top;
    if (container === globalThis.window) return rect;
    const containerRect = (container as HTMLElement).getBoundingClientRect();
    return rect - containerRect.top;
  };

  const update = (): void => {
    const doc = getDocument();
    const container = resolveContainer();
    if (!doc || !container) return;
    let current: string | null = null;
    for (const id of resolveTargets()) {
      const el = doc.getElementById(id);
      if (!el) continue;
      if (sectionTop(el, container) <= offset) current = id;
    }
    if (current !== active()) {
      setActive(current);
      onChange?.(current);
    }
  };

  let queued = false;
  const onScroll = (): void => {
    if (queued) return;
    queued = true;
    schedule(() => {
      queued = false;
      update();
      return false;
    });
  };

  const container = resolveContainer();
  const removeListener = (() => {
    if (
      container &&
      typeof (container as Window).addEventListener === "function"
    ) {
      const target = container as Window;
      target.addEventListener("scroll", onScroll, { passive: true } as AddEventListenerOptions);
      return () =>
        target.removeEventListener("scroll", onScroll);
    }
    return null;
  })();

  const scrollTo = (id: string): void => {
    const doc = getDocument();
    if (!doc) return;
    const el = doc.getElementById(id);
    if (!el || typeof el.scrollIntoView !== "function") return;
    el.scrollIntoView({
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
      block: "start",
    });
  };

  if (isClient()) update();

  onCleanup(() => {
    removeListener?.();
  });

  return { active, scrollTo, refresh: update };
}
