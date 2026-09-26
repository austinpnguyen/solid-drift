import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { createSpring, type SpringOptions } from "./spring.js";
import { createTrail } from "./trail.js";
import {
  animate,
  type AnimateOptions,
  type AnimationControls,
} from "./animate.js";
import { type Easing, type EasingName } from "./easing.js";

export interface SquashStretchOptions {
  /**
   * The motion to deform around: a single signal (horizontal motion in
   * its own units) or an `{ x, y }` pair for two-dimensional motion.
   */
  source: Accessor<number> | { x: Accessor<number>; y: Accessor<number> };
  /** Peak stretch scale at full speed. Default 1.3. */
  maxStretch?: number;
  /** Deepest squash scale on a hard stop. Default 0.7. */
  maxSquash?: number;
  /** Speed (units per second) that maps to full stretch. Default 2400. */
  fullSpeed?: number;
  /**
   * How much the cross axis compensates the stretch, 0 to 1.
   * 1 keeps the volume constant, 0 leaves the cross axis alone.
   * Default 0.8.
   */
  preserveVolume?: number;
  /**
   * Deceleration (units per second squared) that counts as an impact
   * and triggers the squash. Default 9000.
   */
  impactThreshold?: number;
  /**
   * Spring smoothing for the deform. Defaults to a snappy spring with
   * a little bounce, so arrivals feel jelly.
   */
  spring?: SpringOptions;
}

export interface SquashStretchResult {
  /** Scale along the dominant motion axis. */
  scaleX: Accessor<number>;
  /** Scale along the cross axis. */
  scaleY: Accessor<number>;
}

type ScalableElement = {
  style?: { setProperty?: (name: string, value: string) => void };
};

/**
 * Cartoon squash and stretch driven by a motion signal.
 *
 * The element stretches along its direction of travel as it speeds up
 * (with the cross axis shrinking to preserve volume, like a water
 * balloon in flight) and squashes flat for a beat when it stops hard,
 * exactly the way a cartoon character pancakes on landing. The deform
 * is applied through the CSS `scale` property, so it composes with any
 * `transform` you set yourself, and the smoothed `scaleX`/`scaleY`
 * accessors are returned for custom composition.
 *
 * SSR-safe and reduced-motion safe: no deform is applied and both
 * accessors return constant `1`.
 *
 * ```tsx
 * let ball!: HTMLDivElement
 * const [target, setTarget] = createSignal(0)
 * const x = createSpring(target, { stiffness: 120, damping: 14 })
 * createSquashStretch(() => ball, { source: x })
 * <div ref={ball} style={{ transform: `translateX(${x()}px)` }} />
 * setTarget(400) // the ball stretches mid-flight, squashes on arrival
 * ```
 */
export function createSquashStretch(
  ref: () => Element | null | undefined,
  options: SquashStretchOptions,
): SquashStretchResult {
  const {
    source,
    maxStretch = 1.3,
    maxSquash = 0.7,
    fullSpeed = 2400,
    preserveVolume = 0.8,
    impactThreshold = 9000,
    spring = { stiffness: 260, damping: 16 },
  } = options;

  if (typeof window === "undefined" || prefersReducedMotion()) {
    const one = () => 1;
    return { scaleX: one, scaleY: one };
  }

  const readX: Accessor<number> =
    typeof source === "function" ? source : source.x;
  const readY: Accessor<number> | null =
    typeof source === "function" ? null : source.y;

  const [targetSX, setTargetSX] = createSignal(1);
  const [targetSY, setTargetSY] = createSignal(1);
  const scaleX = createSpring(targetSX, spring);
  const scaleY = createSpring(targetSY, spring);

  // Apply the deform through the CSS `scale` property so it composes
  // with whatever `transform` the user sets on the element.
  createEffect(() => {
    const el = ref() as unknown as ScalableElement | null | undefined;
    el?.style?.setProperty?.(
      "scale",
      `${scaleX().toFixed(4)} ${scaleY().toFixed(4)}`,
    );
  });

  let cancel: (() => void) | null = null;
  let lastT = 0;
  let lastX = untrack(readX);
  let lastY = readY ? untrack(readY) : 0;
  let vx = 0;
  let vy = 0;
  let prevSpeed = 0;
  let impact = 0;

  const loop = (t: number): boolean => {
    const dt = Math.min(Math.max((t - lastT) / 1000, 0.0001), 0.064);
    lastT = t;

    const x = untrack(readX);
    const y = readY ? untrack(readY) : 0;
    // Exponential smoothing keeps the velocity estimate stable across
    // uneven frame times without lagging behind real motion.
    const blend = 1 - Math.exp(-dt * 18);
    vx += ((x - lastX) / dt - vx) * blend;
    vy += ((y - lastY) / dt - vy) * blend;
    lastX = x;
    lastY = y;

    const speed = Math.hypot(vx, vy);
    const decel = (prevSpeed - speed) / dt;
    if (prevSpeed > fullSpeed * 0.2 && decel > impactThreshold) impact = 1;
    prevSpeed = speed;
    impact = Math.max(0, impact - dt * 3.5);

    const speedNorm = Math.min(speed / fullSpeed, 1);
    const stretch = speedNorm * (maxStretch - 1);
    const squash = impact * (1 - maxSquash);
    // On impact the stretch collapses and the squash takes over: pancake.
    const along = 1 + stretch * (1 - impact) - squash;
    const cross =
      1 - stretch * (1 - impact) * preserveVolume + squash * preserveVolume;

    if (Math.abs(vx) >= Math.abs(vy)) {
      setTargetSX(along);
      setTargetSY(cross);
    } else {
      setTargetSX(cross);
      setTargetSY(along);
    }

    const idle =
      speed < 1 &&
      impact <= 0 &&
      Math.abs(untrack(scaleX) - 1) < 0.002 &&
      Math.abs(untrack(scaleY) - 1) < 0.002;
    if (idle) {
      setTargetSX(1);
      setTargetSY(1);
      cancel = null;
      return false;
    }
    return true;
  };

  const kick = () => {
    if (cancel) return;
    // Re-seed from the live values so a stale sample never reads as a
    // phantom burst of speed on the first frame.
    lastT = now();
    lastX = untrack(readX);
    lastY = readY ? untrack(readY) : 0;
    vx = 0;
    vy = 0;
    prevSpeed = 0;
    cancel = schedule(loop);
  };

  createEffect(() => {
    readX();
    readY?.();
    kick();
  });

  onCleanup(() => cancel?.());

  return { scaleX, scaleY };
}

export interface FollowThroughOptions {
  /** Number of followers chained behind the leader. Default 3. */
  links?: number;
  /** Extra lag added per link, in milliseconds. Default 70. */
  delayPerLink?: number;
  /**
   * Spring physics per link. A single config applies to every link;
   * an array configures each link (shorter arrays reuse the last entry).
   * Defaults to a loose spring with visible overshoot.
   */
  spring?: SpringOptions | SpringOptions[];
}

/**
 * Follow-through and overlapping action: a chain of followers that lag
 * behind a leader signal, then catch up with an overshoot.
 *
 * This is the Tom and Jerry shadow: the leader darts away, each follower
 * stays behind for a beat, then runs after it and overshoots before
 * settling. Chain the returned accessors to trailing elements (a comet
 * tail, a drag ghost, cascading highlights) and the whole chain ripples
 * with one signal change.
 *
 * Each link trails the previous link's output and then springs toward it
 * with a loose spring, so the lag compounds down the chain. Under
 * reduced motion (or on the server) every follower returns the source
 * itself: no lag, no overshoot.
 *
 * ```tsx
 * const [tab, setTab] = createSignal(0)
 * const x = createSpring(tab, { stiffness: 200, damping: 26 })
 * // Three ghosts chase the tab indicator with cartoon lag.
 * const [g1, g2, g3] = createFollowThrough(x, { links: 3 })
 * ```
 */
export function createFollowThrough(
  source: Accessor<number>,
  options: FollowThroughOptions = {},
): Accessor<number>[] {
  const { links = 3, delayPerLink = 70 } = options;

  if (typeof window === "undefined" || prefersReducedMotion() || links <= 0) {
    return Array.from({ length: Math.max(links, 0) }, () => source);
  }

  const springFor = (i: number): SpringOptions => {
    const s = options.spring;
    if (Array.isArray(s)) return s[Math.min(i, s.length - 1)] ?? {};
    return s ?? { stiffness: 170, damping: 11 };
  };

  const followers: Accessor<number>[] = [];
  let prev: Accessor<number> = source;
  for (let i = 0; i < links; i++) {
    const lagged = createTrail(prev, { delay: delayPerLink });
    const springy = createSpring(lagged, springFor(i));
    followers.push(springy);
    prev = springy;
  }
  return followers;
}

export interface AnticipationOptions {
  /**
   * Windup distance in the animation's units, applied opposite to the
   * direction of travel. Default: 10% of the travel distance.
   */
  windup?: number;
  /** Windup duration in milliseconds. Default 140. */
  windupDuration?: number;
  /** Hold at full windup before firing, in milliseconds. Default 50. */
  holdDuration?: number;
  /** Easing for the windup move. Default "easeInQuad". */
  windupEasing?: Easing | EasingName;
}

/**
 * Anticipation: wind up in the opposite direction before the main
 * motion fires.
 *
 * A composable wrapper around `animate()`: it plays a short windup
 * (from `from` to slightly before `from`), holds for a beat, then runs
 * the main animation to `to` with all of `animate()`'s options. The
 * windup sells the weight of what follows, a crouch before the jump,
 * a pull-back before the punch.
 *
 * Returns `AnimationControls` just like `animate()`: `stop()` halts
 * mid-windup or mid-flight, `finished` resolves either way. Under
 * reduced motion the windup is skipped and it behaves exactly like
 * `animate(from, to, options)`.
 *
 * ```ts
 * // The button crouches 12px, holds, then springs 200px right.
 * const ctl = createAnticipation(0, 200, {
 *   windup: 12,
 *   windupDuration: 120,
 *   duration: 450,
 *   easing: "easeOutBack",
 *   onUpdate: (v) => (el.style.transform = `translateX(${v}px)`),
 * })
 * await ctl.finished
 * ```
 */
export function createAnticipation(
  from: number,
  to: number,
  options: AnticipationOptions & AnimateOptions = {},
): AnimationControls {
  const {
    windup,
    windupDuration = 140,
    holdDuration = 50,
    windupEasing = "easeInQuad",
    ...main
  } = options;

  if (prefersReducedMotion()) {
    return animate(from, to, main);
  }

  const distance = to - from;
  const windupAmount = windup ?? Math.abs(distance) * 0.1;
  const windupTarget =
    from - Math.sign(distance === 0 ? 1 : distance) * windupAmount;

  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  let done = false;
  let stopCurrent: () => void = () => {};

  const finish = (completed: boolean) => {
    if (done) return;
    done = true;
    if (completed) main.onComplete?.();
    resolveFinished();
  };

  const playMain = () => {
    stopCurrent = animate(windupTarget, to, {
      ...main,
      onComplete: () => finish(true),
    }).stop;
  };

  stopCurrent = animate(from, windupTarget, {
    duration: windupDuration,
    easing: windupEasing,
    onUpdate: main.onUpdate,
    onComplete: () => {
      if (done) return;
      if (holdDuration > 0) {
        // Hold at full windup on the shared clock: no setTimeout, so
        // the pause stays in sync with the animation engine.
        const startAt = now() + holdDuration;
        const cancelHold = schedule((t: number): boolean => {
          if (t < startAt) return true;
          if (!done) playMain();
          return false;
        });
        const stopWindup = stopCurrent;
        stopCurrent = () => {
          cancelHold();
          stopWindup();
        };
      } else {
        playMain();
      }
    },
  }).stop;

  return {
    stop: () => {
      stopCurrent();
      finish(false);
    },
    finished,
  };
}

export interface WobbleOptions {
  /** Peak rotation in degrees. Default 7. */
  rotation?: number;
  /** Peak scale deviation, 0.08 is 8%. Default 0.08. */
  scale?: number;
  /** Oscillation frequency in Hertz. Default 5. */
  frequency?: number;
  /** Decay time constant in seconds: smaller dies faster. Default 0.45. */
  decay?: number;
}

export interface WobbleResult {
  /** Rotation in degrees, a decaying oscillation around 0. */
  rotate: Accessor<number>;
  /** Horizontal scale, oscillating around 1. */
  scaleX: Accessor<number>;
  /** Vertical scale, oscillating around 1 in counter-phase. */
  scaleY: Accessor<number>;
  /**
   * Trigger a wobble. Strength scales the initial kick and may be
   * negative to wobble the other way. Default 1.
   */
  wobble: (strength?: number) => void;
}

/**
 * Jelly wobble: a decaying rotational and scale oscillation after a
 * disturbance, like poking a bowl of jelly.
 *
 * Call `wobble()` to kick it (or poke the element directly when a `ref`
 * is given: pointerdown on the element triggers a wobble). Rotation and
 * scale oscillate in counter-phase inside an exponential envelope, then
 * park exactly at rest. Re-triggering mid-wobble restarts the kick.
 *
 * SSR-safe and reduced-motion safe: `wobble()` is a no-op and the
 * accessors rest at 0, 1, 1.
 *
 * ```tsx
 * let jelly!: HTMLDivElement
 * const { rotate, scaleX, scaleY, wobble } = createWobble(() => jelly)
 * <div
 *   ref={jelly}
 *   onClick={() => wobble()}
 *   style={{
 *     transform: `rotate(${rotate()}deg) scale(${scaleX()}, ${scaleY()})`,
 *   }}
 * />
 * ```
 */
export function createWobble(
  ref?: () => Element | null | undefined,
  options: WobbleOptions = {},
): WobbleResult {
  const { rotation = 7, scale = 0.08, frequency = 5, decay = 0.45 } = options;

  if (typeof window === "undefined" || prefersReducedMotion()) {
    return {
      rotate: () => 0,
      scaleX: () => 1,
      scaleY: () => 1,
      wobble: () => {},
    };
  }

  const [rotate, setRotate] = createSignal(0);
  const [scaleX, setScaleX] = createSignal(1);
  const [scaleY, setScaleY] = createSignal(1);

  let cancel: (() => void) | null = null;
  let startT = 0;
  let strength = 0;

  const loop = (t: number): boolean => {
    const elapsed = (t - startT) / 1000;
    const envelope = Math.exp(-elapsed / decay) * strength;
    if (Math.abs(envelope) < 0.001) {
      setRotate(0);
      setScaleX(1);
      setScaleY(1);
      cancel = null;
      return false;
    }
    const phase = 2 * Math.PI * frequency * elapsed;
    const swing = Math.sin(phase) * envelope;
    setRotate(rotation * swing);
    // Counter-phase scale on the two axes reads as jelly, not a spin.
    setScaleX(1 + scale * swing);
    setScaleY(1 - scale * swing);
    return true;
  };

  const wobble = (s = 1) => {
    if (s === 0) return;
    strength = s;
    startT = now();
    if (!cancel) cancel = schedule(loop);
  };

  if (ref) {
    const onDown = () => wobble(1);
    createEffect(() => {
      const el = ref();
      if (!el) return;
      el.addEventListener("pointerdown", onDown);
      onCleanup(() => el.removeEventListener("pointerdown", onDown));
    });
  }

  onCleanup(() => cancel?.());

  return { rotate, scaleX, scaleY, wobble };
}
