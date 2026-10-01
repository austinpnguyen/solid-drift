import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { createSpring } from "./spring.js";
import { createPrefersReducedMotion } from "./reduced-motion.js";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface HorizontalScrollOptions {
  /**
   * The tall wrapper the user scrolls through. Its height beyond one
   * viewport becomes the scroll range that drives the horizontal slide.
   * Give it e.g. `height: 300vh` in CSS.
   */
  pin: () => HTMLElement | null | undefined;
  /**
   * The wide track that slides horizontally. Usually a flex row wider
   * than the viewport, e.g. `display: flex; width: max-content`.
   */
  track: () => HTMLElement | null | undefined;
  /**
   * The sticky viewport showing one screenful of the track at a time,
   * e.g. `position: sticky; top: 0; height: 100vh; overflow: hidden`.
   * Defaults to the track's parent element.
   */
  stage?: () => HTMLElement | null | undefined;
  /**
   * Horizontal travel in pixels. Pass a number for a fixed distance or a
   * function for a dynamic one (re-evaluated on every resize). Default:
   * measured live as `track.scrollWidth - stage.clientWidth`.
   */
  distance?: number | (() => number);
  /** Fraction of the scroll range where the slide begins. Default 0. */
  start?: number;
  /** Fraction of the scroll range where the slide ends. Default 1. */
  end?: number;
  /** Spring stiffness smoothing vertical scroll into horizontal motion. Default 120. */
  stiffness?: number;
  /** Spring damping for the smoothing. Default 20. */
  damping?: number;
  /**
   * Called with the smoothed progress (0 to 1) whenever it updates,
   * including once on mount. Useful for per-panel parallax driven by
   * the same timeline.
   */
  onProgress?: (progress: number) => void;
}

export interface HorizontalScrollResult {
  /**
   * Smoothed progress through the pinned range, 0 to 1. Drive panel
   * parallax or progress indicators from this signal.
   */
  progress: Accessor<number>;
  /** The current horizontal travel in pixels. */
  distance: Accessor<number>;
  /** Re-measure the distance and recompute progress immediately. */
  refresh: () => void;
}

/**
 * Pin a tall section and slide a wide track through it as the user
 * scrolls vertically: the classic horizontal-scroll storytelling chapter.
 *
 * The pinning itself is plain CSS (`position: sticky` on the stage), so
 * this primitive never hijacks scrolling. It only translates the track
 * with `translate3d`, smoothed by a spring that retargets seamlessly
 * mid-scroll. Touch stays native: vertical swipes scroll the page, and
 * the stage should keep `touch-action: pan-y` in your CSS.
 *
 * Reduced motion is a first-class path, not an afterthought. When the
 * user prefers reduced motion the stage unpins (the tall section scrolls
 * normally), the track renders as a plain vertical stack, nothing slides,
 * and `progress` still reports 0 to 1 through the section so indicators
 * keep working.
 *
 * SSR-safe: returns constant `0` accessors on the server (never touches
 * `window` or `document` outside the browser).
 *
 * ```tsx
 * import { createHorizontalScroll } from "solid-drift"
 *
 * function Story() {
 *   let pin!: HTMLElement
 *   let track!: HTMLElement
 *   const { progress } = createHorizontalScroll({
 *     pin: () => pin,
 *     track: () => track,
 *     stiffness: 120,
 *     damping: 20,
 *   })
 *   return (
 *     <section ref={pin} style={{ height: "300vh" }}>
 *       <div
 *         class="h-stage"
 *         style={{
 *           position: "sticky", top: 0, height: "100vh",
 *           overflow: "hidden", "touch-action": "pan-y",
 *         }}
 *       >
 *         <div
 *           ref={track}
 *           class="h-track"
 *           style={{ display: "flex", width: "max-content", height: "100%" }}
 *         >
 *           <article style={{ width: "100vw" }}>Chapter one</article>
 *           <article style={{ width: "100vw" }}>Chapter two</article>
 *           <article style={{ width: "100vw" }}>Chapter three</article>
 *         </div>
 *       </div>
 *     </section>
 *   )
 * }
 * ```
 */
export function createHorizontalScroll(
  options: HorizontalScrollOptions,
): HorizontalScrollResult {
  // SSR: no window, no scrolling, nothing to pin.
  if (typeof window === "undefined") {
    const zero = () => 0;
    return { progress: zero, distance: zero, refresh: () => {} };
  }

  const {
    pin,
    track,
    distance: distanceOption,
    start = 0,
    end = 1,
    stiffness = 120,
    damping = 20,
    onProgress,
  } = options;
  const stage =
    options.stage ??
    (() => (track()?.parentElement ?? null) as HTMLElement | null);

  const s0 = clamp01(start);
  const e0 = clamp01(end);

  const reduced = createPrefersReducedMotion();
  const [raw, setRaw] = createSignal(0);
  const [travel, setTravel] = createSignal(0);
  // Reading reduced() in the source keeps the spring reactive to the OS
  // motion preference: toggling it mid-session re-runs the spring effect,
  // which jumps straight to the target when reduced motion is preferred.
  const progress = createSpring(() => (reduced(), raw()), {
    stiffness,
    damping,
  });

  const compute = () => {
    const p = pin();
    if (!p) return;
    const rect = p.getBoundingClientRect();
    const viewport = window.innerHeight;
    // -rect.top is how far the pin's top edge has scrolled past the top
    // of the viewport. The slide runs over the pin's extra height.
    const range = Math.max(0, rect.height - viewport);
    const span = (e0 - s0) * range;
    setRaw(span > 0 ? clamp01((-rect.top - s0 * range) / span) : 0);
  };

  const measure = () => {
    const t = track();
    if (!t) return;
    const explicit =
      typeof distanceOption === "function" ? distanceOption() : distanceOption;
    if (typeof explicit === "number" && Number.isFinite(explicit)) {
      setTravel(Math.max(0, explicit));
      return;
    }
    const s = stage();
    const viewportWidth = s ? s.clientWidth : window.innerWidth;
    setTravel(Math.max(0, t.scrollWidth - viewportWidth));
  };

  const refresh = () => {
    measure();
    compute();
  };

  // Scroll and resize are rAF-throttled: at most one measure per frame.
  let rafId = 0;
  const requestRefresh = () => {
    if (typeof requestAnimationFrame === "undefined") {
      refresh();
      return;
    }
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      refresh();
    });
  };

  // Reduced motion: unpin the stage, stack the track vertically, stop
  // sliding. Inline styles are captured once and restored when the
  // preference flips back.
  const saved = { stagePosition: "", trackTransform: "", trackFlex: "" };
  let reducedApplied = false;
  createEffect(() => {
    const s = stage();
    const t = track();
    const isReduced = reduced();
    if (!s || !t) return;
    if (isReduced) {
      if (!reducedApplied) {
        saved.stagePosition = s.style.position;
        saved.trackTransform = t.style.transform;
        saved.trackFlex = t.style.flexDirection;
        reducedApplied = true;
      }
      s.style.position = "static";
      t.style.transform = "";
      t.style.flexDirection = "column";
    } else if (reducedApplied) {
      s.style.position = saved.stagePosition;
      t.style.transform = saved.trackTransform;
      t.style.flexDirection = saved.trackFlex;
      reducedApplied = false;
      refresh();
    }
  });

  // Apply the slide. Skipped entirely under reduced motion, where the
  // effect above owns the track's styles.
  createEffect(() => {
    const t = track();
    if (!t) return;
    const d = travel();
    const p = progress();
    if (reduced()) return;
    const x = -p * d;
    t.style.willChange = "transform";
    t.style.transform = x === 0 ? "" : `translate3d(${x}px, 0, 0)`;
  });

  createEffect(() => {
    onProgress?.(progress());
  });

  // Initial measure once refs are bound, plus re-measure when the bound
  // elements change.
  createEffect(() => {
    pin();
    track();
    stage();
    refresh();
  });

  window.addEventListener("scroll", requestRefresh, { passive: true });
  window.addEventListener("resize", requestRefresh, { passive: true });

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(requestRefresh);
    const ro = observer;
    createEffect(() => {
      const p = pin();
      const t = track();
      const s = stage();
      ro.disconnect();
      if (p) ro.observe(p);
      if (t) ro.observe(t);
      if (s && s !== p) ro.observe(s);
    });
  }

  onCleanup(() => {
    window.removeEventListener("scroll", requestRefresh);
    window.removeEventListener("resize", requestRefresh);
    if (rafId) cancelAnimationFrame(rafId);
    observer?.disconnect();
  });

  return { progress, distance: travel, refresh };
}
