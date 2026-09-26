import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";

/** Element.addEventListener's type map omits pointer events in newer TS DOM libs. */
const toListener = (fn: (e: PointerEvent) => void): EventListener =>
  fn as unknown as EventListener;

export interface GravityOptions {
  /** Drop height in pixels above the floor. Default 240. */
  from?: number;
  /** Floor position in pixels: the y value the body rests at. Default 0. */
  floor?: number;
  /** Gravity in pixels per second squared. Default 2600. */
  gravity?: number;
  /** Bounciness (restitution) on each impact, 0 to 1. Default 0.55. */
  bounciness?: number;
  /** Horizontal velocity kept through each bounce, 0 to 1. Default 0.9. */
  bounceFriction?: number;
  /** Initial horizontal velocity in pixels per second. Default 0. */
  velocityX?: number;
  /** Speed below which an impact becomes a rest, in px/s. Default 40. */
  restThreshold?: number;
  /** Called once the body comes to rest. */
  onRest?: () => void;
}

export interface GravityResult {
  /** Horizontal position in pixels. */
  x: Accessor<number>;
  /** Vertical position in pixels, resting at `floor`. */
  y: Accessor<number>;
  /** True while falling or bouncing. */
  moving: Accessor<boolean>;
  /** Drop again, optionally from a new height. */
  drop: (from?: number) => void;
}

/**
 * Cartoon gravity: drop a body, watch it fall with acceleration, bounce
 * with restitution, and settle on the floor.
 *
 * The simulation runs on the shared clock with semi-implicit Euler
 * integration. Each floor impact reflects the vertical velocity scaled
 * by `bounciness` and scrubs horizontal velocity by `bounceFriction`;
 * when an impact arrives slower than `restThreshold` the body parks
 * exactly on the floor. `drop()` replays the drop, so it pairs well
 * with `createInView`: drop the anvil every time it scrolls into view.
 *
 * SSR-safe and reduced-motion safe: the body simply rests on the floor
 * and `drop()` is a no-op.
 *
 * ```tsx
 * const { x, y, moving, drop } = createGravity({ from: 300, bounciness: 0.6 })
 * <div style={{ transform: `translate(${x()}px, ${y()}px)` }} />
 * <button onClick={() => drop()}>Again!</button>
 * ```
 */
export function createGravity(options: GravityOptions = {}): GravityResult {
  const {
    from = 240,
    floor = 0,
    gravity = 2600,
    bounciness = 0.55,
    bounceFriction = 0.9,
    velocityX = 0,
    restThreshold = 40,
    onRest,
  } = options;

  if (typeof window === "undefined" || prefersReducedMotion()) {
    const [x] = createSignal(0);
    const [y] = createSignal(floor);
    const [moving] = createSignal(false);
    return { x, y, moving, drop: () => {} };
  }

  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(floor - from);
  const [moving, setMoving] = createSignal(false);

  let vx = 0;
  let vy = 0;
  let height = from;
  let cancel: (() => void) | null = null;
  let lastT = 0;

  const loop = (t: number): boolean => {
    const dt = Math.min(Math.max((t - lastT) / 1000, 0), 0.064);
    lastT = t;

    vy += gravity * dt;
    let nx = untrack(x) + vx * dt;
    let ny = untrack(y) + vy * dt;

    if (ny >= floor) {
      ny = floor;
      if (Math.abs(vy) > restThreshold) {
        vy = -vy * bounciness;
        vx *= bounceFriction;
      } else {
        vy = 0;
      }
    }

    setX(nx);
    setY(ny);

    if (ny >= floor && vy === 0 && Math.abs(vx) < restThreshold) {
      setMoving(false);
      cancel = null;
      onRest?.();
      return false;
    }
    return true;
  };

  const drop = (nextFrom?: number) => {
    if (nextFrom !== undefined) height = nextFrom;
    vx = velocityX;
    vy = 0;
    setX(0);
    setY(floor - height);
    setMoving(true);
    if (!cancel) {
      lastT = now();
      cancel = schedule(loop);
    }
  };

  drop();
  onCleanup(() => cancel?.());

  return { x, y, moving, drop };
}

export interface PendulumOptions {
  /** String length in pixels, pivot to bob. Default 160. */
  length?: number;
  /** Release angle in degrees. Default 32. */
  amplitude?: number;
  /** Damping coefficient per second. Default 0.25, a long gentle decay. */
  damping?: number;
  /** Gravity in pixels per second squared. Default 2600. */
  gravity?: number;
}

export interface PendulumResult {
  /** Swing angle in degrees, 0 is hanging straight down. */
  angle: Accessor<number>;
  /** Bob offset from its rest position in pixels. */
  x: Accessor<number>;
  /** Bob offset from its rest position in pixels. */
  y: Accessor<number>;
  /** Release the pendulum from an angle in degrees. */
  swing: (amplitude?: number) => void;
}

/**
 * A pendulum that swings with real physics and a draggable amplitude.
 *
 * Integrates the pendulum equation (theta'' = -(g/L) sin theta - c theta')
 * on the shared clock, so the period comes from `length` and `gravity`
 * instead of a hand-tuned duration: long strings swing slow, short
 * strings swing fast, exactly like the playground. The amplitude decays
 * through `damping` until the bob hangs still.
 *
 * Grab the element and pull it aside to set the amplitude yourself:
 * while dragging, the bob follows the pointer around its pivot (the
 * pivot sits `length` pixels above the element's top center); release
 * and it swings from exactly where you left it.
 *
 * SSR-safe and reduced-motion safe: the bob hangs at rest and `swing()`
 * is a no-op.
 *
 * ```tsx
 * let bob!: HTMLDivElement
 * const { angle } = createPendulum(() => bob, { length: 200 })
 * // The bob hangs from an invisible string 200px above it.
 * <div ref={bob} style={{ transform: `rotate(${angle()}deg)`, "transform-origin": "50% -200px" }} />
 * ```
 */
export function createPendulum(
  ref: () => Element | null | undefined,
  options: PendulumOptions = {},
): PendulumResult {
  const {
    length = 160,
    amplitude = 32,
    damping = 0.25,
    gravity = 2600,
  } = options;

  if (typeof window === "undefined" || prefersReducedMotion()) {
    const zero = () => 0;
    return { angle: zero, x: zero, y: zero, swing: () => {} };
  }

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [angle, setAngle] = createSignal(0);
  const x: Accessor<number> = () => length * Math.sin(toRad(angle()));
  const y: Accessor<number> = () => length * (1 - Math.cos(toRad(angle())));

  let theta = 0;
  let omega = 0;
  let dragging = false;
  let cancel: (() => void) | null = null;
  let lastT = 0;

  const loop = (t: number): boolean => {
    const dt = Math.min(Math.max((t - lastT) / 1000, 0), 0.064);
    lastT = t;
    const alpha = -(gravity / length) * Math.sin(theta) - damping * omega;
    omega += alpha * dt;
    theta += omega * dt;
    setAngle((theta * 180) / Math.PI);
    if (Math.abs(theta) < 0.0005 && Math.abs(omega) < 0.005) {
      theta = 0;
      omega = 0;
      setAngle(0);
      cancel = null;
      return false;
    }
    return true;
  };

  const kick = () => {
    if (cancel || dragging) return;
    lastT = now();
    cancel = schedule(loop);
  };

  const swing = (amp: number = amplitude) => {
    theta = toRad(amp);
    omega = 0;
    setAngle(amp);
    kick();
  };

  const onDown = (event: PointerEvent) => {
    const el = ref();
    if (!el) return;
    dragging = true;
    cancel?.();
    cancel = null;
    const rect = el.getBoundingClientRect();
    const pivotX = rect.left + rect.width / 2;
    const pivotY = rect.top - length;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - pivotX;
      // Clamp below the pivot so the angle stays well-defined.
      const dy = Math.max(ev.clientY - pivotY, 8);
      theta = Math.atan2(dx, dy);
      omega = 0;
      setAngle((theta * 180) / Math.PI);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      dragging = false;
      kick();
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    move(event);
    event.preventDefault();
  };

  createEffect(() => {
    const el = ref();
    if (!el) return;
    el.addEventListener("pointerdown", toListener(onDown));
    onCleanup(() => el.removeEventListener("pointerdown", toListener(onDown)));
  });

  onCleanup(() => cancel?.());

  swing();

  return { angle, x, y, swing };
}

export interface FlingOptions {
  /**
   * Element to bounce inside; defaults to the viewport. Bounds are
   * measured when the throw starts.
   */
  bounds?: () => Element | null | undefined;
  /**
   * Exponential velocity decay per second of free flight: higher values
   * stop the fling sooner. Default 1.4.
   */
  friction?: number;
  /** Bounciness on the edges, 0 to 1. Default 0.7. */
  bounciness?: number;
  /** Speed in px/s below which the body stops. Default 12. */
  restThreshold?: number;
}

export interface FlingResult {
  /** Horizontal offset in pixels from the layout position. */
  x: Accessor<number>;
  /** Vertical offset in pixels from the layout position. */
  y: Accessor<number>;
  /** Current horizontal velocity in px/s. */
  vx: Accessor<number>;
  /** Current vertical velocity in px/s. */
  vy: Accessor<number>;
  /** True while gliding after a throw. */
  moving: Accessor<boolean>;
  /** Stop dead wherever it is. */
  stop: () => void;
}

/**
 * Grab it, throw it: fling physics with momentum and edge bounce.
 *
 * Pointer down grabs the element and it follows the pointer; release
 * and it keeps the release velocity, gliding with exponential friction
 * and bouncing off the bounds (a container or the viewport) with
 * restitution until it slows below `restThreshold`. The release
 * velocity is measured from the last ~120ms of the drag, so a quick
 * flick throws far and a gentle release barely moves.
 *
 * Touch works the same as mouse: drag with a finger, flick to throw.
 * Under reduced motion the element still drags, but release drops it
 * in place with no momentum. SSR-safe: everything rests at 0.
 *
 * ```tsx
 * let card!: HTMLDivElement
 * const { x, y } = createFling(() => card, { bounciness: 0.8 })
 * <div ref={card} style={{ transform: `translate(${x()}px, ${y()}px)`, "touch-action": "none" }} />
 * ```
 */
export function createFling(
  ref: () => Element | null | undefined,
  options: FlingOptions = {},
): FlingResult {
  const {
    bounds,
    friction = 1.4,
    bounciness = 0.7,
    restThreshold = 12,
  } = options;

  if (typeof window === "undefined") {
    const zero = () => 0;
    const no = () => false;
    return { x: zero, y: zero, vx: zero, vy: zero, moving: no, stop: () => {} };
  }

  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [vx, setVx] = createSignal(0);
  const [vy, setVy] = createSignal(0);
  const [moving, setMoving] = createSignal(false);

  let cancel: (() => void) | null = null;
  let lastT = 0;
  let minX = -Infinity;
  let maxX = Infinity;
  let minY = -Infinity;
  let maxY = Infinity;

  const measureBounds = () => {
    const el = ref();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Layout box: where the element would sit with no offset applied.
    const layoutLeft = rect.left - untrack(x);
    const layoutTop = rect.top - untrack(y);
    const box = bounds?.()?.getBoundingClientRect();
    const left = box?.left ?? 0;
    const top = box?.top ?? 0;
    const right = box?.right ?? window.innerWidth;
    const bottom = box?.bottom ?? window.innerHeight;
    minX = left - layoutLeft;
    maxX = right - (layoutLeft + rect.width);
    minY = top - layoutTop;
    maxY = bottom - (layoutTop + rect.height);
  };

  const loop = (t: number): boolean => {
    const dt = Math.min(Math.max((t - lastT) / 1000, 0), 0.064);
    lastT = t;
    const decay = Math.exp(-friction * dt);
    let nvx = untrack(vx) * decay;
    let nvy = untrack(vy) * decay;
    let nx = untrack(x) + nvx * dt;
    let ny = untrack(y) + nvy * dt;

    if (nx < minX) {
      nx = minX;
      nvx = Math.abs(nvx) * bounciness;
    } else if (nx > maxX) {
      nx = maxX;
      nvx = -Math.abs(nvx) * bounciness;
    }
    if (ny < minY) {
      ny = minY;
      nvy = Math.abs(nvy) * bounciness;
    } else if (ny > maxY) {
      ny = maxY;
      nvy = -Math.abs(nvy) * bounciness;
    }

    setX(nx);
    setY(ny);
    setVx(nvx);
    setVy(nvy);

    if (Math.hypot(nvx, nvy) < restThreshold) {
      setVx(0);
      setVy(0);
      setMoving(false);
      cancel = null;
      return false;
    }
    return true;
  };

  const stop = () => {
    cancel?.();
    cancel = null;
    setVx(0);
    setVy(0);
    setMoving(false);
  };

  const onDown = (event: PointerEvent) => {
    const el = ref();
    if (!el) return;
    stop();
    measureBounds();

    const startPX = event.clientX;
    const startPY = event.clientY;
    const startX = untrack(x);
    const startY = untrack(y);
    const samples: Array<[time: number, x: number, y: number]> = [
      [now(), startX, startY],
    ];

    const move = (ev: PointerEvent) => {
      const nx = startX + (ev.clientX - startPX);
      const ny = startY + (ev.clientY - startPY);
      setX(nx);
      setY(ny);
      samples.push([now(), nx, ny]);
      if (samples.length > 8) samples.shift();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      // Release velocity from the last ~120ms of the drag.
      const t = now();
      let oi = 0;
      while (oi < samples.length - 1 && t - samples[oi][0] > 120) oi++;
      const [ot, ox, oy] = samples[oi];
      const [lt, lx, ly] = samples[samples.length - 1];
      const dt = Math.max((lt - ot) / 1000, 0.008);
      const rvx = (lx - ox) / dt;
      const rvy = (ly - oy) / dt;
      if (!prefersReducedMotion() && Math.hypot(rvx, rvy) >= restThreshold) {
        setVx(rvx);
        setVy(rvy);
        setMoving(true);
        lastT = now();
        cancel = schedule(loop);
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    event.preventDefault();
  };

  createEffect(() => {
    const el = ref();
    if (!el) return;
    el.addEventListener("pointerdown", toListener(onDown));
    onCleanup(() => el.removeEventListener("pointerdown", toListener(onDown)));
  });

  onCleanup(() => cancel?.());

  return { x, y, vx, vy, moving, stop };
}
