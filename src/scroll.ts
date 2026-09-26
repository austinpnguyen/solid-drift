import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";

/** What to measure scroll progress against: the whole page or one element. */
export type ScrollTarget = "page" | (() => Element | null | undefined);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A signal tracking scroll progress as a number from 0 to 1.
 *
 * - `"page"` (default): 0 at the very top of the page, 1 when the bottom
 *   of the page reaches the bottom of the viewport.
 * - element accessor: 0 when the element's top edge touches the bottom of
 *   the viewport, 1 when its bottom edge touches the top (that is, the
 *   element's full traversal through the viewport.
 *
 * Updates are rAF-throttled: no matter how many scroll/resize events fire,
 * progress is measured at most once per frame. Listeners are passive and
 * removed on cleanup.
 *
 * SSR-safe: returns a constant `0` accessor on the server (never touches
 * `window` or `document`).
 *
 * ```tsx
 * const progress = createScrollProgress(); // page progress
 * const bar = createScrollProgress(() => sectionRef); // element progress
 * <div style={{ transform: `scaleX(${progress()})` }} />
 * ```
 */
export function createScrollProgress(
  target: ScrollTarget = "page",
): Accessor<number> {
  // SSR: no window, no scrolling, so it reports the top of the page.
  if (typeof window === "undefined") return () => 0;

  const [progress, setProgress] = createSignal(0);
  let rafId = 0;

  const compute = () => {
    if (target === "page") {
      const max =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? clamp01(window.scrollY / max) : 0);
      return;
    }
    const el = target();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewport = window.innerHeight;
    const travel = viewport + rect.height;
    setProgress(travel > 0 ? clamp01((viewport - rect.top) / travel) : 0);
  };

  const requestCompute = () => {
    if (typeof requestAnimationFrame === "undefined") {
      compute();
      return;
    }
    if (rafId) return; // a measurement is already queued for this frame
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      compute();
    });
  };

  // Track the element accessor so late-bound refs start measuring too.
  createEffect(() => {
    if (target !== "page") target();
    compute();
  });

  window.addEventListener("scroll", requestCompute, { passive: true });
  window.addEventListener("resize", requestCompute, { passive: true });

  onCleanup(() => {
    window.removeEventListener("scroll", requestCompute);
    window.removeEventListener("resize", requestCompute);
    if (rafId) cancelAnimationFrame(rafId);
  });

  return progress;
}
