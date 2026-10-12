import { onCleanup } from "solid-js";
import { animate } from "./animate.js";
import { now } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface ScrollSnapOptions {
  /**
   * Snap points: element getters, absolute scrollY numbers, or a
   * function returning numbers (evaluated on each snap for dynamic
   * layouts).
   */
  points: (() => HTMLElement | null)[] | number[] | (() => number[]);
  /** Snap animation duration in ms. Default 400. */
  duration?: number;
  /** Easing for the snap animation. Default "easeOutCubic". */
  easing?: Easing | EasingName;
  /**
   * If scroll velocity exceeds this (px per frame) when scrolling stops,
   * skip the snap so the user can fling past. Default 50.
   */
  velocityThreshold?: number;
  /** Called with the snapped point index after snapping. */
  onSnap?: (index: number) => void;
}

export interface ScrollSnapControls {
  /** Remove the scroll listener and cancel any in-flight snap. */
  dispose: () => void;
}

/**
 * Snap to the nearest point after scrolling stops (fullpage feel).
 *
 * Listens for scroll end (150ms after the last scroll event with
 * near-zero velocity), finds the nearest snap point in the scroll
 * direction, and animates scrollY there.
 *
 * Do not combine with CSS scroll-snap on the same container; the two
 * will fight.
 *
 * Under reduced motion the snap jumps immediately.
 *
 * ```ts
 * createScrollSnap({
 *   points: [() => heroEl, () => featuresEl, () => footerEl],
 *   duration: 500,
 *   onSnap: (i) => console.log("snapped to", i),
 * });
 * ```
 */
export function createScrollSnap(
  opts: ScrollSnapOptions,
): ScrollSnapControls {
  const {
    duration = 400,
    velocityThreshold = 50,
    onSnap,
  } = opts;
  const easing = resolveEasing(opts.easing ?? "easeOutCubic");

  const isSSR = typeof window === "undefined";
  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastY = 0;
  let lastT = 0;
  let snapCtl: { stop: () => void } | null = null;

  function resolvePoints(): { positions: number[]; indices: number[] } {
    const positions: number[] = [];
    const indices: number[] = [];
    const raw = opts.points;
    if (typeof raw === "function") {
      const nums = (raw as () => number[])();
      nums.forEach((n, i) => {
        positions.push(n);
        indices.push(i);
      });
      return { positions, indices };
    }
    (raw as (number | (() => HTMLElement | null))[]).forEach((p, i) => {
      if (typeof p === "number") {
        positions.push(p);
        indices.push(i);
      } else {
        const el = (p as () => HTMLElement | null)();
        if (el) {
          const rect = el.getBoundingClientRect();
          positions.push(rect.top + window.scrollY);
          indices.push(i);
        }
      }
    });
    return { positions, indices };
  }

  function doSnap(): void {
    if (disposed || isSSR) return;
    const y = window.scrollY;
    const { positions, indices } = resolvePoints();
    if (positions.length === 0) return;

    // Find the nearest point.
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const dist = Math.abs(positions[i] - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best === -1) return;
    const targetY = positions[best];
    if (Math.abs(targetY - y) < 1) {
      onSnap?.(indices[best]);
      return;
    }

    snapCtl?.stop();
    if (prefersReducedMotion()) {
      window.scrollTo(0, targetY);
      onSnap?.(indices[best]);
      return;
    }
    const from = y;
    snapCtl = animate(0, 1, {
      duration,
      easing,
      onUpdate: (t) => {
        window.scrollTo(0, from + (targetY - from) * t);
      },
      onComplete: () => {
        snapCtl = null;
        onSnap?.(indices[best]);
      },
    });
  }

  function onScroll(): void {
    if (disposed || isSSR) return;
    const y = window.scrollY;
    const t = now();
    const dt = Math.max(t - lastT, 1);
    const velocity = Math.abs(y - lastY) / (dt / 16.7);
    lastY = y;
    lastT = t;

    // A fast flick means the user wants to fly past; skip the snap.
    if (velocity > velocityThreshold) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      doSnap();
    }, 150);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    snapCtl?.stop();
    snapCtl = null;
    if (!isSSR) {
      window.removeEventListener("scroll", onScroll, {
        passive: true,
      } as AddEventListenerOptions);
    }
  }

  if (!isSSR) {
    lastY = window.scrollY;
    lastT = now();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  onCleanup(dispose);

  return { dispose };
}
