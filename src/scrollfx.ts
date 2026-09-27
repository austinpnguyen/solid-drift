import type { Accessor } from "solid-js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { createScrollProgress } from "./scroll.js";
import {
  parseColorStops,
  sampleColorStops,
  type ColorFormat,
} from "./color.js";

/** Output format for an interpolated color string. */
export type ScrollColorFormat = ColorFormat;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Round to at most 4 decimals so values like 0.30000000000000004 never leak. */
function fmtNum(v: number): string {
  return String(Math.round(v * 10000) / 10000);
}

/* ------------------------------------------------------------------ */
/* createScrollColor                                                   */
/* ------------------------------------------------------------------ */

/** One color stop: progress position and the color to reach there. */
export interface ScrollColorStop {
  /** Progress position, 0 to 1. */
  at: number;
  /**
   * Color at this position. Accepts hex (#rgb, #rrggbb, with optional
   * alpha), rgb()/rgba(), hsl()/hsla(), and CSS named colors.
   */
  color: string;
  /**
   * Easing for the segment that ends at this stop, following the CSS
   * keyframe convention. Default "linear".
   */
  easing?: Easing | EasingName;
}

export interface ScrollColorOptions {
  /**
   * Progress signal, 0 to 1. Defaults to whole-page scroll progress.
   * Pass `createScrollProgress(() => section)` for element-scoped color.
   */
  progress?: Accessor<number>;
  /** Fallback easing for segments without their own. Default "linear". */
  easing?: Easing | EasingName;
  /** Output format. Default "hex". */
  format?: ScrollColorFormat;
}

/**
 * Maps a 0-to-1 progress signal through a list of color stops and returns
 * the interpolated color as a string signal.
 *
 * Colors interpolate in linear light, so a midpoint between red and blue
 * is the vivid purple your eyes expect, not the muddy #800080 you get
 * from naive channel math. Alpha channels interpolate too.
 *
 * Stops sort themselves by `at`; progress outside the range clamps to
 * the end colors. Segments default to linear so color tracks scroll 1:1
 * unless you shape them.
 *
 * Pure computation, no listeners, no rAF: SSR-safe by construction.
 * Under reduced motion it holds the final stop's color.
 *
 * ```tsx
 * const progress = createScrollProgress()
 * // The hero tint warms as you scroll through the first chapter.
 * const tint = createScrollColor(
 *   [
 *     { at: 0, color: "#f4f6f9" },
 *     { at: 0.5, color: "#f7e8d0" },
 *     { at: 1, color: "#2b5176", easing: "easeInOutQuad" },
 *   ],
 *   { progress },
 * )
 * <section style={{ "background-color": tint() }} />
 * ```
 */
export function createScrollColor(
  stops: ScrollColorStop[],
  options: ScrollColorOptions = {},
): Accessor<string> {
  if (stops.length === 0) {
    throw new Error("createScrollColor needs at least one color stop.");
  }

  const parsed = parseColorStops(stops, options.easing);
  const format = options.format ?? "hex";

  if (prefersReducedMotion()) {
    // Reduced motion: hold the final stop's color instead of tracking
    // progress, matching the library's immediate-target behavior.
    const endColor = sampleColorStops(parsed, 1, format);
    return () => endColor;
  }

  const progress = options.progress ?? createScrollProgress();

  return () => sampleColorStops(parsed, progress(), format);
}

/* ------------------------------------------------------------------ */
/* createScrollTracking                                                */
/* ------------------------------------------------------------------ */

export interface ScrollTrackingOptions {
  /**
   * Progress signal, 0 to 1. Defaults to whole-page scroll progress.
   * Pass `createScrollProgress(() => headline)` for element-scoped tracking.
   */
  progress?: Accessor<number>;
  /** Letter-spacing at progress 0. Default 0.3. */
  from?: number;
  /** Letter-spacing at progress 1. Default 0. */
  to?: number;
  /** Unit for the returned value. Default "em". */
  unit?: "em" | "px";
  /** Easing applied to the progress before mapping. Default "linear". */
  easing?: Easing | EasingName;
}

/**
 * Drives `letter-spacing` from a 0-to-1 progress signal: display words
 * that spread apart or tighten together as you scroll.
 *
 * Returns a string signal like `"0.15em"` or `"6px"`, ready to drop into
 * a style binding. Because the value is a plain string you can also
 * bind it to any CSS property that takes a length.
 *
 * SSR-safe: returns the `from` value on the server. Under reduced motion
 * it holds the `to` value (the settled, readable end state).
 *
 * ```tsx
 * const progress = createScrollProgress(() => chapter)
 * // A chapter title that tightens as it arrives.
 * const tracking = createScrollTracking({
 *   progress,
 *   from: 0.35,
 *   to: 0,
 *   unit: "em",
 *   easing: "easeOutCubic",
 * })
 * <h2 style={{ "letter-spacing": tracking() }}>Chapter One</h2>
 * ```
 */
export function createScrollTracking(
  options: ScrollTrackingOptions = {},
): Accessor<string> {
  const from = options.from ?? 0.3;
  const to = options.to ?? 0;
  const unit = options.unit ?? "em";
  const easing = resolveEasing(options.easing ?? "linear");

  if (prefersReducedMotion()) {
    return () => `${fmtNum(to)}${unit}`;
  }

  const progress = options.progress ?? createScrollProgress();

  return () => {
    const t = easing(clamp01(progress()));
    return `${fmtNum(from + (to - from) * t)}${unit}`;
  };
}

/* ------------------------------------------------------------------ */
/* createScrollLine                                                    */
/* ------------------------------------------------------------------ */

/** Axis the divider line grows along. */
export type ScrollLineAxis = "x" | "y";
/** Where the line grows from. "start" is left/top in LTR reading order. */
export type ScrollLineOrigin = "start" | "center" | "end";

export interface ScrollLineOptions {
  /**
   * Progress signal, 0 to 1. Defaults to whole-page scroll progress.
   * Pass `createScrollProgress(() => divider)` for element-scoped reveal.
   */
  progress?: Accessor<number>;
  /** Grow along the x (horizontal rule) or y (vertical rule) axis. Default "x". */
  axis?: ScrollLineAxis;
  /** Scale at progress 0. Default 0 (invisible). */
  from?: number;
  /** Scale at progress 1. Default 1 (fully drawn). */
  to?: number;
  /** Which edge the line grows from. Default "start". */
  origin?: ScrollLineOrigin;
  /** Easing applied to the progress before mapping. Default "linear". */
  easing?: Easing | EasingName;
}

/** Style pair for a progress-driven divider. Spread into a style binding. */
export interface ScrollLineStyle {
  /** e.g. "scaleX(0.42)" or "scaleY(1)". */
  transform: string;
  /** e.g. "left", "right", "center", "top", or "bottom". */
  transformOrigin: string;
}

function originWord(axis: ScrollLineAxis, origin: ScrollLineOrigin): string {
  if (origin === "center") return "center";
  if (axis === "x") return origin === "start" ? "left" : "right";
  return origin === "start" ? "top" : "bottom";
}

/**
 * Drives a divider/rule reveal from a 0-to-1 progress signal: a chapter
 * line that draws itself as you scroll. Uses scale (not width/height) so
 * the reveal stays on the compositor.
 *
 * Returns a signal holding `{ transform, transformOrigin }`, ready to
 * spread into a style binding. The line element itself only needs a
 * background (or border) and a fixed size; the primitive supplies the
 * scale and the origin it grows from.
 *
 * SSR-safe: returns the `from` scale on the server. Under reduced motion
 * it holds the `to` scale, so the line is fully revealed rather than
 * stuck invisible.
 *
 * ```tsx
 * const progress = createScrollProgress(() => chapter)
 * const line = createScrollLine({ progress, axis: "x", origin: "start" })
 * <div
 *   style={{
 *     height: "2px",
 *     "background-color": "#d9a441",
 *     ...line(),
 *   }}
 * />
 * ```
 */
export function createScrollLine(
  options: ScrollLineOptions = {},
): Accessor<ScrollLineStyle> {
  const axis = options.axis ?? "x";
  const from = options.from ?? 0;
  const to = options.to ?? 1;
  const easing = resolveEasing(options.easing ?? "linear");
  const transform = axis === "x" ? "scaleX" : "scaleY";
  const transformOrigin = originWord(axis, options.origin ?? "start");

  if (prefersReducedMotion()) {
    return () => ({
      transform: `${transform}(${fmtNum(to)})`,
      transformOrigin,
    });
  }

  const progress = options.progress ?? createScrollProgress();

  return () => {
    const t = easing(clamp01(progress()));
    return {
      transform: `${transform}(${fmtNum(from + (to - from) * t)})`,
      transformOrigin,
    };
  };
}
