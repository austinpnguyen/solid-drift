import { createSignal, onCleanup, type Accessor } from "solid-js";
import { animate } from "./animate.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface MotionPathOptions {
  /** SVG path data string, or a function returning an SVGPathElement. */
  path: string | (() => SVGPathElement | null | undefined);
  /** Duration in ms. Default 2000. */
  duration?: number;
  /** Easing. Default "easeInOutCubic". */
  easing?: Easing | EasingName;
  /**
   * Rotate the element along the path tangent. `true` follows the tangent;
   * a number adds that many degrees of offset. Default false.
   */
  autoRotate?: boolean | number;
  /**
   * Which point of the element rides the path. Default "center".
   */
  align?: "center" | "top-left";
}

export interface MotionPathControls {
  /** Play the element along the path. */
  play: () => Promise<void>;
  /** Current progress 0..1. */
  progress: Accessor<number>;
  /** Jump to a progress value (for scrub integration). */
  seek: (t: number) => void;
}

/**
 * Move an element along an SVG path.
 *
 * Position comes from `getPointAtLength(t * totalLength)`. With
 * `autoRotate`, the element rotates to follow the path tangent (sampled
 * at t +/- epsilon). `align: "center"` offsets by half the element size
 * so its center rides the path.
 *
 * While running, this primitive owns the element's `transform` (it writes
 * `translate() rotate()` directly), like other drift primitives. Do not
 * run a second transform-writing tween on the same element at the same
 * time.
 *
 * ```ts
 * const flight = createMotionPath(() => plane, {
 *   path: "M0,100 C 100,0 200,0 300,100",
 *   duration: 3000,
 *   autoRotate: true,
 * });
 * await flight.play();
 * flight.seek(0.5); // scrub to halfway
 * ```
 */
export function createMotionPath(
  target: () => HTMLElement | null | undefined,
  opts: MotionPathOptions,
): MotionPathControls {
  const {
    duration = 2000,
    autoRotate = false,
    align = "center",
  } = opts;
  const easing = resolveEasing(opts.easing ?? "easeInOutCubic");

  const [progress, setProgress] = createSignal(0);

  const isSSR = typeof window === "undefined" || typeof document === "undefined";

  let pathEl: SVGPathElement | null = null;
  let totalLength = 0;
  let ready = false;
  let playCtl: { stop: () => void } | null = null;
  const rotateOffset =
    typeof autoRotate === "number" ? autoRotate : 0;
  const doRotate = autoRotate !== false;

  function ensureReady(): void {
    if (ready || isSSR) return;
    const p = opts.path;
    if (typeof p === "string") {
      const tmp = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      tmp.setAttribute("d", p);
      pathEl = tmp;
    } else {
      const el = p();
      if (!el) throw new Error("createMotionPath: path element is null.");
      pathEl = el;
    }
    let length: number;
    try {
      length = pathEl.getTotalLength();
    } catch {
      throw new Error("createMotionPath: invalid path data.");
    }
    if (!isFinite(length) || length <= 0) {
      throw new Error("createMotionPath: invalid path data.");
    }
    totalLength = length;
    ready = true;
  }

  function pointAt(t: number): { x: number; y: number } {
    const clamped = Math.min(Math.max(t, 0), 1);
    const pt = pathEl!.getPointAtLength(clamped * totalLength);
    return { x: pt.x, y: pt.y };
  }

  function angleAt(t: number): number {
    const eps = 0.002;
    const a = pointAt(Math.max(0, t - eps));
    const b = pointAt(Math.min(1, t + eps));
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return deg + rotateOffset;
  }

  function render(t: number): void {
    if (isSSR) return;
    ensureReady();
    const el = target();
    if (!el || !pathEl) return;
    const clamped = Math.min(Math.max(t, 0), 1);
    const pt = pointAt(clamped);

    let x = pt.x;
    let y = pt.y;
    if (align === "center") {
      const rect = el.getBoundingClientRect();
      x -= rect.width / 2;
      y -= rect.height / 2;
    }

    let transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    if (doRotate) {
      transform += ` rotate(${angleAt(clamped).toFixed(2)}deg)`;
    }
    el.style.transform = transform;
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
