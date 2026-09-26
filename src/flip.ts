import {
  animate,
  type AnimateOptions,
  type AnimationControls,
} from "./animate.js"
import { prefersReducedMotion } from "./reduced-motion.js"

export interface FlipOptions {
  /** Duration in milliseconds. Default 400. */
  duration?: number
  /** Delay before starting, in milliseconds. Default 0. */
  delay?: number
  /** Easing function or name. Default "easeOutCubic". */
  easing?: AnimateOptions["easing"]
  /**
   * Also animate the size delta as scale, so growing or shrinking
   * elements morph instead of just sliding. Default true.
   */
  scale?: boolean
}

/**
 * FLIP layout animation around a DOM mutation.
 *
 * Records the element's position and size (First), runs your `mutate()`
 * which changes the layout (Last), then Inverts the delta as a transform
 * and Plays it back to identity. List reorders, expanding panels, and
 * grid reshuffles glide to their new spots instead of jumping.
 *
 * The element's pre-existing `transform` is captured and restored after
 * the animation, so FLIP composes with other transform animations.
 * `stop()` halts mid-flight and restores the original transform.
 *
 * SSR-safe and reduced-motion safe: the mutation runs with no animation.
 * If the element does not move, no animation runs either.
 *
 * ```tsx
 * import { animateFlip } from "solid-drift"
 *
 * const [items, setItems] = createSignal(["a", "b", "c"])
 * let list!: HTMLUListElement
 *
 * const shuffle = () =>
 *   animateFlip(
 *     () => list,
 *     () => setItems((prev) => [...prev].reverse()),
 *     { duration: 450 },
 *   )
 * ```
 */
export function animateFlip(
  ref: () => Element | null | undefined,
  mutate: () => void,
  options: FlipOptions = {},
): AnimationControls {
  const {
    duration = 400,
    delay = 0,
    easing = "easeOutCubic",
    scale = true,
  } = options

  let resolveFinished!: () => void
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })
  let done = false
  const finish = () => {
    if (done) return
    done = true
    resolveFinished()
  }

  const el = ref()
  if (typeof window === "undefined" || !el || prefersReducedMotion()) {
    mutate()
    finish()
    return { stop: () => {}, finished }
  }
  const target = el as HTMLElement
  const prevTransform = target.style.transform

  const first = target.getBoundingClientRect()
  mutate()

  let stopped = false
  let step: AnimationControls | null = null
  const controls: AnimationControls = {
    stop: () => {
      stopped = true
      step?.stop()
      target.style.transform = prevTransform
      finish()
    },
    finished,
  }

  // Two frames: one for Solid's DOM update to flush, one to measure it.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (stopped) {
        finish()
        return
      }
      const last = target.getBoundingClientRect()
      const dx = first.left - last.left
      const dy = first.top - last.top
      const sx = scale && last.width > 0 ? first.width / last.width : 1
      const sy = scale && last.height > 0 ? first.height / last.height : 1

      const moved =
        Math.abs(dx) >= 0.5 ||
        Math.abs(dy) >= 0.5 ||
        Math.abs(sx - 1) >= 0.001 ||
        Math.abs(sy - 1) >= 0.001
      if (!moved) {
        finish()
        return
      }

      const render = (eased: number) => {
        const rest = 1 - eased
        target.style.transform =
          `translate3d(${(dx * rest).toFixed(2)}px, ${(dy * rest).toFixed(2)}px, 0)` +
          (scale
            ? ` scale(${(1 + (sx - 1) * rest).toFixed(4)}, ${(1 + (sy - 1) * rest).toFixed(4)})`
            : "")
      }
      render(0)
      // Force the inverted state to apply before the animation runs.
      void target.offsetHeight

      step = animate(0, 1, {
        duration,
        delay,
        easing,
        onUpdate: render,
        onComplete: () => {
          target.style.transform = prevTransform
          finish()
        },
      })
    }),
  )

  return controls
}
