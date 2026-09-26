import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js"
import { now, schedule } from "./engine.js"
import { prefersReducedMotion } from "./reduced-motion.js"

export interface SpringOptions {
  /** Spring stiffness. Default 170. */
  stiffness?: number
  /** Damping coefficient. Default 26. */
  damping?: number
  /** Mass. Default 1. */
  mass?: number
  /** Rest threshold for value and velocity. Default 0.01. */
  precision?: number
  /** Called once the spring settles at its target. */
  onRest?: () => void
}

/**
 * A signal that smoothly follows a source signal with spring physics.
 *
 * Retargeting is seamless: if the source changes mid-flight, the spring
 * keeps its current velocity and bends toward the new target, no jumps,
 * no restarts.
 *
 * ```tsx
 * const [target, setTarget] = createSignal(0)
 * const x = createSpring(target, { stiffness: 170, damping: 26 })
 * <div style={{ transform: `translateX(${x()}px)` }} />
 * setTarget(200) // glides there
 * ```
 */
export function createSpring(
  source: Accessor<number>,
  options: SpringOptions = {},
): Accessor<number> {
  const {
    stiffness = 170,
    damping = 26,
    mass = 1,
    precision = 0.01,
    onRest,
  } = options

  const [value, setValue] = createSignal(untrack(source))
  let current = untrack(source)
  let velocity = 0
  let cancel: (() => void) | null = null
  let lastTime = 0

  const step = (t: number): boolean => {
    const dt = Math.min(Math.max((t - lastTime) / 1000, 0), 0.064)
    lastTime = t
    const target = untrack(source)

    // Semi-implicit Euler: stable for the stiffness ranges used in UI.
    const force = -stiffness * (current - target) - damping * velocity
    velocity += (force / mass) * dt
    current += velocity * dt
    setValue(current)

    const settled =
      Math.abs(current - target) < precision && Math.abs(velocity) < precision
    if (settled) {
      current = target
      velocity = 0
      setValue(target)
      cancel = null
      onRest?.()
      return false
    }
    return true
  }

  const kick = () => {
    if (cancel) return // already running, step() reads the live target
    lastTime = now()
    cancel = schedule(step)
  }

  createEffect(() => {
    const target = source() // track
    if (prefersReducedMotion()) {
      // Accessibility: skip the animation, land exactly on the target.
      cancel?.()
      cancel = null
      current = target
      velocity = 0
      setValue(target)
      onRest?.()
      return
    }
    kick()
  })

  onCleanup(() => cancel?.())

  return value
}

/**
 * Named spring configurations for common feels. Spread into
 * `createSpring`, `createMagnetic`, or `createTilt` options:
 *
 * ```ts
 * const x = createSpring(target, { ...springPresets.wobbly })
 * ```
 */
export const springPresets = {
  /** Soft and calm. Default-like, a touch slower. */
  gentle: { stiffness: 120, damping: 20 },
  /** The library default balance. */
  default: { stiffness: 170, damping: 26 },
  /** Tight and responsive, for UI that must keep up. */
  snappy: { stiffness: 260, damping: 30 },
  /** Loose and playful, with a visible overshoot. */
  wobbly: { stiffness: 180, damping: 11 },
  /** Heavy and deliberate, like moving through syrup. */
  molasses: { stiffness: 55, damping: 16 },
} satisfies Record<string, SpringOptions>
