import { createSignal, onCleanup, type Accessor } from "solid-js";
import {
  animate,
  type AnimateOptions,
  type AnimationControls,
} from "./animate.js";

export interface TimelineStep extends AnimateOptions {
  /** Start value of this step. */
  from: number;
  /** End value of this step. */
  to: number;
}

export type TimelineStatus = "idle" | "running" | "done";

export interface TimelineControls {
  /** Play every step in order. Resolves when the last step completes. */
  start: () => Promise<void>;
  /** Stop the timeline wherever it is. The start() promise resolves. */
  stop: () => void;
  /** Stop and play again from the first step. */
  replay: () => Promise<void>;
  /** Reactive status: "idle" | "running" | "done". */
  status: Accessor<TimelineStatus>;
}

/**
 * Plays a sequence of one-shot animations back to back.
 *
 * Each step is an `animate()` call: `from`/`to` plus duration, delay,
 * easing, and `onUpdate`. Steps run strictly in order, so one step's
 * `onUpdate` can drive one element while the next step drives another,
 * building choreographed entrances without nested callbacks.
 *
 * `stop()` halts mid-step and resolves the in-flight `start()` promise.
 * `replay()` restarts from the first step. The timeline also stops
 * itself on cleanup.
 *
 * Under reduced motion every step jumps straight to its end value (each
 * step's `onUpdate(to)` still runs, so the final state is always
 * correct). SSR-safe: steps apply their end values instantly.
 *
 * ```ts
 * const intro = createTimeline([
 *   { from: 0, to: 1, duration: 400, onUpdate: (v) => (title.style.opacity = String(v)) },
 *   { from: 24, to: 0, duration: 500, easing: "easeOutExpo", onUpdate: (v) => (title.style.transform = `translateY(${v}px)`) },
 *   { from: 0, to: 1, duration: 300, onUpdate: (v) => (cta.style.opacity = String(v)) },
 * ])
 * await intro.start()
 * ```
 */
export function createTimeline(steps: TimelineStep[]): TimelineControls {
  const [status, setStatus] = createSignal<TimelineStatus>("idle");
  let current: AnimationControls | null = null;
  let runToken = 0;

  const play = async (): Promise<void> => {
    const token = ++runToken;
    const alive = () => token === runToken;
    setStatus("running");

    for (const step of steps) {
      if (!alive()) break;
      const { from, to, ...options } = step;
      if (typeof window === "undefined") {
        options.onUpdate?.(to);
        options.onComplete?.();
        continue;
      }
      await new Promise<void>((resolve) => {
        // Declared before animate() runs: under reduced motion animate()
        // calls onComplete synchronously, before its return value exists.
        // The completed flag keeps `current` from pointing at a control
        // that already finished in that synchronous path.
        let stepControls: AnimationControls | null = null;
        let completed = false;
        stepControls = animate(from, to, {
          ...options,
          onComplete: () => {
            completed = true;
            options.onComplete?.();
            if (current === stepControls) current = null;
            resolve();
          },
        });
        if (!completed) current = stepControls;
        // `finished` also resolves when the step is stopped, which
        // unblocks the chain, the alive() check then ends the run.
        void stepControls.finished.then(() => {
          if (current === stepControls) current = null;
          resolve();
        });
      });
    }

    if (alive()) setStatus("done");
  };

  const stop = (): void => {
    runToken++;
    current?.stop();
    current = null;
    setStatus("idle");
  };

  const controls: TimelineControls = {
    start: () => play(),
    stop,
    replay: () => {
      stop();
      return play();
    },
    status,
  };

  onCleanup(stop);

  return controls;
}
