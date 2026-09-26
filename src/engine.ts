/**
 * Shared animation clock.
 *
 * A single requestAnimationFrame loop drives every active animation in the
 * app, so hundreds of springs and tweens cost exactly one rAF tick per frame.
 * Tasks return `false` when finished and are removed automatically.
 */

export type AnimationTask = (now: number) => boolean;

const tasks = new Set<AnimationTask>();
let rafId = 0;

function tick(now: number): void {
  for (const task of tasks) {
    let alive = false;
    try {
      alive = task(now);
    } catch {
      alive = false;
    }
    if (!alive) tasks.delete(task);
  }
  rafId = tasks.size > 0 ? requestAnimationFrame(tick) : 0;
}

/**
 * Register a task on the shared clock. Returns a cancel function.
 * Safe to call during SSR (no-op without requestAnimationFrame).
 */
export function schedule(task: AnimationTask): () => void {
  if (typeof requestAnimationFrame === "undefined") return () => {};
  tasks.add(task);
  if (!rafId) rafId = requestAnimationFrame(tick);
  return () => {
    tasks.delete(task);
  };
}

/** Monotonic clock in milliseconds. */
export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
