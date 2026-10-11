import {
  pauseAll as enginePause,
  resumeAll as engineResume,
  isPaused as engineIsPaused,
  setTimeScale,
  getTimeScale,
} from "./engine.js";

/**
 * Global animation controls: a master switch for every animation on the
 * shared engine. Useful for pause menus, slow-motion debug, and as a
 * final reduced-motion kill switch.
 *
 * These are also available as methods on the `drift` export:
 * `drift.pauseAll()`, `drift.resumeAll()`, etc.
 */

/** Freeze every animation; in-flight promises stay pending. */
export function pauseAll(): void {
  enginePause();
}

/** Resume after pauseAll(). */
export function resumeAll(): void {
  engineResume();
}

/** Whether animations are currently paused via pauseAll(). */
export function isPaused(): boolean {
  return engineIsPaused();
}

/**
 * Set the global playback speed. 1 is normal, 0.2 is slow motion,
 * 0 freezes everything (a kill switch). Changing the scale never
 * causes a time jump.
 */
export function setGlobalTimeScale(n: number): void {
  if (!Number.isFinite(n) || n < 0) return;
  setTimeScale(n);
}

/** Current global time scale. 1 is normal. */
export function globalTimeScale(): number {
  return getTimeScale();
}
