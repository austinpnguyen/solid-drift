import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { prefersReducedMotion } from "./reduced-motion.js";

/* ------------------------------------------------------------------ */
/* createPresence                                                       */
/* ------------------------------------------------------------------ */

/** Lifecycle status of presence-controlled content. */
export type PresenceStatus = "present" | "exiting" | "absent";

export interface PresenceOptions {
  /**
   * Signal controlling presence. When it flips to false the content
   * stays mounted while the exit phase runs, then unmounts.
   */
  when: Accessor<boolean>;
  /**
   * Length of the exit phase in milliseconds. This should match the
   * exit animation or transition duration. Default 300.
   */
  exitDuration?: number;
  /** Fires when the exit phase starts. */
  onExitStart?: () => void;
  /** Fires when the exit phase completes and content unmounts. */
  onExitComplete?: () => void;
}

export interface PresenceControls {
  /**
   * True while the content should stay mounted: present or exiting.
   * Render the content inside `<Show when={presence.mounted()}>`.
   */
  mounted: Accessor<boolean>;
  /** Current lifecycle status. */
  status: Accessor<PresenceStatus>;
  /** True while the exit animation should be playing. */
  exiting: Accessor<boolean>;
  /** Skips the rest of the exit phase and unmounts immediately. */
  forceExit: () => void;
}

/**
 * Exit animations that actually run. When the `when` signal flips to
 * false, Solid would normally unmount the content immediately and no
 * exit animation could play. `createPresence` keeps the content mounted
 * for `exitDuration` ms so the exit animation finishes, then unmounts.
 *
 * Flipping `when` back to true mid-exit cancels the exit and restores
 * the content. When the user prefers reduced motion the exit phase is
 * skipped and content unmounts immediately.
 *
 * SSR-safe: follows the initial `when` value on the server.
 *
 * ```tsx
 * const dialog = createPresence({ when: open, exitDuration: 250 });
 * <Show when={dialog.mounted()}>
 *   <div
 *     style={{
 *       opacity: dialog.exiting() ? "0" : "1",
 *       transition: "opacity 250ms",
 *     }}
 *   >
 *     ...
 *   </div>
 * </Show>
 * ```
 */
export function createPresence(options: PresenceOptions): PresenceControls {
  const { when, exitDuration = 300, onExitStart, onExitComplete } = options;

  const [mounted, setMounted] = createSignal(when());
  const [status, setStatus] =
    createSignal<PresenceStatus>(when() ? "present" : "absent");
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const finishExit = (): void => {
    clearTimer();
    setMounted(false);
    setStatus("absent");
    onExitComplete?.();
  };

  createEffect(() => {
    const show = when();
    if (show) {
      clearTimer();
      if (!untrack(mounted)) setMounted(true);
      setStatus("present");
      return;
    }
    if (!untrack(mounted)) {
      setStatus("absent");
      return;
    }
    setStatus("exiting");
    onExitStart?.();
    clearTimer();
    const duration = prefersReducedMotion() ? 0 : Math.max(0, exitDuration);
    timer = setTimeout(finishExit, duration);
  });

  onCleanup(clearTimer);

  return {
    mounted,
    status,
    exiting: () => status() === "exiting",
    forceExit: () => {
      if (untrack(status) === "exiting") finishExit();
    },
  };
}

/* ------------------------------------------------------------------ */
/* createViewTransition                                                 */
/* ------------------------------------------------------------------ */

export interface ViewTransitionControls {
  /** True when `document.startViewTransition` is available. */
  supported: Accessor<boolean>;
  /** True while a transition is running. */
  transitioning: Accessor<boolean>;
  /**
   * Runs `update` inside a view transition when the browser supports
   * it, otherwise runs it directly. Resolves when the transition (or
   * the direct update) is done.
   */
  transition: (update: () => void | Promise<void>) => Promise<void>;
}

interface ViewTransitionLike {
  finished: Promise<unknown>;
}

interface DocumentWithViewTransition {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransitionLike;
}

const getViewTransitionFn = ():
  | ((update: () => void | Promise<void>) => ViewTransitionLike)
  | undefined => {
  if (typeof document === "undefined") return undefined;
  const fn = (document as DocumentWithViewTransition).startViewTransition;
  return typeof fn === "function" ? fn.bind(document) : undefined;
};

/**
 * View transitions without the boilerplate. Wraps the
 * `document.startViewTransition` API: state updates passed to
 * `transition()` animate between the old and new DOM, with a plain
 * synchronous update as the fallback on unsupported browsers.
 *
 * SSR-safe: `supported()` is false on the server and `transition()`
 * just runs the update.
 *
 * ```tsx
 * const vt = createViewTransition();
 * const switchTab = (tab: string) => {
 *   vt.transition(() => setTab(tab));
 * };
 * ```
 */
export function createViewTransition(): ViewTransitionControls {
  const startViewTransition = getViewTransitionFn();
  const [supported] = createSignal(startViewTransition !== undefined);
  const [transitioning, setTransitioning] = createSignal(false);

  const transition = async (
    update: () => void | Promise<void>,
  ): Promise<void> => {
    if (!startViewTransition) {
      await update();
      return;
    }
    setTransitioning(true);
    try {
      const viewTransition = startViewTransition(() => {
        const result = update();
        if (result instanceof Promise) result.catch(() => undefined);
      });
      await viewTransition.finished.catch(() => undefined);
    } finally {
      setTransitioning(false);
    }
  };

  return { supported, transitioning, transition };
}

/* ------------------------------------------------------------------ */
/* createScrollReveal                                                   */
/* ------------------------------------------------------------------ */

/** Built-in reveal animation variants. */
export type RevealVariant =
  | "fade"
  | "fade-up"
  | "fade-down"
  | "fade-left"
  | "fade-right"
  | "scale"
  | "none";

export interface ScrollRevealOptions {
  /** Reveal animation variant. Default "fade-up". */
  variant?: RevealVariant;
  /** Stagger delay between items in milliseconds. Default 60. */
  stagger?: number;
  /** Animation duration in milliseconds. Default 600. */
  duration?: number;
  /** CSS easing for the animation. Default "cubic-bezier(0.22, 1, 0.36, 1)". */
  easing?: string;
  /** Reveal only once per item. Default true. */
  once?: boolean;
  /** IntersectionObserver root margin. Default "0px 0px -10% 0px". */
  rootMargin?: string;
  /** Fires when an item reveals, with its index. */
  onReveal?: (index: number) => void;
}

export interface ScrollRevealItem {
  /** Ref setter: attach to the element to reveal. */
  ref: (el: HTMLElement | undefined) => void;
  /** True once the item has been revealed. */
  revealed: Accessor<boolean>;
  /**
   * Inline style driving the reveal animation. On the server this is
   * empty so content stays visible when JavaScript never runs.
   */
  style: Accessor<Record<string, string>>;
}

export interface ScrollRevealControls {
  /** One handle per item, in order. */
  items: ScrollRevealItem[];
  /** Resets every item to hidden and reveals them again on intersect. */
  replay: () => void;
  /** Resets every item to hidden without revealing. */
  reset: () => void;
}

const hiddenTransform: Record<RevealVariant, string> = {
  fade: "none",
  "fade-up": "translateY(24px)",
  "fade-down": "translateY(-24px)",
  "fade-left": "translateX(24px)",
  "fade-right": "translateX(-24px)",
  scale: "scale(0.94)",
  none: "none",
};

/**
 * Scroll-triggered reveal choreography for landing pages and long
 * feeds. Unlike `createInView`, which only reports a boolean,
 * `createScrollReveal` owns the whole reveal: staggered entrance,
 * variants, once semantics, replay, and reduced-motion handling.
 *
 * SSR-safe: styles are empty on the server so content is visible when
 * JavaScript never runs. When the user prefers reduced motion, items
 * reveal instantly with no transition.
 *
 * ```tsx
 * const reveal = createScrollReveal(3, { stagger: 90 });
 * <For each={cards}>
 *   {(card, i) => (
 *     <div ref={reveal.items[i()].ref} style={reveal.items[i()].style()}>
 *       {card.title}
 *     </div>
 *   )}
 * </For>
 * ```
 */
export function createScrollReveal(
  count: number,
  options: ScrollRevealOptions = {},
): ScrollRevealControls {
  const {
    variant = "fade-up",
    stagger = 60,
    duration = 600,
    easing = "cubic-bezier(0.22, 1, 0.36, 1)",
    once = true,
    rootMargin = "0px 0px -10% 0px",
    onReveal,
  } = options;

  const isClient = typeof window !== "undefined";
  const reduced = isClient && prefersReducedMotion();
  const transform = hiddenTransform[variant];
  const transition = reduced
    ? "none"
    : `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;

  interface ItemState {
    revealed: Accessor<boolean>;
    setRevealed: (value: boolean) => void;
    element: HTMLElement | null;
    timer: ReturnType<typeof setTimeout> | undefined;
  }

  const states: ItemState[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i += 1) {
    const [revealed, setRevealed] = createSignal(false);
    states.push({ revealed, setRevealed, element: null, timer: undefined });
  }

  let observer: IntersectionObserver | null = null;

  const clearItemTimer = (state: ItemState): void => {
    if (state.timer !== undefined) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
  };

  const revealItem = (index: number): void => {
    const state = states[index];
    if (!state || state.revealed()) return;
    clearItemTimer(state);
    const delay = reduced ? 0 : Math.max(0, stagger) * index;
    state.timer = setTimeout(() => {
      state.timer = undefined;
      state.setRevealed(true);
      onReveal?.(index);
      if (once) observer?.unobserve(state.element as Element);
    }, delay);
  };

  if (
    isClient &&
    typeof IntersectionObserver !== "undefined" &&
    states.length > 0
  ) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = states.findIndex((s) => s.element === entry.target);
          if (index >= 0) revealItem(index);
        });
      },
      { rootMargin },
    );
    onCleanup(() => observer?.disconnect());
  }

  const attach = (index: number, el: HTMLElement | undefined): void => {
    const state = states[index];
    if (!state) return;
    if (state.element && observer) observer.unobserve(state.element);
    clearItemTimer(state);
    state.element = el ?? null;
    if (!el) return;
    // Without an IntersectionObserver (or with reduced motion) there is
    // no scroll choreography to wait for, so reveal right away instead
    // of leaving the item hidden forever.
    if (reduced || !observer) revealItem(index);
    else observer.observe(el);
  };

  onCleanup(() => {
    states.forEach(clearItemTimer);
  });

  const styleFor = (state: ItemState): Record<string, string> => {
    if (!isClient) return {};
    const style: Record<string, string> = { transition };
    if (state.revealed() || reduced) {
      style.opacity = "1";
      style.transform = "none";
    } else {
      if (variant !== "none") style.opacity = "0";
      if (transform !== "none") style.transform = transform;
    }
    return style;
  };

  const items: ScrollRevealItem[] = states.map((state, index) => ({
    ref: (el: HTMLElement | undefined) => attach(index, el),
    revealed: state.revealed,
    style: () => styleFor(state),
  }));

  return {
    items,
    replay: () => {
      states.forEach((state, index) => {
        clearItemTimer(state);
        state.setRevealed(false);
        if (!state.element) return;
        if (reduced || !observer) revealItem(index);
        else observer.observe(state.element);
      });
    },
    reset: () => {
      states.forEach((state) => {
        clearItemTimer(state);
        if (state.element && observer) observer.unobserve(state.element);
        state.setRevealed(false);
      });
    },
  };
}
