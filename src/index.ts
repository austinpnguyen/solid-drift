/**
 * solid-drift: signal-native animation for SolidJS.
 *
 * Animate values, not elements: springs and tweens follow your signals, and
 * retargeting mid-flight is seamless by design.
 */

export { createSpring, type SpringOptions, springPresets } from "./spring.js";
export { createTween, type TweenOptions } from "./tween.js";
export {
  animate,
  type AnimateOptions,
  type AnimationControls,
} from "./animate.js";
export { drift, type DriftProps } from "./directive.js";
export { createScrollProgress, type ScrollTarget } from "./scroll.js";
export { createInView, type InViewOptions } from "./inview.js";
export {
  usePrefersReducedMotion,
  prefersReducedMotion,
} from "./reduced-motion.js";
export { createStagger } from "./stagger.js";
export {
  createHorizontalScroll,
  type HorizontalScrollOptions,
  type HorizontalScrollResult,
} from "./horizontal.js";
export { createScrub, type ScrubKeyframe, type ScrubOptions } from "./scrub.js";
export {
  createScrollColor,
  type ScrollColorStop,
  type ScrollColorOptions,
  type ScrollColorFormat,
  createScrollTracking,
  type ScrollTrackingOptions,
  createScrollLine,
  type ScrollLineOptions,
  type ScrollLineStyle,
  type ScrollLineAxis,
  type ScrollLineOrigin,
} from "./scrollfx.js";
export { createVelocity, type VelocityOptions } from "./velocity.js";
export {
  createMagnetic,
  type MagneticOptions,
  type MagneticResult,
  createTilt,
  type TiltOptions,
  type TiltResult,
} from "./pointer.js";
export { createTrail, type TrailOptions } from "./trail.js";
export {
  createTimeline,
  type TimelineStep,
  type TimelineStatus,
  type TimelineControls,
} from "./timeline.js";
export { animateFlip, type FlipOptions } from "./flip.js";
export {
  createSquashStretch,
  type SquashStretchOptions,
  type SquashStretchResult,
  createFollowThrough,
  type FollowThroughOptions,
  createAnticipation,
  type AnticipationOptions,
  createWobble,
  type WobbleOptions,
  type WobbleResult,
} from "./cartoon.js";
export {
  createGravity,
  type GravityOptions,
  type GravityResult,
  createPendulum,
  type PendulumOptions,
  type PendulumResult,
  createFling,
  type FlingOptions,
  type FlingResult,
} from "./physics.js";
export {
  createFontSwap,
  type FontSwapOptions,
  type FontSwapResult,
  createTyping,
  type TypingOptions,
  type TypingResult,
  createTextPhysics,
  type TextPhysicsOptions,
  type TextPhysicsResult,
  createTextTunnel,
  type TextTunnelOptions,
  type TextTunnelResult,
  createTextCutout,
  type TextCutoutOptions,
  createTextGradient,
  type TextGradientOptions,
  createTextScramble,
  type TextScrambleOptions,
  type TextScrambleResult,
  createTextWave,
  type TextWaveOptions,
} from "./typography.js";
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
  easeInBack,
  easeInOutBack,
  easeOutElastic,
  easeOutBounce,
  resolveEasing,
  type Easing,
  type EasingName,
} from "./easing.js";

export {
  createKineticType,
  createScenePlayer,
  createShowreel,
  createCamera,
  createColorShift,
  createTransition,
  createBeat,
  createBeatCuts,
} from "./motion.js";
export type {
  KineticTypeFrom,
  KineticTypeOptions,
  KineticTypeStatus,
  KineticTypeControls,
  MotionScene,
  ScenePlayerStatus,
  ScenePlayerControls,
  ShowreelScene,
  ShowreelSceneKind,
  CameraKeyframe,
  CameraOptions,
  ColorShiftOptions,
  ColorShiftStatus,
  ColorShiftControls,
  TransitionType,
  TransitionDirection,
  TransitionOptions,
  TransitionLayerStyle,
  TransitionStatus,
  TransitionControls,
  BeatOptions,
  BeatStatus,
  BeatControls,
  BeatCutOptions,
} from "./motion.js";
export {
  createDrag,
  type DragStatus,
  type DragAxis,
  type DragConstraints,
  type DragEndInfo,
  type DragOptions,
  type DragControls,
} from "./gesture.js";
export {
  createStreamReveal,
  createAgentState,
  parseDriftSpec,
  createSpecPlayer,
  DriftSpecError,
} from "./ai.js";
export type {
  StreamRevealStatus,
  StreamRevealOptions,
  StreamRevealControls,
  AgentState,
  AgentStateTransition,
  AgentStateOptions,
  AgentStateControls,
  DriftSpecPrimitive,
  DriftSpecStep,
  DriftSpec,
  SpecPlayerStatus,
  SpecPlayerControls,
} from "./ai.js";
export {
  createTxLifecycle,
  createTicker,
  createMintReveal,
  createConnectButton,
} from "./web3.js";
export type {
  TxState,
  TxStatusInput,
  TxLifecycleOptions,
  TxLifecycleControls,
  TickerOptions,
  TickerControls,
  MintRevealStatus,
  MintRevealOptions,
  MintRevealControls,
  ConnectButtonOptions,
  ConnectButtonStatus,
  ConnectButtonControls,
} from "./web3.js";
