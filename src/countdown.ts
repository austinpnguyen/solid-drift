import { createSignal, onCleanup } from "solid-js";
import { schedule } from "./engine.js";

export interface CountdownOptions {
  /** Milliseconds between recomputes. Default 1000. */
  interval?: number;
  /** Start immediately on creation. Default true. */
  autoStart?: boolean;
  onDone?: () => void;
}

export interface CountdownControls {
  /** Milliseconds remaining, clamped at 0. */
  remaining: () => number;
  days: () => number;
  hours: () => number;
  minutes: () => number;
  seconds: () => number;
  done: () => boolean;
  running: () => boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * createCountdown
 *
 * Countdown to a target date or timestamp. Uses wall-clock time (a sale
 * ends at a real moment even if the tab was hidden) and recomputes on
 * the shared clock, throttled to `interval`. The task stops itself at
 * zero and `onDone` fires exactly once. `stop()` halts display updates;
 * the target is a fixed wall-clock moment, so `start()` resumes against
 * the same target.
 *
 * ```tsx
 * const sale = createCountdown(new Date("2026-12-01T00:00:00"), {
 *   onDone: () => toast("The sale has ended"),
 * });
 * <p>{sale.days()}d {sale.hours()}h {sale.minutes()}m {sale.seconds()}s</p>
 * ```
 */
export function createCountdown(
  target: Date | number | (() => Date | number),
  options: CountdownOptions = {},
): CountdownControls {
  const { interval = 1000, autoStart = true, onDone } = options;
  const [remaining, setRemaining] = createSignal(0);
  const [done, setDone] = createSignal(false);
  const [running, setRunning] = createSignal(false);
  let stopClock: (() => void) | null = null;
  let doneFired = false;

  const targetMs = (): number => {
    const t = typeof target === "function" ? target() : target;
    return t instanceof Date ? t.getTime() : t;
  };

  const compute = (nowMs: number): void => {
    const left = Math.max(0, targetMs() - nowMs);
    setRemaining(left);
    if (left <= 0 && !doneFired) {
      doneFired = true;
      setDone(true);
      stopClock?.();
      stopClock = null;
      setRunning(false);
      onDone?.();
    }
  };

  const start = (): void => {
    if (running()) return;
    doneFired = false;
    setDone(false);
    compute(Date.now());
    if (done()) return;
    if (typeof globalThis.requestAnimationFrame === "undefined") return;
    setRunning(true);
    let last = Date.now();
    stopClock = schedule(() => {
      const nowMs = Date.now();
      if (nowMs - last >= interval) {
        last = nowMs;
        compute(nowMs);
      }
      return !done();
    });
  };

  const stop = (): void => {
    stopClock?.();
    stopClock = null;
    setRunning(false);
  };

  const reset = (): void => {
    stop();
    doneFired = false;
    setDone(false);
    compute(Date.now());
  };

  onCleanup(stop);

  if (autoStart) start();

  return {
    remaining,
    days: () => Math.floor(remaining() / 86_400_000),
    hours: () => Math.floor(remaining() / 3_600_000) % 24,
    minutes: () => Math.floor(remaining() / 60_000) % 60,
    seconds: () => Math.floor(remaining() / 1_000) % 60,
    done,
    running,
    start,
    stop,
    reset,
  };
}
