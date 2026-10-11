/**
 * Math utilities for everyday animation work.
 *
 * Pure functions: no DOM, no state, SSR-safe. Use them for scroll
 * mapping, random variation, wrapping indices, and frame-rate
 * independent damping.
 */

/**
 * Clamp a value into [min, max]. Throws if min > max.
 */
export function clamp(min: number, max: number, value: number): number {
  if (min > max) {
    throw new Error(`clamp: min (${min}) must not exceed max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Map a value from one range to another.
 *
 * ```ts
 * mapRange(0, 1, 0, 100, 0.5) // 50
 * ```
 */
export function mapRange(
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  value: number,
): number {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

/**
 * Snap a value to the nearest multiple of step.
 *
 * ```ts
 * snap(10, 23) // 20
 * ```
 */
export function snap(step: number, value: number): number {
  if (step === 0) return value;
  return Math.round(value / step) * step;
}

/**
 * Snap a value to the nearest point in a list.
 *
 * ```ts
 * snapTo([0, 100, 250], 90) // 100
 * ```
 */
export function snapTo(points: number[], value: number): number {
  if (points.length === 0) return value;
  let best = points[0];
  let bestDist = Math.abs(value - best);
  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(value - points[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = points[i];
    }
  }
  return best;
}

/**
 * Wrap a value into [min, max), cycling around. Useful for carousels
 * and infinite indices.
 *
 * ```ts
 * wrap(0, 3, 4)  // 1
 * wrap(0, 3, -1) // 2
 * ```
 */
export function wrap(min: number, max: number, value: number): number {
  const span = max - min;
  if (span <= 0) return min;
  let v = (value - min) % span;
  if (v < 0) v += span;
  return min + v;
}

/**
 * Linear interpolation between a and b.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent exponential damping.
 *
 * Moves `current` toward `target`; higher `lambda` is snappier.
 * `dt` is seconds since the last frame. This is the same formula
 * behind buttery cursor followers and smooth scroll engines.
 *
 * ```ts
 * // in a rAF tick:
 * current = damp(current, target, 12, dt);
 * ```
 */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/**
 * Random number in [min, max). With one argument, [0, min).
 */
export function random(min: number, max?: number): number {
  const lo = max === undefined ? 0 : min;
  const hi = max === undefined ? min : max;
  return lo + Math.random() * (hi - lo);
}
