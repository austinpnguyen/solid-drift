/**
 * Shared animation clock.
 *
 * A single requestAnimationFrame loop drives every active animation in the
 * app, so hundreds of springs and tweens cost exactly one rAF tick per frame.
 * Tasks return `false` when finished and are removed automatically.
 *
 * Battery saving: when the tab becomes hidden the loop stops and the clock
 * freezes, so no animation burns CPU in the background. When the tab is
 * visible again the loop resumes and the clock continues where it left off,
 * so in-flight animations continue seamlessly instead of jumping forward.
 */

export type AnimationTask = (now: number) => boolean;

const tasks = new Set<AnimationTask>();
let rafId = 0;

// Time scale for devtools slow motion. 1 means real time. Only the
// devtools subpath ever changes this, so production behavior is untouched.
let timeScale = 1;
// Virtual clock anchor: the scaled time and the raw pause-adjusted time at
// the moment the scale last changed. Re-anchoring on every change means
// switching between 1x and 0.25x never causes a time jump.
let scaleAnchorVirtual = 0;
let scaleAnchorRaw = 0;

// Milliseconds of hidden time subtracted from the raw clock, so now()
// freezes while the tab is hidden and resumes seamlessly on return.
let pausedMs = 0;
// Raw timestamp of the moment the tab was hidden, or null while visible.
let hiddenAt: number | null = null;
let visibilityHooked = false;

function rawNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function tick(): void {
  // Tasks always see the pause-adjusted clock, never the raw rAF stamp,
  // so a hidden-then-visible gap never shows up as a time jump.
  // The clock is additionally scaled when devtools slow motion is active.
  const t = scaledNow();
  for (const task of tasks) {
    let alive = false;
    try {
      alive = task(t);
    } catch {
      alive = false;
    }
    if (!alive) tasks.delete(task);
  }
  rafId = tasks.size > 0 ? requestAnimationFrame(tick) : 0;
}

function onVisibilityChange(): void {
  if (typeof document === "undefined") return;
  if (document.hidden) {
    if (hiddenAt === null) {
      hiddenAt = rawNow();
      if (rafId) {
        if (typeof cancelAnimationFrame !== "undefined") {
          cancelAnimationFrame(rafId);
        }
        rafId = 0;
      }
    }
  } else if (hiddenAt !== null) {
    pausedMs += rawNow() - hiddenAt;
    hiddenAt = null;
    if (
      tasks.size > 0 &&
      !rafId &&
      typeof requestAnimationFrame !== "undefined"
    ) {
      rafId = requestAnimationFrame(tick);
    }
  }
}

function hookVisibility(): void {
  if (visibilityHooked) return;
  visibilityHooked = true;
  if (
    typeof document !== "undefined" &&
    typeof document.addEventListener === "function"
  ) {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
}

/**
 * Register a task on the shared clock. Returns a cancel function.
 * Safe to call during SSR (no-op without requestAnimationFrame).
 */
export function schedule(task: AnimationTask): () => void {
  if (typeof requestAnimationFrame === "undefined") return () => {};
  hookVisibility();
  tasks.add(task);
  const hidden =
    typeof document !== "undefined" && document.hidden === true;
  if (!rafId && !hidden) rafId = requestAnimationFrame(tick);
  return () => {
    tasks.delete(task);
  };
}

/**
 * Monotonic clock in milliseconds. Freezes while the tab is hidden and
 * resumes where it left off, so animations never observe the hidden gap.
 */
export function now(): number {
  return (hiddenAt ?? rawNow()) - pausedMs;
}

/**
 * Engine clock with devtools time scaling applied. Identical to now()
 * when the time scale is 1 (always the case in production).
 */
function scaledNow(): number {
  if (timeScale === 1) return now();
  return scaleAnchorVirtual + (now() - scaleAnchorRaw) * timeScale;
}

/**
 * Set the engine time scale for devtools slow motion (e.g. 0.25, 0.5, 1).
 * Re-anchors the virtual clock so changing the scale never jumps time.
 * Only used by the solid-drift/devtools subpath; production bundles that
 * never import devtools always run at scale 1.
 */
export function setTimeScale(scale: number): void {
  if (!(scale > 0) || !Number.isFinite(scale)) return;
  const current = scaledNow();
  scaleAnchorVirtual = current;
  scaleAnchorRaw = now();
  timeScale = scale;
}

/**
 * Current engine time scale. Always 1 unless devtools changed it.
 */
export function getTimeScale(): number {
  return timeScale;
}

/**
 * Number of animations currently registered on the shared clock.
 * Only used by the solid-drift/devtools subpath.
 */
export function getActiveTaskCount(): number {
  return tasks.size;
}
