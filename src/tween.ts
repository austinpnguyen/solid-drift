import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";

export interface TweenOptions {
  /** Duration in milliseconds. Default 300. */
  duration?: number;
  /** Delay before starting, in milliseconds. Default 0. */
  delay?: number;
  /** Easing function or name. Default "easeOutCubic". */
  easing?: Easing | EasingName;
  /** Called when the tween reaches its target. */
  onComplete?: () => void;
}

/**
 * A signal that tweens toward a source signal's value over a fixed duration.
 *
 * Interrupting mid-tween retargets from the current value — no snapping.
 *
 * ```tsx
 * const [open, setOpen] = createSignal(false);
 * const opacity = createTween(() => (open() ? 1 : 0), { duration: 250 });
 * <div style={{ opacity: opacity() }} />
 * ```
 */
export function createTween(
  source: Accessor<number>,
  options: TweenOptions = {},
): Accessor<number> {
  const { duration = 300, delay = 0, onComplete } = options;
  const easing = resolveEasing(options.easing ?? "easeOutCubic");

  const [value, setValue] = createSignal(untrack(source));
  let cancel: (() => void) | null = null;

  createEffect(() => {
    const to = source();
    const from = untrack(value);
    cancel?.();
    cancel = null;

    if (duration <= 0 || from === to) {
      setValue(to);
      onComplete?.();
      return;
    }

    const startAt = now() + delay;
    cancel = schedule((t: number): boolean => {
      if (t < startAt) return true;
      const p = Math.min((t - startAt) / duration, 1);
      setValue(from + (to - from) * easing(p));
      if (p >= 1) {
        cancel = null;
        onComplete?.();
        return false;
      }
      return true;
    });
  });

  onCleanup(() => cancel?.());

  return value;
}
