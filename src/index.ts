/**
 * solid-drift — signal-native animation for SolidJS.
 *
 * Animate values, not elements: springs and tweens follow your signals, and
 * retargeting mid-flight is seamless by design.
 */

export { createSpring, type SpringOptions } from "./spring.js";
export { createTween, type TweenOptions } from "./tween.js";
export {
  animate,
  type AnimateOptions,
  type AnimationControls,
} from "./animate.js";
export { drift, type DriftProps } from "./directive.js";
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
} from "./easing.js";
