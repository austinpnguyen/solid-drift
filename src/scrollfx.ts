import type { Accessor } from "solid-js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { createScrollProgress } from "./scroll.js";

/* ------------------------------------------------------------------ */
/* Color parsing and interpolation (dependency-free)                   */
/* ------------------------------------------------------------------ */

/** A color in linear RGB (0 to 1 per channel) plus alpha (0 to 1). */
interface LinearColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** sRGB channel (0 to 1) to linear light. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear light channel (0 to 1) back to sRGB. */
function linearToSrgb(c: number): number {
  return c <= 0.0031308
    ? 12.92 * c
    : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Round to at most 4 decimals so values like 0.30000000000000004 never leak. */
function fmtNum(v: number): string {
  return String(Math.round(v * 10000) / 10000);
}

function failColor(input: string): never {
  throw new Error(
    `[solid-drift] createScrollColor: could not parse color "${input}". ` +
      "Use hex (#rgb, #rrggbb), rgb()/rgba(), hsl()/hsla(), or a CSS color name.",
  );
}

function parseHexColor(raw: string): LinearColor {
  const hex = raw.slice(1);
  if (!/^[0-9a-f]+$/.test(hex)) failColor(raw);
  const pair = (s: string) => parseInt(s, 16);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  if (hex.length === 3 || hex.length === 4) {
    const d = (c: string) => pair(c + c);
    r = d(hex[0]);
    g = d(hex[1]);
    b = d(hex[2]);
    if (hex.length === 4) a = d(hex[3]) / 255;
  } else if (hex.length === 6 || hex.length === 8) {
    r = pair(hex.slice(0, 2));
    g = pair(hex.slice(2, 4));
    b = pair(hex.slice(4, 6));
    if (hex.length === 8) a = pair(hex.slice(6, 8)) / 255;
  } else {
    failColor(raw);
  }
  return {
    r: srgbToLinear(r / 255),
    g: srgbToLinear(g / 255),
    b: srgbToLinear(b / 255),
    a,
  };
}

/** Split the inside of a rgb()/hsl() call into its 3 or 4 components. */
function splitColorArgs(inner: string): string[] {
  return inner
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter((part) => part.length > 0);
}

function parseAlpha(part: string): number {
  if (part.endsWith("%")) return clamp01(parseFloat(part) / 100);
  return clamp01(parseFloat(part));
}

function parseRgbChannel(part: string): number {
  if (part.endsWith("%")) return clamp01(parseFloat(part) / 100);
  return clamp01(parseFloat(part) / 255);
}

function parseRgbColor(raw: string): LinearColor {
  const inner = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"));
  const parts = splitColorArgs(inner);
  if (parts.length < 3 || parts.length > 4) failColor(raw);
  const [r, g, b] = parts.map(parseRgbChannel);
  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1;
  return {
    r: srgbToLinear(r),
    g: srgbToLinear(g),
    b: srgbToLinear(b),
    a,
  };
}

function parseHue(part: string): number {
  let h = parseFloat(part);
  if (part.endsWith("turn")) h *= 360;
  // Bare numbers and "deg" are degrees; wrap negative values around.
  return ((h % 360) + 360) % 360;
}

function parsePercent(part: string): number {
  return clamp01(parseFloat(part) / 100);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [r + m, g + m, b + m];
}

function parseHslColor(raw: string): LinearColor {
  const inner = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"));
  const parts = splitColorArgs(inner);
  if (parts.length < 3 || parts.length > 4) failColor(raw);
  const h = parseHue(parts[0]);
  const s = parsePercent(parts[1]);
  const l = parsePercent(parts[2]);
  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1;
  const [r, g, b] = hslToRgb(h, s, l);
  return {
    r: srgbToLinear(r),
    g: srgbToLinear(g),
    b: srgbToLinear(b),
    a,
  };
}

/** The 148 CSS named colors, stored as hex. */
const NAMED_COLORS: Record<string, string> = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  darkgreen: "#006400",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  grey: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  lightgreen: "#90ee90",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
};

/** Parse any supported CSS color into linear RGB plus alpha. */
function parseColor(input: string): LinearColor {
  const raw = input.trim().toLowerCase();
  if (raw.startsWith("#")) return parseHexColor(raw);
  if (raw.startsWith("rgb")) return parseRgbColor(raw);
  if (raw.startsWith("hsl")) return parseHslColor(raw);
  const named = NAMED_COLORS[raw];
  if (named) return parseHexColor(named);
  return failColor(input);
}

function lerpColor(a: LinearColor, b: LinearColor, t: number): LinearColor {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

function rgbToHsl(r: number, g: number, b: number): {
  h: number;
  s: number;
  l: number;
} {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}

export type ScrollColorFormat = "hex" | "rgb" | "hsl";

function formatColor(color: LinearColor, format: ScrollColorFormat): string {
  const r = Math.round(clamp01(linearToSrgb(color.r)) * 255);
  const g = Math.round(clamp01(linearToSrgb(color.g)) * 255);
  const b = Math.round(clamp01(linearToSrgb(color.b)) * 255);
  const a = clamp01(color.a);
  const hex2 = (n: number) => n.toString(16).padStart(2, "0");
  if (format === "hex") {
    const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    return a >= 0.999 ? base : `${base}${hex2(Math.round(a * 255))}`;
  }
  if (format === "rgb") {
    return a >= 0.999
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${fmtNum(a)})`;
  }
  const { h, s, l } = rgbToHsl(r / 255, g / 255, b / 255);
  const hsl = `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  return a >= 0.999
    ? hsl
    : `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${fmtNum(a)})`;
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

  const sorted = [...stops].sort((a, b) => a.at - b.at);
  const parsed = sorted.map((stop) => ({
    at: stop.at,
    color: parseColor(stop.color),
    easing: resolveEasing(stop.easing ?? options.easing ?? "linear"),
  }));
  const format = options.format ?? "hex";

  if (prefersReducedMotion()) {
    // Reduced motion: hold the final stop's color instead of tracking
    // progress, matching the library's immediate-target behavior.
    const endColor = formatColor(parsed[parsed.length - 1].color, format);
    return () => endColor;
  }

  const progress = options.progress ?? createScrollProgress();

  return () => {
    const p = clamp01(progress());
    if (p <= parsed[0].at) return formatColor(parsed[0].color, format);
    const last = parsed[parsed.length - 1];
    if (p >= last.at) return formatColor(last.color, format);

    let i = 0;
    while (i < parsed.length - 2 && parsed[i + 1].at <= p) i++;
    const a = parsed[i];
    const b = parsed[i + 1];
    const span = b.at - a.at;
    const t = span <= 0 ? 0 : (p - a.at) / span;
    return formatColor(lerpColor(a.color, b.color, b.easing(t)), format);
  };
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
