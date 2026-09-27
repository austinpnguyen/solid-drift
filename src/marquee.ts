import { createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";

/** Marquee scroll direction. Default "left". */
export type MarqueeDirection = "left" | "right" | "up" | "down";

export interface MarqueeOptions {
  /** Pixels per second. Default 60. */
  speed?: number;
  /** Scroll direction. Default "left". */
  direction?: MarqueeDirection;
  /** Start scrolling immediately. Default true. */
  autoStart?: boolean;
}

export interface MarqueeControls {
  /**
   * Current offset in px. Wraps at the content size, so rendering two
   * copies of the content side by side and translating by `-offset()`
   * (or `-offset()` on Y for vertical) loops seamlessly.
   */
  offset: Accessor<number>;
  /** Whether the marquee clock task is running. */
  running: Accessor<boolean>;
  /**
   * Width (horizontal directions) or height (vertical directions) of one
   * loop unit in px. Measure the content and call this once it is known.
   */
  setContentSize: (px: number) => void;
  start: () => void;
  stop: () => void;
}

/**
 * Infinite marquee scroller. The offset advances at `speed` px/s on the
 * shared clock and wraps at the content size, so a doubled content strip
 * loops seamlessly.
 *
 * Reduced-motion aware: marquees are pure motion, so under reduced motion
 * the marquee stays static (offset 0, never runs). SSR-safe.
 *
 * ```tsx
 * const marquee = createMarquee({ speed: 80 });
 * let strip!: HTMLDivElement;
 * createEffect(() => {
 *   marquee.setContentSize(strip.scrollWidth / 2);
 * });
 * <div style={{ overflow: "hidden" }}>
 *   <div
 *     ref={strip}
 *     style={{
 *       display: "flex",
 *       transform: `translateX(${-marquee.offset()}px)`,
 *       "will-change": "transform",
 *     }}
 *   >
 *     {items}{items}
 *   </div>
 * </div>
 * ```
 */
export function createMarquee(options: MarqueeOptions = {}): MarqueeControls {
  const { speed = 60, direction = "left", autoStart = true } = options;

  if (typeof window === "undefined") {
    const zero = () => 0;
    const falsy = () => false;
    const noop = (): void => {};
    return {
      offset: zero,
      running: falsy,
      setContentSize: noop,
      start: noop,
      stop: noop,
    };
  }

  const sign = direction === "left" || direction === "up" ? 1 : -1;
  const [offset, setOffset] = createSignal(0);
  const [running, setRunning] = createSignal(false);
  let size = 0;
  let phase = 0;
  let last = 0;
  let stopClock: (() => void) | null = null;

  const task = (t: number): boolean => {
    const dt = Math.min(Math.max((t - last) / 1000, 0), 0.25);
    last = t;
    phase += speed * dt;
    if (size > 0) {
      setOffset((((phase * sign) % size) + size) % size);
    }
    return true;
  };

  const start = (): void => {
    if (untrack(running) || prefersReducedMotion()) return;
    setRunning(true);
    last = now();
    stopClock = schedule(task);
  };

  const stop = (): void => {
    stopClock?.();
    stopClock = null;
    setRunning(false);
  };

  onCleanup(stop);
  if (autoStart) start();

  return {
    offset,
    running,
    setContentSize: (px: number) => {
      size = Math.max(px, 0);
      phase = 0;
      setOffset(0);
    },
    start,
    stop,
  };
}
