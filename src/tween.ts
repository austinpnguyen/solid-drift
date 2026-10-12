import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import {
  registerTween,
  type OverwriteMode,
} from "./overwrite.js";

export interface TweenOptions {
  /** Duration in milliseconds. Default 300. */
  duration?: number;
  /** Delay before starting, in milliseconds. Default 0. */
  delay?: number;
  /** Easing function or name. Default "easeOutCubic". */
  easing?: Easing | EasingName;
  /** Called when the tween reaches its target. */
  onComplete?: () => void;
  /** Called when the tween is killed by overwrite or killTweensOf. */
  onInterrupt?: () => void;
  /**
   * Groups this tween for overwrite management. With
   * `overwrite: "auto"`, retargeting kills the in-flight tween first
   * (its `onInterrupt` runs).
   */
  id?: string;
  /**
   * `"auto"` kills the in-flight tween under the same `id` when the
   * source changes. `"none"` (default) keeps the current behavior.
   */
  overwrite?: OverwriteMode;
}

/**
 * A signal that tweens toward a source signal's value over a fixed duration.
 *
 * Interrupting mid-tween retargets from the current value, with no snapping.
 *
 * ```tsx
 * const [open, setOpen] = createSignal(false)
 * const opacity = createTween(() => (open() ? 1 : 0), { duration: 250 })
 * <div style={{ opacity: opacity() }} />
 * ```
 */
export function createTween(
  source: Accessor<number>,
  options: TweenOptions = {},
): Accessor<number> {
  const { duration = 300, delay = 0, onComplete, onInterrupt, id, overwrite = "none" } = options;
  const easing = resolveEasing(options.easing ?? "easeOutCubic");

  const [value, setValue] = createSignal(untrack(source));
  let cancel: (() => void) | null = null;
  let unregister: (() => void) | null = null;

  const kill = (interrupted: boolean) => {
    cancel?.();
    cancel = null;
    unregister?.();
    unregister = null;
    if (interrupted) {
      try {
        onInterrupt?.();
      } catch {
        // ignore
      }
    }
  };

  createEffect(() => {
    const to = source();
    const from = untrack(value);

    if (prefersReducedMotion() || duration <= 0 || from === to) {
      // Accessibility: jump straight to the target, no animation.
      kill(false);
      setValue(to);
      onComplete?.();
      return;
    }

    const startAt = now() + delay;
    // When overwriting, registerTween kills the in-flight tween under the
    // same id (firing its onInterrupt). Otherwise kill silently first.
    if (!(id !== undefined && overwrite === "auto")) {
      kill(false);
    }
    const killCurrent = (interrupted: boolean) => kill(interrupted);
    if (id !== undefined) {
      unregister = registerTween(
        id,
        // Contract: kill() stops silently; the registry fires onInterrupt.
        { kill: () => killCurrent(false), onInterrupt },
        overwrite,
      );
    }
    cancel = schedule((t: number): boolean => {
      if (t < startAt) return true;
      const p = Math.min((t - startAt) / duration, 1);
      setValue(from + (to - from) * easing(p));
      if (p >= 1) {
        cancel = null;
        unregister?.();
        unregister = null;
        onComplete?.();
        return false;
      }
      return true;
    });
  });

  onCleanup(() => kill(false));

  return value;
}
