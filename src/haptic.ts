import { createSignal, onCleanup, type Accessor } from "solid-js";
import { now, schedule } from "./engine.js";

export type HapticPattern = number | number[];

export interface HapticOptions {
  /**
   * Master switch. Accepts a plain boolean or a signal, so it can be
   * wired to `useLowPowerMode()`. Default true.
   */
  enabled?: Accessor<boolean> | boolean;
}

export interface HapticControls {
  /** True when the device can vibrate and haptics are enabled. */
  supported: Accessor<boolean>;
  /** Fire a raw vibration pattern (ms). No-op when unsupported. */
  vibrate: (pattern: HapticPattern) => void;
  /** Short tap. */
  light: () => void;
  /** Firmer tap. */
  medium: () => void;
  /** Strong tap. */
  heavy: () => void;
  /** Rising two-tap confirmation. */
  success: () => void;
  /** Double low tap. */
  warning: () => void;
  /** Triple strong tap. */
  error: () => void;
  /**
   * Vibrate morse code: "." dot, "-" dash, " " letter gap, "/" word
   * gap. `unit` is the dot length in ms (default 60).
   */
  morse: (code: string, unit?: number) => void;
}

/**
 * One-shot vibration presets, in milliseconds. Pass any of these to
 * `vibrate`, or use the named helpers on the controls.
 */
export const hapticPatterns: Record<string, HapticPattern> = {
  tap: 10,
  doubleTap: [15, 50, 15],
  longPress: 60,
  tick: 8,
  heartbeat: [25, 150, 40],
  success: [10, 40, 25],
  warning: [30, 50, 30],
  error: [50, 50, 50, 50, 80],
};

/**
 * Tactile feedback through the Vibration API (`navigator.vibrate`).
 * Buttons, toggles, and confirmations get a physical click; the
 * presets mirror the iOS haptic vocabulary (light/medium/heavy,
 * success/warning/error) using vibration timing.
 *
 * Haptics are tactile, not visual, so they still fire under reduced
 * motion. Gate them with `enabled` (a boolean or a signal) when the
 * user asks for quiet, e.g. wired to `useLowPowerMode()`.
 *
 * SSR-safe and unsupported-device safe: everything is a no-op and
 * `supported()` is false.
 *
 * ```tsx
 * const haptic = createHaptic()
 * <button onClick={() => { haptic.light(); confirm() }}>Confirm</button>
 * <button onClick={() => haptic.morse("... --- ...")}>SOS</button>
 * ```
 */
export function createHaptic(options: HapticOptions = {}): HapticControls {
  const enabled: Accessor<boolean> =
    typeof options.enabled === "function"
      ? options.enabled
      : () => options.enabled !== false;

  const canVibrate =
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function";

  const supported = (): boolean => canVibrate && enabled();

  const vibrate = (pattern: HapticPattern): void => {
    if (!supported()) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Haptics are best-effort: never crash the interaction.
    }
  };

  const morse = (code: string, unit = 60): void => {
    const u = Math.max(1, Math.round(unit));
    const pattern: number[] = [];
    for (const ch of code) {
      if (ch === ".") {
        pattern.push(u, u);
      } else if (ch === "-") {
        pattern.push(3 * u, u);
      } else if (ch === " " || ch === "/") {
        // Extend the trailing pause: a letter gap is 3 units total, a
        // word gap 7, and one unit is already there after each element.
        const last = pattern.length - 1;
        if (last >= 0) pattern[last] += ch === " " ? 2 * u : 6 * u;
      }
    }
    // Drop the trailing pause: nothing to separate after the last element.
    if (pattern.length % 2 === 0) pattern.pop();
    if (pattern.length > 0) vibrate(pattern);
  };

  return {
    supported,
    vibrate,
    light: () => vibrate(hapticPatterns.tap),
    medium: () => vibrate(20),
    heavy: () => vibrate(30),
    success: () => vibrate(hapticPatterns.success),
    warning: () => vibrate(hapticPatterns.warning),
    error: () => vibrate(hapticPatterns.error),
    morse,
  };
}

/* ------------------------------------------------------------------ */
/* createHapticBeat                                                     */
/* ------------------------------------------------------------------ */

/**
 * 16-step haptic sequencer presets. "x" is a hit, "X" an accent, and
 * anything else a rest.
 */
export const hapticBeatPresets: Record<string, string> = {
  /** Lub-dub heartbeat. */
  heartbeat: "X.......x.......",
  /** Four-on-the-floor metronome. */
  metronome: "X...x...x...x...",
  /** Steady eighth-note ticks. */
  ticks: "x.x.x.x.x.x.x.x.",
  /** One pulse per bar. */
  pulse: "X...............",
};

export interface HapticBeatOptions {
  /** Beats per minute (quarter notes). Default 60. */
  bpm?: number;
  /**
   * 16-step pattern string: "x" hit, "X" accent, anything else rest.
   * Shorter strings are padded with rests, longer ones are cut.
   * Default is the heartbeat preset.
   */
  pattern?: string;
  /** Vibration ms for a normal step. Default 12. */
  stepMs?: number;
  /** Vibration ms for an accent step. Default 30. */
  accentMs?: number;
  /** Start immediately. Default false. */
  autostart?: boolean;
  /** Called on every step with its index (0-15). */
  onStep?: (step: number) => void;
}

export interface HapticBeatControls {
  /** Whether the sequencer is running. */
  playing: Accessor<boolean>;
  /** Current tempo. Change it live with setBpm. */
  bpm: Accessor<number>;
  /** Current step index (0-15), or -1 when stopped. */
  step: Accessor<number>;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  setBpm: (bpm: number) => void;
}

function parseSteps(pattern: string): Array<0 | 1 | 2> {
  const steps: Array<0 | 1 | 2> = [];
  for (let i = 0; i < 16; i++) {
    const ch = pattern[i];
    steps.push(ch === "X" ? 2 : ch === "x" ? 1 : 0);
  }
  return steps;
}

/**
 * A 16-step haptic sequencer on the shared animation clock: heartbeat
 * pulses, metronome ticks, breathing guides, game countdowns. The
 * steps run as 16th notes at `bpm`, so a 60 BPM heartbeat preset
 * pulses once per second with the accent on the downbeat.
 *
 * Takes the haptic controls from `createHaptic` (so one `enabled`
 * switch gates everything) and drives `vibrate` per step. Tempo
 * changes apply live. SSR-safe: `start()` is a no-op on the server.
 *
 * ```tsx
 * const haptic = createHaptic()
 * const beat = createHapticBeat(haptic, {
 *   bpm: 60,
 *   pattern: hapticBeatPresets.heartbeat,
 *   onStep: (i) => setFlash(i === 0),
 * })
 * <button onClick={() => beat.toggle()}>
 *   {beat.playing() ? "Stop pulse" : "Start pulse"}
 * </button>
 * ```
 */
export function createHapticBeat(
  haptic: Pick<HapticControls, "vibrate">,
  options: HapticBeatOptions = {},
): HapticBeatControls {
  const {
    bpm: initialBpm = 60,
    pattern = hapticBeatPresets.heartbeat,
    stepMs = 12,
    accentMs = 30,
    autostart = false,
    onStep,
  } = options;
  const steps = parseSteps(pattern);

  const [playing, setPlaying] = createSignal(false);
  const [bpm, setBpm] = createSignal(Math.max(1, initialBpm));
  const [step, setStep] = createSignal(-1);
  let cancel: (() => void) | null = null;

  const stepDuration = (): number => 60000 / bpm() / 4;

  const fire = (index: number): void => {
    setStep(index);
    const kind = steps[index];
    if (kind === 2) haptic.vibrate(accentMs);
    else if (kind === 1) haptic.vibrate(stepMs);
    onStep?.(index);
  };

  const start = (): void => {
    if (typeof window === "undefined") return; // SSR: no-op
    if (playing()) return;
    setPlaying(true);
    let index = 0;
    fire(0); // no latency: the downbeat lands immediately
    let nextTime = now() + stepDuration();
    cancel = schedule((t) => {
      if (!playing()) return false;
      const dur = stepDuration();
      while (t >= nextTime) {
        index = (index + 1) % 16;
        fire(index);
        nextTime += dur;
        if (nextTime < t - 250) {
          // Long main-thread stall: skip ahead instead of
          // machine-gunning the missed steps.
          nextTime = t + dur;
          break;
        }
      }
      return true;
    });
  };

  const stop = (): void => {
    if (!playing()) return;
    setPlaying(false);
    setStep(-1);
    cancel?.();
    cancel = null;
  };

  onCleanup(stop);

  if (autostart) start();

  return {
    playing,
    bpm,
    step,
    start,
    stop,
    toggle: () => (playing() ? stop() : start()),
    setBpm: (next: number) => setBpm(Math.max(1, next)),
  };
}
