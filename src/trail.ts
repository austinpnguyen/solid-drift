import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface TrailOptions {
  /** How far behind the source the trail follows, in ms. Default 120. */
  delay?: number;
}

/**
 * A signal that replays another signal's past: it returns the value the
 * source had `delay` milliseconds ago, interpolated between samples.
 *
 * Chain trails off one source for follower effects (a cursor with a
 * comet tail, cascading highlights), or trail a scroll progress for a
 * delayed echo of the page. The trail catches up and parks exactly on
 * the latest value when the source rests.
 *
 * The follow loop runs on the shared clock only while the trail is
 * behind: it starts when the source changes and stops once caught up.
 *
 * SSR-safe: returns the source itself on the server. Under reduced
 * motion it also returns the source directly (no trailing motion).
 *
 * ```tsx
 * const [tab, setTab] = createSignal(0)
 * // The indicator glides behind the selection instead of jumping.
 * const ghost = createTrail(tab, { delay: 150 })
 * ```
 */
export function createTrail(
  source: Accessor<number>,
  options: TrailOptions = {},
): Accessor<number> {
  const { delay = 120 } = options;

  if (typeof window === "undefined" || prefersReducedMotion() || delay <= 0) {
    return source;
  }

  const [value, setValue] = createSignal(untrack(source));
  const samples: Array<[time: number, value: number]> = [
    [now(), untrack(source)],
  ];
  let cancel: (() => void) | null = null;

  const tick = (t: number): boolean => {
    const target = t - delay;
    // Drop samples the trail has already passed (keep one for context).
    while (samples.length > 2 && samples[1][0] <= target) samples.shift();

    const [firstT, firstV] = samples[0];
    const [lastT, lastV] = samples[samples.length - 1];
    let current: number;
    if (samples.length === 1 || target <= firstT) {
      current = firstV;
    } else if (target >= lastT) {
      current = lastV;
    } else {
      const [ta, va] = samples[0];
      const [tb, vb] = samples[1];
      const p = (target - ta) / Math.max(tb - ta, 0.0001);
      current = va + (vb - va) * p;
    }
    setValue(current);

    if (target >= lastT) {
      cancel = null; // caught up: park exactly on the latest value
      return false;
    }
    return true;
  };

  const kick = () => {
    if (!cancel) cancel = schedule(tick);
  };

  createEffect(() => {
    const v = source();
    samples.push([now(), v]);
    if (samples.length > 600) samples.splice(0, samples.length - 600);
    kick();
  });

  onCleanup(() => cancel?.());

  return value;
}
