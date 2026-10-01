// Utilities: everyday app glue (DOM helpers, haptics, storage, gesture state).
export * from "../apputils.js";
export * from "../dom.js";
export * from "../haptic.js";
export * from "../copy.js";
export { prefersReducedMotion, createPrefersReducedMotion } from "../reduced-motion.js";
export { isLowPowerMode, createLowPowerMode, type LowPowerOptions } from "../power.js";
