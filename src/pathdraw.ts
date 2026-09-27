import { createSignal, onCleanup, type Accessor } from "solid-js";
import { now, schedule } from "./engine.js";
import { easeInOutCubic, type Easing } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface PathDrawOptions {
  /** Draw duration in ms. Default 1200. */
  duration?: number;
  /** Easing for the draw progress. Default easeInOutCubic. */
  easing?: Easing;
  /** Start drawing immediately. Default true. */
  autoStart?: boolean;
  /** Fires once when the draw completes. */
  onDone?: () => void;
}

export interface PathDrawControls {
  /** Eased draw progress, 0 to 1. */
  progress: Accessor<number>;
  /** Whether the draw clock task is running. */
  running: Accessor<boolean>;
  start: () => void;
  stop: () => void;
  /** Back to undrawn (progress 0). */
  reset: () => void;
}

/**
 * SVG path drawing animation. Drives `stroke-dashoffset` from the full
 * path length to 0 so the stroke draws itself on, eased on the shared
 * clock. The length is read with `getTotalLength()`, so any path shape
 * works with no manual measuring.
 *
 * Under reduced motion (and on the server) the path renders fully drawn.
 * SSR-safe.
 *
 * ```tsx
 * let path!: SVGPathElement;
 * const draw = createPathDraw(() => path, {
 *   duration: 1600,
 *   onDone: () => console.log("drawn"),
 * });
 * <svg viewBox="0 0 100 100">
 *   <path
 *     ref={path}
 *     d="M10 80 C 40 10, 60 10, 90 80"
 *     fill="none"
 *     stroke="currentColor"
 *     stroke-width="3"
 *   />
 * </svg>
 * ```
 */
export function createPathDraw(
  ref: () => SVGPathElement | null | undefined,
  options: PathDrawOptions = {},
): PathDrawControls {
  const {
    duration = 1200,
    easing = easeInOutCubic,
    autoStart = true,
    onDone,
  } = options;

  const [progress, setProgress] = createSignal(0);
  const [running, setRunning] = createSignal(false);

  if (typeof window === "undefined") {
    const noop = (): void => {};
    return { progress, running, start: noop, stop: noop, reset: noop };
  }

  let stopClock: (() => void) | null = null;
  let doneFired = false;

  const paint = (p: number): void => {
    const el = ref();
    if (!el || typeof el.getTotalLength !== "function") return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len * (1 - p)}`;
  };

  const finish = (): void => {
    setProgress(1);
    paint(1);
    setRunning(false);
    stopClock = null;
    if (!doneFired) {
      doneFired = true;
      onDone?.();
    }
  };

  const start = (): void => {
    if (running()) return;
    if (duration <= 0 || prefersReducedMotion()) {
      setProgress(1);
      finish();
      return;
    }
    doneFired = false;
    setRunning(true);
    const from = progress();
    if (from >= 1) {
      finish();
      return;
    }
    // Remaining time is proportional, so resume keeps a constant speed.
    const span = Math.max(duration * (1 - from), 1);
    const t0 = now();
    paint(from);
    stopClock?.();
    stopClock = schedule((t) => {
      const p = Math.min(Math.max((t - t0) / span, 0), 1);
      const eased = from + (1 - from) * easing(p);
      setProgress(eased);
      paint(eased);
      if (p >= 1) {
        finish();
        return false;
      }
      return true;
    });
  };

  const stop = (): void => {
    stopClock?.();
    stopClock = null;
    setRunning(false);
  };

  const reset = (): void => {
    stop();
    doneFired = false;
    setProgress(0);
    paint(0);
  };

  onCleanup(stop);
  if (autoStart) start();

  return { progress, running, start, stop, reset };
}
