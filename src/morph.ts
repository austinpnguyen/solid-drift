import { createSignal, onCleanup, type Accessor } from "solid-js";
import { animate } from "./animate.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { parseColor, lerpColor, formatColor } from "./color.js";

export interface MorphOptions {
  /** Destination path data. */
  to: string;
  /** Duration in ms. Default 600. */
  duration?: number;
  /** Easing. Default "easeInOutCubic". */
  easing?: Easing | EasingName;
  /** Resample point count. Default 100. */
  points?: number;
  /** Destination fill color (interpolated from the element's current fill). */
  fill?: string;
  /** Destination stroke color (interpolated from the element's current stroke). */
  stroke?: string;
}

export interface MorphControls {
  /** Play the morph from the current shape to the target. */
  play: () => Promise<void>;
  /** Current progress 0..1. */
  progress: Accessor<number>;
  /** Jump to a progress value (for scrub integration). */
  seek: (t: number) => void;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Morph one SVG path into another.
 *
 * Both paths are resampled to N points with `getPointAtLength` (polygon
 * approximation) and each point is interpolated by progress. Honest v1:
 * point i of the source maps to point i of the target, so the two paths
 * should have the same winding direction and roughly similar complexity
 * for a beautiful morph. Very different shapes still run without crashing,
 * they just "melt".
 *
 * No smart rotational or point matching like GSAP's MorphSVG; if users
 * ask for it, that is v2.
 *
 * ```ts
 * const morph = createMorph(() => pathEl, {
 *   to: "M50,5 a45,45 0 1,0 0.1,0 Z", // circle
 *   duration: 800,
 * });
 * await morph.play();
 * morph.seek(0.5); // scrub to halfway
 * ```
 */
export function createMorph(
  pathEl: () => SVGPathElement | null | undefined,
  opts: MorphOptions,
): MorphControls {
  const {
    to,
    duration = 600,
    points = 100,
    fill: toFill,
    stroke: toStroke,
  } = opts;
  const easing = resolveEasing(opts.easing ?? "easeInOutCubic");

  const [progress, setProgress] = createSignal(0);

  const isSSR = typeof window === "undefined" || typeof document === "undefined";

  let fromPts: Pt[] = [];
  let toPts: Pt[] = [];
  let closed = false;
  let fromFill: string | null = null;
  let fromStroke: string | null = null;
  let ready = false;
  let playCtl: { stop: () => void } | null = null;

  function samplePath(d: string, label: string): { pts: Pt[]; length: number } {
    const tmp = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    tmp.setAttribute("d", d);
    let length: number;
    try {
      length = tmp.getTotalLength();
    } catch {
      throw new Error(`createMorph: invalid path data for ${label}.`);
    }
    if (!isFinite(length) || length <= 0) {
      throw new Error(`createMorph: invalid path data for ${label}.`);
    }
    const pts: Pt[] = [];
    for (let i = 0; i < points; i++) {
      const p = tmp.getPointAtLength((length * i) / points);
      pts.push({ x: p.x, y: p.y });
    }
    return { pts, length };
  }

  function ensureReady(): void {
    if (ready || isSSR) return;
    const el = pathEl();
    if (!el) throw new Error("createMorph: path element is null.");
    const fromD = el.getAttribute("d") ?? "";
    const from = samplePath(fromD, "source");
    const dest = samplePath(to, "target");
    fromPts = from.pts;
    toPts = dest.pts;
    closed =
      fromD.trim().endsWith("z") || fromD.trim().endsWith("Z");
    fromFill = el.getAttribute("fill");
    fromStroke = el.getAttribute("stroke");
    ready = true;
  }

  function render(t: number): void {
    if (isSSR) return;
    ensureReady();
    const el = pathEl();
    if (!el) return;
    const clamped = Math.min(Math.max(t, 0), 1);
    let d = "";
    for (let i = 0; i < points; i++) {
      const fx = fromPts[i].x;
      const fy = fromPts[i].y;
      const x = fx + (toPts[i].x - fx) * clamped;
      const y = fy + (toPts[i].y - fy) * clamped;
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
    }
    if (closed) d += "Z";
    el.setAttribute("d", d);

    if (toFill && fromFill) {
      try {
        const c = lerpColor(parseColor(fromFill), parseColor(toFill), clamped);
        el.setAttribute("fill", formatColor(c, "hex"));
      } catch {
        // keep original on unparsable colors
      }
    }
    if (toStroke && fromStroke) {
      try {
        const c = lerpColor(
          parseColor(fromStroke),
          parseColor(toStroke),
          clamped,
        );
        el.setAttribute("stroke", formatColor(c, "hex"));
      } catch {
        // keep original on unparsable colors
      }
    }
    setProgress(clamped);
  }

  function seek(t: number): void {
    playCtl?.stop();
    playCtl = null;
    render(t);
  }

  function play(): Promise<void> {
    if (isSSR) return Promise.resolve();
    ensureReady();
    playCtl?.stop();
    const from = progress();
    if (prefersReducedMotion()) {
      render(1);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      playCtl = animate(from, 1, {
        duration: Math.max(1, Math.round(duration * (1 - from))),
        easing,
        onUpdate: (v) => render(v),
        onComplete: () => {
          playCtl = null;
          resolve();
        },
      });
    });
  }

  function dispose(): void {
    playCtl?.stop();
    playCtl = null;
  }

  onCleanup(dispose);

  return { play, progress, seek };
}
