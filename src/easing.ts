/** Easing function: maps progress [0, 1] to eased progress [0, 1]. */
export type Easing = (t: number) => number

export const linear: Easing = (t) => t

export const easeInQuad: Easing = (t) => t * t
export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t)
export const easeInOutQuad: Easing = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

export const easeInCubic: Easing = (t) => t * t * t
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3)
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export const easeInQuart: Easing = (t) => t * t * t * t
export const easeOutQuart: Easing = (t) => 1 - Math.pow(1 - t, 4)
export const easeInOutQuart: Easing = (t) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2

export const easeOutExpo: Easing = (t) =>
  t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)

export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/**
 * Cubic bezier easing, same parameters as CSS `cubic-bezier(x1, y1, x2, y2)`.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Easing {
  // Newton-Raphson + bisection fallback, adapted from the CSS spec approach.
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx

  return (x: number) => {
    let t = x
    for (let i = 0; i < 5; i++) {
      const dx = sampleDX(t)
      if (Math.abs(dx) < 1e-6) break
      const err = sampleX(t) - x
      t -= err / dx
    }
    // Fallback bisection if Newton diverged.
    let lo = 0
    let hi = 1
    t = Math.min(Math.max(t, 0), 1)
    while (hi - lo > 1e-6) {
      const v = sampleX(t)
      if (Math.abs(v - x) < 1e-6) break
      if (v < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sampleY(t)
  }
}

export const easings = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeOutExpo,
  easeOutBack,
} as const

export type EasingName = keyof typeof easings

/** Accept an easing function or its name. Throws on unknown names. */
export function resolveEasing(easing: Easing | EasingName | undefined): Easing {
  if (!easing) return easeOutCubic
  if (typeof easing === "function") return easing
  const fn = (easings as Record<string, Easing>)[easing]
  if (!fn) throw new Error(`[solid-drift] unknown easing: "${easing}"`)
  return fn
}
