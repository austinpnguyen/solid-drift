import type { Accessor } from "solid-js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface ScrubKeyframe {
  /** Progress position, 0 to 1. */
  at: number;
  /** Value at this position. */
  value: number;
  /**
   * Easing for the segment that ends at this keyframe, following the
   * CSS keyframe convention. Default "linear".
   */
  easing?: Easing | EasingName;
}

export interface ScrubOptions {
  /** Fallback easing for segments without their own. Default "linear". */
  easing?: Easing | EasingName;
}

/**
 * Maps a 0-to-1 progress signal through an array of keyframes, returning
 * the interpolated value as a signal.
 *
 * This is the scroll-choreography primitive: pair it with
 * `createScrollProgress` and any numeric style becomes a scrubbed
 * sequence. Parallax is the two-keyframe case, longer keyframe lists
 * build full scenes (fade, rise, scale, hold, exit) driven by one scroll.
 *
 * Keyframes are sorted by `at` automatically. Progress outside the first
 * and last keyframe clamps to their values. Segments default to linear
 * easing so motion tracks scroll 1:1 unless you ask for shaping.
 *
 * Pure computation, no listeners, no rAF: SSR-safe by construction.
 * Under reduced motion it holds the final keyframe value instead of
 * tracking progress, matching the library's immediate-target behavior.
 *
 * ```tsx
 * const progress = createScrollProgress(() => sectionRef)
 * // Parallax: background drifts slower than the scroll.
 * const y = createScrub(progress, [
 *   { at: 0, value: 60 },
 *   { at: 1, value: -60 },
 * ])
 * // Choreography: fade in, hold, fade out.
 * const opacity = createScrub(progress, [
 *   { at: 0, value: 0 },
 *   { at: 0.3, value: 1, easing: "easeOutCubic" },
 *   { at: 0.7, value: 1 },
 *   { at: 1, value: 0 },
 * ])
 * ```
 */
export function createScrub(
  progress: Accessor<number>,
  keyframes: ScrubKeyframe[],
  options: ScrubOptions = {},
): Accessor<number> {
  if (keyframes.length === 0) {
    throw new Error("createScrub needs at least one keyframe.");
  }

  const fallback = resolveEasing(options.easing ?? "linear");
  const sorted = [...keyframes].sort((a, b) => a.at - b.at);
  const segmentEasing = sorted.map((keyframe, index) =>
    index === 0
      ? fallback
      : resolveEasing(keyframe.easing ?? options.easing ?? "linear"),
  );

  if (prefersReducedMotion()) {
    // Reduced motion: hold the final keyframe value instead of tracking
    // progress, matching the library's immediate-target behavior.
    const endValue = sorted[sorted.length - 1].value;
    return () => endValue;
  }

  return () => {
    const p = Math.min(Math.max(progress(), 0), 1);
    if (p <= sorted[0].at) return sorted[0].value;
    const last = sorted[sorted.length - 1];
    if (p >= last.at) return last.value;

    let i = 0;
    while (i < sorted.length - 2 && sorted[i + 1].at <= p) i++;
    const a = sorted[i];
    const b = sorted[i + 1];
    const span = b.at - a.at;
    const t = span <= 0 ? 0 : (p - a.at) / span;
    return a.value + (b.value - a.value) * segmentEasing[i + 1](t);
  };
}
