// Core: springs, tweens, staggered lists, timelines, sequences, imperative animation.
export { createSpring, type SpringOptions, springPresets } from "../spring.js";
export { createTween, type TweenOptions } from "../tween.js";
export { createStagger } from "../stagger.js";
export { createTimeline, type TimelineStep, type TimelineControls, type TimelineStatus } from "../timeline.js";
export { createSequence, type SequenceAt, type SequenceStep, type SequenceControls, type SequenceStatus, type NestedSequence } from "../sequence.js";
export { animate, type AnimateOptions, type AnimationControls } from "../animate.js";
export { drift, type DriftProps, type DriftWithControls } from "../directive.js";
export { pauseAll, resumeAll, isPaused, setGlobalTimeScale, globalTimeScale } from "../global.js";
