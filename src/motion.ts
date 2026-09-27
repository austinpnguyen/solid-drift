/**
 * Motion-graphics family: showreel and launch-film primitives.
 *
 * These are the building blocks of code-driven motion design: kinetic
 * typography, scene orchestration, camera moves, time-based color
 * shifts, match-cut transitions, and a beat clock for cutting on the
 * music. Each primitive is small and composable; a showreel is a
 * `createScenePlayer` driving a few of these together, not one mega-API.
 *
 * All primitives are signal-native, SSR-safe, dependency-free, and
 * define sensible static behavior under `prefers-reduced-motion`.
 */

import {
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import { animate, type AnimationControls } from "./animate.js";
import {
  parseColorStops,
  sampleColorStops,
  type ColorFormat,
  type ColorStop,
  type ParsedColorStop,
} from "./color.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { mulberry32, splitUnits } from "./text.js";

type MaybeElement = () => Element | null | undefined;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Round to 2 decimals for style values. */
function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/* ------------------------------------------------------------------ */
/* createKineticType                                                   */
/* ------------------------------------------------------------------ */

export interface KineticTypeFrom {
  /** Vertical offset in px where each unit starts. Default 28. */
  y?: number;
  /** Blur in px where each unit starts. Default 10. */
  blur?: number;
  /** Scale where each unit starts. Default 0.85. */
  scale?: number;
  /** Opacity where each unit starts. Default 0. */
  opacity?: number;
  /** Rotation in degrees where each unit starts. Default 0. */
  rotate?: number;
  /**
   * Per-unit jitter around the `from` values, 0 to 1. Default 0.
   * At 0 every unit shares the exact `from` state; above 0 each unit
   * gets a seeded random offset so the entrance feels hand-set
   * instead of mechanical.
   */
  variance?: number;
  /**
   * Seed for the per-unit jitter. Same seed renders the same jitter
   * on every run. Default 0.
   */
  seed?: number;
}

export interface KineticTypeOptions {
  /** Split into "chars" or "words". Default "chars". */
  unit?: "chars" | "words";
  /** Milliseconds each unit takes to arrive. Default 550. */
  duration?: number;
  /** Milliseconds between unit starts. Default 45. */
  stagger?: number;
  /** Starting transform/opacity/blur for each unit. */
  from?: KineticTypeFrom;
  /** Easing for each unit's arrival. Default "easeOutExpo". */
  easing?: Easing | EasingName;
}

export type KineticTypeStatus = "idle" | "running" | "done";

export interface KineticTypeControls {
  /** Play the reveal. Resolves when the last unit arrives. */
  play: () => Promise<void>;
  /** Stop mid-reveal. The play() promise resolves. */
  stop: () => void;
  /** Stop and play again from the first unit. */
  replay: () => Promise<void>;
  /** Reactive status: "idle" | "running" | "done". */
  status: Accessor<KineticTypeStatus>;
}

function applyKineticStyle(
  el: HTMLElement,
  e: number,
  from: Required<Omit<KineticTypeFrom, "variance" | "seed">>,
): void {
  const t = 1 - e;
  const y = from.y * t;
  const scale = from.scale + (1 - from.scale) * e;
  const rotate = from.rotate * t;
  const blur = from.blur * t;
  const opacity = from.opacity + (1 - from.opacity) * e;
  el.style.transform =
    `translateY(${fmt(y)}px) scale(${fmt(scale)}) rotate(${fmt(rotate)}deg)`;
  el.style.filter = blur > 0.05 ? `blur(${fmt(blur)}px)` : "none";
  el.style.opacity = fmt(opacity);
}

/**
 * Kinetic typography: each character (or word) flies in with position,
 * blur, scale, and opacity, staggered for that showreel title feel.
 *
 * One master clock drives every unit, so a headline with 40 characters
 * costs a single rAF task, not 40 timers. Units animate through the
 * same `from` state with per-unit easing; set `from.variance` above 0
 * for seeded per-unit jitter around those values.
 *
 * SSR-safe: no-op on the server. Under reduced motion every unit jumps
 * to its final state when `play()` runs, so the text is fully readable.
 *
 * ```tsx
 * let title!: HTMLHeadingElement
 * const kinetic = createKineticType(() => title, {
 *   unit: "chars",
 *   stagger: 35,
 *   from: { y: 40, blur: 12, scale: 0.8 },
 *   easing: "easeOutExpo",
 * })
 * onMount(() => kinetic.play())
 * <h1 ref={title}>Showreel</h1>
 * ```
 */
export function createKineticType(
  ref: MaybeElement,
  options: KineticTypeOptions = {},
): KineticTypeControls {
  const {
    unit = "chars",
    duration = 550,
    stagger = 45,
    easing: easingOpt = "easeOutExpo",
  } = options;
  const from: Required<KineticTypeFrom> = {
    y: options.from?.y ?? 28,
    blur: options.from?.blur ?? 10,
    scale: options.from?.scale ?? 0.85,
    opacity: options.from?.opacity ?? 0,
    rotate: options.from?.rotate ?? 0,
    variance: options.from?.variance ?? 0,
    seed: options.from?.seed ?? 0,
  };
  const easing = resolveEasing(easingOpt);

  const [status, setStatus] = createSignal<KineticTypeStatus>("idle");
  let units: HTMLElement[] = [];
  let unitFrom: Required<Omit<KineticTypeFrom, "variance" | "seed">>[] = [];
  let controls: AnimationControls | null = null;
  let runToken = 0;

  const play = (): Promise<void> => {
    const token = ++runToken;
    controls?.stop();
    controls = null;
    units = [];
    unitFrom = [];
    if (typeof window !== "undefined") {
      const el = ref();
      if (el) units = splitUnits(el, unit);
    }
    if (units.length === 0) {
      setStatus("done");
      return Promise.resolve();
    }
    // Seeded per-unit jitter around the `from` values. Deterministic
    // for a given seed, so the same headline renders the same way on
    // every run. Variance 0 keeps the exact legacy behavior.
    const variance = clamp01(from.variance);
    if (variance > 0) {
      const rand = mulberry32(from.seed);
      unitFrom = units.map(() => ({
        y: from.y + variance * (rand() * 2 - 1) * 20,
        blur: Math.max(0, from.blur + variance * (rand() * 2 - 1) * 8),
        scale: from.scale + variance * (rand() * 2 - 1) * 0.15,
        opacity: from.opacity,
        rotate: from.rotate + variance * (rand() * 2 - 1) * 12,
      }));
    } else {
      unitFrom = units.map(() => ({
        y: from.y,
        blur: from.blur,
        scale: from.scale,
        opacity: from.opacity,
        rotate: from.rotate,
      }));
    }
    setStatus("running");
    const total = duration + stagger * (units.length - 1);

    return new Promise<void>((resolve) => {
      // Declared before animate() runs: under reduced motion animate()
      // calls onComplete synchronously, before its return value exists.
      let stepControls: AnimationControls | null = null;
      let completed = false;
      stepControls = animate(0, total, {
        duration: total,
        easing: "linear",
        onUpdate: (elapsed) => {
          for (let i = 0; i < units.length; i++) {
            const local = clamp01((elapsed - i * stagger) / duration);
            applyKineticStyle(units[i], easing(local), unitFrom[i]);
          }
        },
        onComplete: () => {
          completed = true;
          if (token === runToken) {
            controls = null;
            setStatus("done");
          }
          resolve();
        },
      });
      if (!completed) controls = stepControls;
      // `finished` also resolves when the reveal is stopped, which
      // unblocks the play() promise. The token check in onComplete keeps
      // a stale stop from marking a newer run done.
      void stepControls.finished.then(() => {
        if (controls === stepControls) controls = null;
        resolve();
      });
    });
  };

  const stop = () => {
    runToken++;
    controls?.stop();
    controls = null;
    setStatus("idle");
  };

  onCleanup(stop);

  return {
    play,
    stop,
    replay: () => {
      stop();
      return play();
    },
    status,
  };
}

/* ------------------------------------------------------------------ */
/* createScenePlayer                                                   */
/* ------------------------------------------------------------------ */

/** One scene in a showreel: a duration plus enter/exit hooks. */
export interface MotionScene {
  /** How long the scene stays active, in milliseconds. */
  duration: number;
  /** Called when the scene becomes active. */
  onEnter?: (index: number) => void;
  /** Called when the scene ends. */
  onExit?: (index: number) => void;
}

export type ScenePlayerStatus = "idle" | "running" | "paused" | "done";

export interface ScenePlayerControls {
  /** Current scene index, or -1 before the first play(). */
  scene: Accessor<number>;
  /** Reactive status: "idle" | "running" | "paused" | "done". */
  status: Accessor<ScenePlayerStatus>;
  /** Play from the current scene. Resolves after the last scene. */
  play: () => Promise<void>;
  /** Freeze the clock; play() resumes where it left off. */
  pause: () => void;
  /** Halt and reset to before the first scene. */
  stop: () => void;
  /** Stop and play again from the first scene. */
  replay: () => Promise<void>;
  /** Jump to the next scene now. */
  next: () => void;
  /** Jump to the previous scene now. */
  prev: () => void;
  /** Jump to a scene now. */
  goTo: (index: number) => void;
}

/**
 * Scene orchestrator for showreels and launch films: an ordered list of
 * scenes, each with a duration and enter/exit hooks. Think of it as the
 * paused-master-timeline pattern from motion-design tools, expressed as
 * signals: `scene()` tells your view which scene is live, and the hooks
 * trigger each scene's choreography (a `createKineticType`, a camera
 * move, a color shift).
 *
 * SSR-safe: scenes never advance on the server. Under reduced motion
 * `play()` jumps straight to the last scene (the clean final frame)
 * instead of stepping through.
 *
 * ```ts
 * const player = createScenePlayer([
 *   { duration: 1200, onEnter: () => hookTitle.play() },
 *   { duration: 2000, onEnter: () => cameraZoom.play() },
 *   { duration: 1500, onEnter: () => showLogo() }, // final frame
 * ])
 * player.scene() // 0, 1, 2 as the reel plays
 * await player.play()
 * ```
 */
export function createScenePlayer(
  scenes: MotionScene[],
): ScenePlayerControls {
  const [scene, setScene] = createSignal(-1);
  const [status, setStatus] =
    createSignal<ScenePlayerStatus>("idle");

  let cancel: (() => void) | null = null;
  let index = -1;
  let elapsed = 0;
  let lastTick = 0;
  let resolvePlay: (() => void) | null = null;

  const finish = () => {
    cancel?.();
    cancel = null;
    const done = resolvePlay;
    resolvePlay = null;
    done?.();
    setStatus("done");
  };

  const enter = (i: number) => {
    index = i;
    elapsed = 0;
    setScene(i);
    scenes[i].onEnter?.(i);
  };

  const advance = () => {
    const prev = index;
    scenes[prev]?.onExit?.(prev);
    if (prev + 1 >= scenes.length) {
      finish();
    } else {
      enter(prev + 1);
    }
  };

  const tick = (t: number): boolean => {
    const dt = t - lastTick;
    lastTick = t;
    elapsed += dt;
    if (elapsed >= Math.max(scenes[index].duration, 0)) {
      advance();
    }
    return status() === "running";
  };

  const startClock = () => {
    cancel?.();
    lastTick = now();
    cancel = schedule(tick);
  };

  const play = (): Promise<void> => {
    cancel?.();
    cancel = null;
    // A superseded play() must not leave its caller hanging.
    const prev = resolvePlay;
    resolvePlay = null;
    prev?.();
    if (scenes.length === 0) {
      setScene(-1);
      setStatus("done");
      return Promise.resolve();
    }
    if (prefersReducedMotion() || typeof window === "undefined") {
      // Reduced motion / SSR: jump to the clean final frame.
      const last = scenes.length - 1;
      if (index >= 0) scenes[index]?.onExit?.(index);
      enter(last);
      setStatus("done");
      return Promise.resolve();
    }
    const resuming = status() === "paused" && index >= 0 && index < scenes.length;
    if (!resuming) {
      // Fresh start, including after done(): begin at the first scene.
      enter(0);
    }
    setStatus("running");
    startClock();
    return new Promise<void>((resolve) => {
      resolvePlay = resolve;
    });
  };

  const pause = () => {
    if (status() !== "running") return;
    cancel?.();
    cancel = null;
    // Resolve the pending play() promise: the reel is suspended, and the
    // caller must not hang forever waiting for the last scene.
    const done = resolvePlay;
    resolvePlay = null;
    done?.();
    setStatus("paused");
  };

  const stop = () => {
    cancel?.();
    cancel = null;
    if (index >= 0) scenes[index]?.onExit?.(index);
    const done = resolvePlay;
    resolvePlay = null;
    done?.();
    index = -1;
    elapsed = 0;
    setScene(-1);
    setStatus("idle");
  };

  const goTo = (i: number) => {
    if (scenes.length === 0) return;
    const clamped = Math.max(0, Math.min(scenes.length - 1, i));
    const wasRunning = status() === "running";
    if (index >= 0 && index !== clamped) scenes[index]?.onExit?.(index);
    enter(clamped);
    if (wasRunning) {
      setStatus("running");
      startClock();
    }
  };

  onCleanup(stop);

  return {
    scene,
    status,
    play,
    pause,
    stop,
    replay: () => {
      stop();
      return play();
    },
    next: () => goTo(index + 1),
    prev: () => goTo(index - 1),
    goTo,
  };
}

/* ------------------------------------------------------------------ */
/* createCamera                                                        */
/* ------------------------------------------------------------------ */

/** One camera keyframe: pan (x/y in px) and zoom (scale) at a progress. */
export interface CameraKeyframe {
  /** Progress position, 0 to 1. */
  at: number;
  /** Horizontal pan in px. Default 0. */
  x?: number;
  /** Vertical pan in px. Default 0. */
  y?: number;
  /** Zoom factor. Default 1. */
  scale?: number;
  /**
   * Easing for the segment that ends at this keyframe, following the
   * CSS keyframe convention. Default "linear".
   */
  easing?: Easing | EasingName;
}

export interface CameraOptions {
  /** 0-to-1 progress signal driving the camera. */
  progress: Accessor<number>;
  /** Fallback easing for segments without their own. Default "linear". */
  easing?: Easing | EasingName;
}

/**
 * Camera moves for a motion-design stage: pan and zoom driven by a
 * 0-to-1 progress signal, returned as a compositor-friendly transform
 * string (`translate3d(...) scale(...)`).
 *
 * Drive `progress` with anything: a `createScenePlayer` scene's own
 * clock, an `animate()` tween, or scroll. Keyframes sort themselves by
 * `at`; progress outside the range clamps to the end poses.
 *
 * Pure computation, no listeners, no rAF: SSR-safe by construction.
 * Under reduced motion it holds the final keyframe's pose.
 *
 * ```tsx
 * const [p, setP] = createSignal(0)
 * // Slow dolly-in across the scene.
 * const cam = createCamera({
 *   progress: p,
 *   keyframes... // via options below
 * })
 * ```
 */
export function createCamera(
  keyframes: CameraKeyframe[],
  options: CameraOptions,
): Accessor<string> {
  if (keyframes.length === 0) {
    throw new Error("createCamera needs at least one keyframe.");
  }
  const sorted = [...keyframes]
    .sort((a, b) => a.at - b.at)
    .map((k) => ({
      at: k.at,
      x: k.x ?? 0,
      y: k.y ?? 0,
      scale: k.scale ?? 1,
      easing: resolveEasing(k.easing ?? options.easing ?? "linear"),
    }));

  const pose = (p: number): string => {
    const t = clamp01(p);
    let a = sorted[0];
    let b = sorted[sorted.length - 1];
    let local = 0;
    if (t <= sorted[0].at) {
      a = sorted[0];
      b = sorted[0];
    } else if (t >= sorted[sorted.length - 1].at) {
      a = sorted[sorted.length - 1];
      b = sorted[sorted.length - 1];
    } else {
      let i = 0;
      while (i < sorted.length - 2 && sorted[i + 1].at <= t) i++;
      a = sorted[i];
      b = sorted[i + 1];
      const span = b.at - a.at;
      local = span <= 0 ? 0 : b.easing((t - a.at) / span);
    }
    const x = a.x + (b.x - a.x) * local;
    const y = a.y + (b.y - a.y) * local;
    const s = a.scale + (b.scale - a.scale) * local;
    return `translate3d(${fmt(x)}px, ${fmt(y)}px, 0) scale(${fmt(s)})`;
  };

  if (prefersReducedMotion()) {
    const end = pose(1);
    return () => end;
  }

  return () => pose(options.progress());
}

/* ------------------------------------------------------------------ */
/* createColorShift                                                    */
/* ------------------------------------------------------------------ */

export interface ColorShiftOptions {
  /** Milliseconds to travel across all stops. Default 1200. */
  duration?: number;
  /** Delay before starting, in milliseconds. Default 0. */
  delay?: number;
  /** Fallback easing for stop segments without their own. Default "linear". */
  easing?: Easing | EasingName;
  /** Output format. Default "hex". */
  format?: ColorFormat;
}

export type ColorShiftStatus = "idle" | "running" | "done";

export interface ColorShiftControls {
  /** The interpolated color as a string signal. */
  color: Accessor<string>;
  /** Play the shift. Resolves at the final stop. */
  play: () => Promise<void>;
  /** Stop mid-shift. The play() promise resolves. */
  stop: () => void;
  /** Stop and play again from the first stop. */
  replay: () => Promise<void>;
  /** Reactive status: "idle" | "running" | "done". */
  status: Accessor<ColorShiftStatus>;
}

/**
 * Time-based color interpolation across stops: the sibling of
 * `createScrollColor` for motion graphics, where color shifts run on a
 * clock instead of scroll. Colors interpolate in linear light, so
 * midpoints stay vivid, and alpha channels interpolate too.
 *
 * Under reduced motion `play()` jumps straight to the final stop's
 * color. SSR-safe: `color()` returns the final stop's color.
 *
 * ```ts
 * const shift = createColorShift(
 *   [
 *     { at: 0, color: "#0a1220" },
 *     { at: 0.5, color: "#2f8fdd" },
 *     { at: 1, color: "#d9a441", easing: "easeInOutQuad" },
 *   ],
 *   { duration: 2000 },
 * )
 * shift.color() // "#0a1220" ... "#d9a441" as it plays
 * await shift.play()
 * ```
 */
export function createColorShift(
  stops: ColorStop[],
  options: ColorShiftOptions = {},
): ColorShiftControls {
  if (stops.length === 0) {
    throw new Error("createColorShift needs at least one color stop.");
  }
  const {
    duration = 1200,
    delay = 0,
    format = "hex",
  } = options;
  const parsed: ParsedColorStop[] = parseColorStops(stops, options.easing);

  const [progress, setProgress] = createSignal(0);
  const [status, setStatus] = createSignal<ColorShiftStatus>("idle");
  let controls: AnimationControls | null = null;
  let runToken = 0;

  const color = () => sampleColorStops(parsed, progress(), format);

  const play = (): Promise<void> => {
    const token = ++runToken;
    controls?.stop();
    controls = null;
    setProgress(0);
    setStatus("running");
    return new Promise<void>((resolve) => {
      // Declared before animate() runs: under reduced motion animate()
      // calls onComplete synchronously, before its return value exists.
      let shiftControls: AnimationControls | null = null;
      let completed = false;
      shiftControls = animate(0, 1, {
        duration,
        delay,
        easing: "linear",
        onUpdate: (v) => {
          if (token === runToken) setProgress(v);
        },
        onComplete: () => {
          completed = true;
          if (token === runToken) {
            controls = null;
            setStatus("done");
          }
          resolve();
        },
      });
      if (!completed) controls = shiftControls;
      // `finished` also resolves when the shift is stopped, which
      // unblocks the play() promise.
      void shiftControls.finished.then(() => {
        if (controls === shiftControls) controls = null;
        resolve();
      });
    });
  };

  const stop = () => {
    runToken++;
    controls?.stop();
    controls = null;
    setStatus("idle");
  };

  onCleanup(stop);

  return {
    color,
    play,
    stop,
    replay: () => {
      stop();
      return play();
    },
    status,
  };
}

/* ------------------------------------------------------------------ */
/* createTransition                                                    */
/* ------------------------------------------------------------------ */

/** How one scene hands off to the next. */
export type TransitionType = "cut" | "fade" | "slide" | "wipe";
/** Direction for "slide" and "wipe". */
export type TransitionDirection = "left" | "right" | "up" | "down";

export interface TransitionOptions {
  /** Transition style. Default "fade". */
  type?: TransitionType;
  /** Direction for "slide" and "wipe". Default "left". */
  direction?: TransitionDirection;
  /** Duration in milliseconds. Default 500. */
  duration?: number;
  /** Easing. Default "easeInOutCubic". */
  easing?: Easing | EasingName;
}

/** Compositor-friendly style for one side of a transition. */
export interface TransitionLayerStyle {
  opacity: string;
  transform: string;
  clipPath: string;
}

export type TransitionStatus = "idle" | "running" | "done";

export interface TransitionControls {
  /** 0-to-1 progress of the handoff. */
  progress: Accessor<number>;
  /** Style for the outgoing scene's layer. */
  outgoing: Accessor<TransitionLayerStyle>;
  /** Style for the incoming scene's layer. */
  incoming: Accessor<TransitionLayerStyle>;
  /** Play the handoff. Resolves when the incoming scene owns the frame. */
  play: () => Promise<void>;
  /** Stop mid-handoff. The play() promise resolves. */
  stop: () => void;
  /** Stop and play the handoff again. */
  replay: () => Promise<void>;
  /** Reactive status: "idle" | "running" | "done". */
  status: Accessor<TransitionStatus>;
}

function transitionStyles(
  type: TransitionType,
  direction: TransitionDirection,
  p: number,
): { out: TransitionLayerStyle; in: TransitionLayerStyle } {
  const inv = fmt((1 - p) * 100);
  const none: TransitionLayerStyle = {
    opacity: "1",
    transform: "none",
    clipPath: "none",
  };
  if (type === "cut") {
    return p >= 1
      ? {
          out: { ...none, opacity: "0" },
          in: { ...none, opacity: "1" },
        }
      : {
          out: { ...none, opacity: "1" },
          in: { ...none, opacity: "0" },
        };
  }
  if (type === "fade") {
    return {
      out: { ...none, opacity: fmt(1 - p) },
      in: { ...none, opacity: fmt(p) },
    };
  }
  if (type === "slide") {
    const axis = direction === "left" || direction === "right" ? "X" : "Y";
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    return {
      out: {
        ...none,
        transform: `translate${axis}(${fmt(sign * p * 100)}%)`,
      },
      in: {
        ...none,
        transform: `translate${axis}(${fmt(-sign * (1 - p) * 100)}%)`,
        opacity: "1",
      },
    };
  }
  // wipe: the incoming scene reveals over the outgoing one.
  const inset =
    p >= 1
      ? "none"
      : direction === "left"
        ? `inset(0 ${inv}% 0 0)`
        : direction === "right"
          ? `inset(0 0 0 ${inv}%)`
          : direction === "up"
            ? `inset(0 0 ${inv}% 0)`
            : `inset(${inv}% 0 0 0)`;
  return {
    out: { ...none, opacity: "1" },
    in: { ...none, opacity: "1", clipPath: inset },
  };
}

/**
 * Match-cut style scene handoffs: `outgoing()` and `incoming()` return
 * style objects for the two scene layers, driven by one 0-to-1 progress.
 *
 * - "cut": instant swap, no animation.
 * - "fade": crossfade.
 * - "slide": the outgoing scene exits one way while the incoming scene
 *   enters from the opposite side.
 * - "wipe": the incoming scene reveals over the outgoing one with a
 *   clip-path wipe.
 *
 * Everything animates on opacity, transform, or clip-path, so handoffs
 * stay on the compositor. Under reduced motion every type degrades to a
 * cut: the swap happens instantly.
 *
 * ```tsx
 * const cut = createTransition({ type: "wipe", direction: "left", duration: 600 })
 * const go = async () => {
 *   showSceneB()
 *   await cut.play()
 * }
 * <div style={cut.outgoing()}>{sceneA}</div>
 * <div style={cut.incoming()}>{sceneB}</div>
 * ```
 */
export function createTransition(
  options: TransitionOptions = {},
): TransitionControls {
  const {
    type = "fade",
    direction = "left",
    duration = 500,
    easing: easingOpt = "easeInOutCubic",
  } = options;
  const easing = resolveEasing(easingOpt);

  const [raw, setRaw] = createSignal(0);
  const [status, setStatus] = createSignal<TransitionStatus>("idle");
  let controls: AnimationControls | null = null;
  let runToken = 0;

  const progress = () => easing(clamp01(raw()));
  const outgoing = () => transitionStyles(type, direction, progress()).out;
  const incoming = () => transitionStyles(type, direction, progress()).in;

  const play = (): Promise<void> => {
    const token = ++runToken;
    controls?.stop();
    controls = null;
    // Reduced motion (or an explicit cut) degrades to an instant swap.
    if (type === "cut" || prefersReducedMotion()) {
      setRaw(1);
      setStatus("done");
      return Promise.resolve();
    }
    setRaw(0);
    setStatus("running");
    return new Promise<void>((resolve) => {
      // Declared before animate() runs: under reduced motion animate()
      // calls onComplete synchronously, before its return value exists.
      let cutControls: AnimationControls | null = null;
      let completed = false;
      cutControls = animate(0, 1, {
        duration,
        easing: "linear",
        onUpdate: (v) => {
          if (token === runToken) setRaw(v);
        },
        onComplete: () => {
          completed = true;
          if (token === runToken) {
            controls = null;
            setStatus("done");
          }
          resolve();
        },
      });
      if (!completed) controls = cutControls;
      // `finished` also resolves when the handoff is stopped, which
      // unblocks the play() promise.
      void cutControls.finished.then(() => {
        if (controls === cutControls) controls = null;
        resolve();
      });
    });
  };

  const stop = () => {
    runToken++;
    controls?.stop();
    controls = null;
    setStatus("idle");
  };

  onCleanup(stop);

  return {
    progress,
    outgoing,
    incoming,
    play,
    stop,
    replay: () => {
      stop();
      return play();
    },
    status,
  };
}

/* ------------------------------------------------------------------ */
/* createBeat                                                          */
/* ------------------------------------------------------------------ */

export interface BeatOptions {
  /** Beats per minute. Default 120. */
  bpm?: number;
  /** Beats per bar. Default 4. */
  beatsPerBar?: number;
}

export type BeatStatus = "idle" | "running";

export interface BeatControls {
  /** Whole beats elapsed since start(). */
  beat: Accessor<number>;
  /** Whole bars elapsed since start(). */
  bar: Accessor<number>;
  /** Fractional position within the current beat, 0 to 1. */
  phase: Accessor<number>;
  /** Beats per bar, from the options. Used as the default cut interval. */
  beatsPerBar: number;
  /**
   * Register a callback fired on every beat with the beat index.
   * Returns an unsubscribe function.
   */
  onBeat: (cb: (beat: number) => void) => () => void;
  /** Start the clock. No-op if already running. */
  start: () => void;
  /** Stop the clock. */
  stop: () => void;
  /** Reactive status: "idle" | "running". */
  status: Accessor<BeatStatus>;
}

/**
 * A beat clock for cutting on the music: at 120 BPM it ticks twice a
 * second, and `onBeat` fires your scene cuts, kinetic type replays, or
 * color shifts in time. `phase()` gives the fractional position inside
 * the current beat for syncing continuous motion to the rhythm.
 *
 * Beats are timing, not motion, so the clock keeps ticking under
 * reduced motion (your callbacks decide what that means visually).
 * SSR-safe: `start()` is a no-op without requestAnimationFrame.
 *
 * ```ts
 * const beat = createBeat({ bpm: 128 })
 * const off = beat.onBeat((b) => {
 *   if (b % 8 === 0) player.next() // cut scenes every 2 bars
 * })
 * beat.start()
 * ```
 */
export function createBeat(options: BeatOptions = {}): BeatControls {
  const { bpm = 120, beatsPerBar = 4 } = options;
  const msPerBeat = 60000 / Math.max(bpm, 1);
  const perBar = Math.max(1, Math.floor(beatsPerBar));

  const [beat, setBeat] = createSignal(0);
  const [bar, setBar] = createSignal(0);
  const [phase, setPhase] = createSignal(0);
  const [status, setStatus] = createSignal<BeatStatus>("idle");

  const listeners = new Set<(beat: number) => void>();
  let cancel: (() => void) | null = null;
  let t0 = 0;
  let lastBeat = -1;

  const start = () => {
    if (status() === "running") return;
    if (typeof window === "undefined") return;
    t0 = now();
    lastBeat = -1;
    setBeat(0);
    setBar(0);
    setPhase(0);
    setStatus("running");
    cancel = schedule((t) => {
      const floating = (t - t0) / msPerBeat;
      const b = Math.floor(floating);
      if (b !== lastBeat) {
        lastBeat = b;
        setBeat(b);
        setBar(Math.floor(b / perBar));
        for (const cb of listeners) cb(b);
      }
      setPhase(floating - b);
      return status() === "running";
    });
  };

  const stop = () => {
    cancel?.();
    cancel = null;
    setStatus("idle");
  };

  onCleanup(stop);

  return {
    beat,
    bar,
    phase,
    beatsPerBar: perBar,
    onBeat: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    start,
    stop,
    status,
  };
}

/* ------------------------------------------------------------------ */
/* createShowreel                                                      */
/* ------------------------------------------------------------------ */

/** Named role of a showreel scene, for readability. */
export type ShowreelSceneKind =
  | "title"
  | "camera"
  | "color"
  | "cut"
  | "custom";

/**
 * One scene in a guided showreel: a `MotionScene` with an optional
 * named kind describing what the scene does.
 */
export interface ShowreelScene extends MotionScene {
  /**
   * Named kind for readability: "title" for kinetic-type title cards,
   * "camera" for camera-move scenes, "color" for color-shift scenes,
   * "cut" for transition handoffs, "custom" for anything else.
   * Informational only; it does not change playback.
   */
  kind?: ShowreelSceneKind;
}

/**
 * Guided showreel recipe: a thin typed wrapper over
 * `createScenePlayer` for showreels and launch films. Scenes carry a
 * named `kind` so the reel reads like a shot list, and each scene's
 * `onEnter` wires one of the motion-graphics primitives
 * (`createKineticType`, `createCamera`, `createColorShift`,
 * `createTransition`, `createBeat`).
 *
 * Same controls, status values, and reduced-motion behavior as
 * `createScenePlayer`: `play()` jumps to the final frame under reduced
 * motion or on the server.
 *
 * ```ts
 * const reel = createShowreel([
 *   { kind: "title", duration: 1200, onEnter: () => titleCard.play() },
 *   { kind: "camera", duration: 2000, onEnter: () => dolly.play() },
 *   { kind: "color", duration: 1500, onEnter: () => finale.play() },
 * ])
 * beatCuts = createBeatCuts(beat, reel, { every: 8 })
 * await reel.play()
 * ```
 */
export function createShowreel(
  scenes: ShowreelScene[],
): ScenePlayerControls {
  return createScenePlayer(scenes);
}

/* ------------------------------------------------------------------ */
/* createBeatCuts                                                      */
/* ------------------------------------------------------------------ */

export interface BeatCutOptions {
  /**
   * Cut every N beats. Default: the beat clock's `beatsPerBar`, so a
   * cut lands on every downbeat.
   */
  every?: number;
}

/**
 * Beat-synced scene cuts: advance the player every N beats through
 * the beat clock's `onBeat`. Returns a cleanup function that
 * unsubscribes the cut listener.
 *
 * Cuts only fire while the player is running, so pausing the reel
 * pauses the cuts too.
 *
 * ```ts
 * const beat = createBeat({ bpm: 128, beatsPerBar: 4 })
 * const stopCuts = createBeatCuts(beat, player) // cut every bar
 * beat.start()
 * await player.play()
 * stopCuts()
 * ```
 */
export function createBeatCuts(
  beat: BeatControls,
  player: Pick<ScenePlayerControls, "next" | "status">,
  options: BeatCutOptions = {},
): () => void {
  const every = Math.max(1, Math.floor(options.every ?? beat.beatsPerBar));
  return beat.onBeat((b) => {
    if (b % every === 0 && player.status() === "running") {
      player.next();
    }
  });
}
