import { now, schedule } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface AnimateOptions {
  /** Duration in milliseconds. Default 300. */
  duration?: number;
  /** Delay before starting, in milliseconds. Default 0. */
  delay?: number;
  /** Easing function or name. Default "easeOutCubic". */
  easing?: Easing | EasingName;
  /** Called every frame with the current value. */
  onUpdate?: (value: number) => void;
  /** Called when the animation completes (not when stopped). */
  onComplete?: () => void;
}

export interface AnimationControls {
  /** Stop the animation immediately. */
  stop: () => void;
  /** Resolves when the animation completes or is stopped. */
  finished: Promise<void>;
}

/**
 * Imperative one-shot animation from `from` to `to`.
 *
 * ```ts
 * const ctl = animate(0, 100, {
 *   duration: 500,
 *   easing: "easeOutExpo",
 *   onUpdate: (v) => el.style.opacity = String(v / 100),
 * })
 * await ctl.finished
 * ```
 */
export function animate(
  from: number,
  to: number,
  options: AnimateOptions = {},
): AnimationControls {
  const { duration = 300, delay = 0, onUpdate, onComplete } = options;
  const easing = resolveEasing(options.easing ?? "easeOutCubic");

  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  let done = false;
  const finish = (completed: boolean) => {
    if (done) return;
    done = true;
    if (completed) onComplete?.();
    resolveFinished();
  };

  // Accessibility: skip the animation entirely, deliver the end value.
  if (prefersReducedMotion()) {
    onUpdate?.(to);
    finish(true);
    return { stop: () => finish(false), finished };
  }

  const startAt = now() + delay;
  const span = Math.max(duration, 0.001);
  const cancel = schedule((t: number): boolean => {
    if (t < startAt) return true;
    const p = Math.min((t - startAt) / span, 1);
    onUpdate?.(from + (to - from) * easing(p));
    if (p >= 1) {
      finish(true);
      return false;
    }
    return true;
  });

  return {
    stop: () => {
      cancel();
      finish(false);
    },
    finished,
  };
}
