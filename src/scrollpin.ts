import { createSignal, onCleanup, type Accessor } from "solid-js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface ScrollPinOptions {
  /**
   * Scroll position where pinning starts. A number is an absolute scrollY;
   * a function is evaluated on refresh() (for dynamic layouts).
   * Default: the element's top touching the viewport top.
   */
  start?: number | (() => number);
  /**
   * Scroll position where pinning ends. Supports "+=500" for a 500px
   * scroll distance from start. Default: start + target height.
   */
  end?: number | (() => number) | `+=${number}`;
  /**
   * Called every frame while pinned with progress 0..1. Wire a
   * sequence into it for scrub-driven storytelling:
   * `seq.seek(progress * seq.duration())`.
   */
  scrub?: (progress: number) => void;
  /** Called when the pin engages scrolling down. */
  onEnter?: () => void;
  /** Called when the pin releases scrolling down. */
  onLeave?: () => void;
  /** Called when the pin engages scrolling up. */
  onEnterBack?: () => void;
  /** Called when the pin releases scrolling up. */
  onLeaveBack?: () => void;
}

export interface ScrollPinControls {
  /** Reactive pin progress 0..1. */
  progress: Accessor<number>;
  /** Whether the pin is currently engaged. */
  active: Accessor<boolean>;
  /** Re-measure positions and sizes. Call after fonts/images load. */
  refresh: () => void;
  /** Restore the DOM and remove listeners. */
  dispose: () => void;
}

/**
 * Pin an element in place while the user scrolls through a range.
 *
 * This is the signature primitive of scrollytelling sites: the element
 * sticks while scroll drives an animation inside it via `scrub`.
 *
 * When the scroll position enters [start, end], a spacer div preserves
 * the layout and the target becomes `position: fixed` at its natural
 * position. Leaving the range restores the DOM exactly.
 *
 * v1 is window-scrolling only. For nested scroll containers, document
 * the limitation.
 *
 * Under reduced motion the pin still engages (it is structural), but
 * scrub-driven animations inside should respect reduced motion
 * themselves (each primitive does).
 *
 * ```ts
 * const seq = createSequence();
 * // ... add steps ...
 * createScrollPin(() => section, {
 *   end: "+=1000",
 *   scrub: (p) => seq.seek(p * seq.duration()),
 * });
 * ```
 */
export function createScrollPin(
  target: () => HTMLElement | null | undefined,
  opts: ScrollPinOptions = {},
): ScrollPinControls {
  const [progress, setProgress] = createSignal(0);
  const [active, setActive] = createSignal(false);

  let startY = 0;
  let endY = 0;
  let spacer: HTMLDivElement | null = null;
  let pinned = false;
  let rafId = 0;
  let disposed = false;
  let lastScrollY = 0;

  // Original inline styles to restore on unpin.
  let origPosition = "";
  let origTop = "";
  let origLeft = "";
  let origWidth = "";

  const isSSR = typeof window === "undefined";

  function resolveValue(
    v: number | (() => number) | `+=${number}` | undefined,
    fallback: number,
    base: number,
  ): number {
    if (v === undefined) return fallback;
    if (typeof v === "function") return v();
    if (typeof v === "string") {
      const m = /^\+=(\d+)$/.exec(v);
      if (m) return base + Number(m[1]);
      return fallback;
    }
    return v;
  }

  function measure(): void {
    const el = target();
    if (!el || isSSR) return;
    const rect = el.getBoundingClientRect();
    const scrollY = window.scrollY;
    // Measure before the spacer exists so consecutive pins don't shift.
    const naturalTop = rect.top + scrollY;
    startY = resolveValue(opts.start, naturalTop, 0);
    const defaultEnd = startY + rect.height;
    endY = resolveValue(opts.end, defaultEnd, startY);
    if (endY < startY) endY = startY;
  }

  function pin(): void {
    const el = target();
    if (!el || pinned) return;
    const rect = el.getBoundingClientRect();

    // Save original inline styles.
    origPosition = el.style.position;
    origTop = el.style.top;
    origLeft = el.style.left;
    origWidth = el.style.width;

    // Insert spacer to preserve layout.
    spacer = document.createElement("div");
    spacer.style.height = `${rect.height}px`;
    spacer.style.width = `${rect.width}px`;
    spacer.setAttribute("data-drift-pin-spacer", "");
    el.parentNode?.insertBefore(spacer, el);

    // Fix the element at its natural position.
    el.style.position = "fixed";
    el.style.top = `${rect.top}px`;
    el.style.left = `${rect.left}px`;
    el.style.width = `${rect.width}px`;

    pinned = true;
    setActive(true);
  }

  function unpin(): void {
    const el = target();
    if (!pinned) return;
    if (el) {
      el.style.position = origPosition;
      el.style.top = origTop;
      el.style.left = origLeft;
      el.style.width = origWidth;
    }
    spacer?.remove();
    spacer = null;
    pinned = false;
    setActive(false);
  }

  function update(): void {
    rafId = 0;
    if (disposed || isSSR) return;
    const scrollY = window.scrollY;
    const direction = scrollY >= lastScrollY ? 1 : -1;
    lastScrollY = scrollY;

    const wasActive = pinned;
    if (scrollY >= startY && scrollY <= endY) {
      if (!pinned) {
        pin();
        if (direction === 1) opts.onEnter?.();
        else opts.onEnterBack?.();
      }
      const span = Math.max(endY - startY, 0.001);
      const p = Math.min(Math.max((scrollY - startY) / span, 0), 1);
      setProgress(p);
      // Scrub runs even under reduced motion; the driven primitives
      // decide how to handle it (they jump to end values).
      try {
        opts.scrub?.(p);
      } catch {
        // A throwing scrub callback must not break the pin.
      }
    } else {
      if (pinned) {
        unpin();
        if (direction === 1) opts.onLeave?.();
        else opts.onLeaveBack?.();
      }
      setProgress(scrollY < startY ? 0 : 1);
    }
    void wasActive;
  }

  function onScroll(): void {
    if (rafId || disposed) return;
    rafId = requestAnimationFrame(update);
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  function onResize(): void {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      // Unpin before re-measuring so the rect is natural.
      const wasPinned = pinned;
      if (wasPinned) unpin();
      measure();
      if (wasPinned) update();
    }, 150);
  }

  function refresh(): void {
    const wasPinned = pinned;
    if (wasPinned) unpin();
    measure();
    update();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (resizeTimer) clearTimeout(resizeTimer);
    unpin();
    if (!isSSR) {
      window.removeEventListener("scroll", onScroll, { passive: true } as AddEventListenerOptions);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    }
  }

  if (!isSSR) {
    measure();
    lastScrollY = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    // Mobile URL bar resizes the visual viewport; refresh the pin.
    window.visualViewport?.addEventListener("resize", onResize);
    update();
  }

  onCleanup(dispose);

  return { progress, active, refresh, dispose };
}
