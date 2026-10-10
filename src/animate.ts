import { now, schedule } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import {
  registerTween,
  type OverwriteMode,
} from "./overwrite.js";

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
  /**
   * Called when the animation is killed by overwrite or killTweensOf
   * (not when it completes or is stopped manually).
   */
  onInterrupt?: () => void;
  /**
   * Groups this tween for overwrite management. With
   * `overwrite: "auto"`, starting a new tween with the same id kills
   * every active tween under that id first.
   */
  id?: string;
  /**
   * `"auto"` kills active tweens with the same `id` when this one
   * starts. `"none"` (default) keeps the current behavior.
   */
  overwrite?: OverwriteMode;
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
  const {
    duration = 300,
    delay = 0,
    onUpdate,
    onComplete,
    onInterrupt,
    id,
    overwrite = "none",
  } = options;
  const easing = resolveEasing(options.easing ?? "easeOutCubic");

  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  let done = false;
  let unregister: (() => void) | null = null;
  const finish = (completed: boolean, interrupted = false) => {
    if (done) return;
    done = true;
    unregister?.();
    unregister = null;
    if (completed) onComplete?.();
    else if (interrupted) onInterrupt?.();
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

  const stop = () => {
    cancel();
    finish(false);
  };

  if (id !== undefined) {
    unregister = registerTween(
      id,
      { kill: stop, onInterrupt },
      overwrite,
    );
  }

  return { stop, finished };
}
