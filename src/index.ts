/**
 * solid-drift: signal-native animation for SolidJS.
 *
 * Animate values, not elements: springs and tweens follow your signals, and
 * retargeting mid-flight is seamless by design.
 */

export { createSpring, type SpringOptions, springPresets } from "./spring.js"
export { createTween, type TweenOptions } from "./tween.js"
export {
  animate,
  type AnimateOptions,
  type AnimationControls,
} from "./animate.js"
export { drift, type DriftProps } from "./directive.js"
export { createScrollProgress, type ScrollTarget } from "./scroll.js"
export { createInView, type InViewOptions } from "./inview.js"
export {
  usePrefersReducedMotion,
  prefersReducedMotion,
} from "./reduced-motion.js"
export { createStagger } from "./stagger.js"
export {
  createHorizontalScroll,
  type HorizontalScrollOptions,
  type HorizontalScrollResult,
} from "./horizontal.js"
export { createScrub, type ScrubKeyframe, type ScrubOptions } from "./scrub.js"
export { createVelocity, type VelocityOptions } from "./velocity.js"
export {
  createMagnetic,
  type MagneticOptions,
  type MagneticResult,
  createTilt,
  type TiltOptions,
  type TiltResult,
} from "./pointer.js"
export { createTrail, type TrailOptions } from "./trail.js"
export {
  createTimeline,
  type TimelineStep,
  type TimelineStatus,
  type TimelineControls,
} from "./timeline.js"
export { animateFlip, type FlipOptions } from "./flip.js"
export {
  easings,
  cubicBezier,
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
  resolveEasing,
  type Easing,
  type EasingName,
} from "./easing.js"
