import { createSignal, onCleanup } from "solid-js";
import { schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface SkeletonOptions {
  /** Milliseconds before the skeleton appears; hides flashes for fast loads. Default 200. */
  delay?: number;
  /** Milliseconds the skeleton stays visible once shown. Default 0. */
  minVisible?: number;
  /** Drive a shimmer `phase` while shown. Default true. */
  shimmer?: boolean;
  /** Milliseconds per shimmer sweep. Default 1400. */
  shimmerDuration?: number;
}

export interface SkeletonControls {
  /** Raw loading flag, mirrors the last setLoading call. */
  loading: () => boolean;
  /** Debounced visibility: bind `{#if}` / `<Show>` to this. */
  show: () => boolean;
  /** Shimmer sweep 0..1 while shown (0 otherwise); bind to a gradient position. */
  phase: () => number;
  setLoading: (loading: boolean) => void;
}

function isClient(): boolean {
  return typeof globalThis.window !== "undefined";
}

/**
 * createSkeleton
 *
 * Loading-placeholder controller with flicker protection: the skeleton
 * appears only after `delay` (fast loads never flash it) and, once shown,
 * stays for at least `minVisible`. While shown, `phase()` sweeps 0..1 on
 * the shared clock for a JS-driven shimmer; it freezes under reduced
 * motion. On the server `show()` never flips.
 *
 * ```tsx
 * const sk = createSkeleton({ delay: 200, minVisible: 400 });
 * createEffect(() => { sk.setLoading(query.loading()); });
 * <Show when={sk.show()} fallback={<ArticleView/>}>
 *   <div class="skeleton" style={{ "--shine": `${sk.phase() * 100}%` }} />
 * </Show>
 * ```
 */
export function createSkeleton(
  options: SkeletonOptions = {},
): SkeletonControls {
  const {
    delay = 200,
    minVisible = 0,
    shimmer = true,
    shimmerDuration = 1400,
  } = options;
  const [loading, setLoadingSignal] = createSignal(false);
  const [show, setShow] = createSignal(false);
  const [phase, setPhase] = createSignal(0);
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shownAt = 0;
  let stopShimmer: (() => void) | null = null;

  const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer !== null) clearTimeout(timer);
  };

  const startShimmer = (): void => {
    if (!shimmer || stopShimmer !== null) return;
    if (prefersReducedMotion() || shimmerDuration <= 0) {
      setPhase(0);
      return;
    }
    let start = 0;
    let first = true;
    stopShimmer = schedule((t) => {
      if (first) {
        start = t;
        first = false;
      }
      setPhase(((t - start) % shimmerDuration) / shimmerDuration);
      return true;
    });
  };

  const stopShimmerNow = (): void => {
    stopShimmer?.();
    stopShimmer = null;
    setPhase(0);
  };

  const reveal = (): void => {
    setShow(true);
    shownAt = Date.now();
    startShimmer();
  };

  const conceal = (): void => {
    setShow(false);
    stopShimmerNow();
  };

  const setLoading = (value: boolean): void => {
    setLoadingSignal(value);
    if (!isClient()) return;
    if (value) {
      clearTimer(hideTimer);
      hideTimer = null;
      if (show() || showTimer !== null) return;
      if (delay <= 0) {
        reveal();
        return;
      }
      showTimer = setTimeout(() => {
        showTimer = null;
        reveal();
      }, delay);
    } else {
      clearTimer(showTimer);
      showTimer = null;
      if (!show()) return;
      const remaining = minVisible - (Date.now() - shownAt);
      if (remaining <= 0) {
        conceal();
        return;
      }
      clearTimer(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = null;
        conceal();
      }, remaining);
    }
  };

  onCleanup(() => {
    clearTimer(showTimer);
    clearTimer(hideTimer);
    showTimer = null;
    hideTimer = null;
    stopShimmerNow();
  });

  return { loading, show, phase, setLoading };
}
