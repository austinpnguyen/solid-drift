import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js"
import { now, schedule } from "./engine.js"
import { prefersReducedMotion } from "./reduced-motion.js"

export interface VelocityOptions {
  /**
   * Exponential smoothing of the raw velocity, 0 to 1. Higher values
   * react slower and ride smoother. Default 0.8.
   */
  smoothing?: number
  /** Multiplier applied to the raw units per second. Default 1. */
  scale?: number
  /**
   * Seconds of stillness after which the velocity settles to exactly 0.
   * Default 0.12.
   */
  settleAfter?: number
}

/**
 * A signal tracking how fast another signal is changing, in scaled units
 * per second, smoothed with an exponential moving average.
 *
 * The classic use is scroll velocity: it spikes while the user flings the
 * page and eases back to 0 when scrolling stops, which makes it perfect
 * for velocity-driven skew, stretch, or motion blur that intensifies with
 * speed. With no source it measures page scroll in pixels per second.
 *
 * The measurement loop runs on the shared clock only while the value is
 * live: it kicks off when the source changes and parks itself once the
 * velocity settles back to 0.
 *
 * SSR-safe: returns a constant `0` accessor on the server. Under reduced
 * motion it also returns constant `0`, since velocity-reactive effects
 * are motion by another name.
 *
 * ```tsx
 * // Skew a list while the user scrolls fast, relax when they stop.
 * const velocity = createVelocity() // px per second of page scroll
 * const skew = () => Math.max(-8, Math.min(8, velocity() / 120))
 * <ul style={{ transform: `skewY(${skew()}deg)` }}>…</ul>
 *
 * // Velocity of any signal, in its own units per second.
 * const [n, setN] = createSignal(0)
 * const speed = createVelocity(n, { smoothing: 0.7 })
 * ```
 */
export function createVelocity(
  source?: Accessor<number>,
  options: VelocityOptions = {},
): Accessor<number> {
  if (typeof window === "undefined" || prefersReducedMotion()) {
    return () => 0
  }

  const { smoothing = 0.8, scale = 1, settleAfter = 0.12 } = options
  const read: Accessor<number> = source ?? (() => window.scrollY)
  const [velocity, setVelocity] = createSignal(0)

  let current = 0
  let lastValue = untrack(read)
  let lastT = now()
  let lastChangeT = lastT
  let cancel: (() => void) | null = null

  const loop = (t: number): boolean => {
    const value = untrack(read)
    const dt = Math.max((t - lastT) / 1000, 0.0001)
    if (value !== lastValue) {
      const instant = ((value - lastValue) / dt) * scale
      current = current * smoothing + instant * (1 - smoothing)
      lastValue = value
      lastChangeT = t
    } else if (t - lastChangeT > settleAfter * 1000) {
      current = 0
    } else {
      // Coast down smoothly between samples instead of holding stale speed.
      current *= Math.pow(0.02, dt)
    }
    lastT = t
    setVelocity(current)

    const settled =
      Math.abs(current) < 0.001 && t - lastChangeT > settleAfter * 1000
    if (settled) {
      setVelocity(0)
      cancel = null
      return false
    }
    return true
  }

  const kick = () => {
    if (cancel) return
    lastT = now()
    cancel = schedule(loop)
  }

  createEffect(() => {
    read() // track the source so any change kicks the loop
    kick()
  })

  if (!source) {
    // The default page-scroll source is not a reactive signal, so scroll
    // events kick the loop explicitly.
    window.addEventListener("scroll", kick, { passive: true })
    onCleanup(() => window.removeEventListener("scroll", kick))
  }

  onCleanup(() => cancel?.())

  return velocity
}
