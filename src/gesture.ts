import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import type { SpringOptions } from "./spring.js";

type MaybeElement = () => Element | null | undefined;

/** Lifecycle of a drag gesture. */
export type DragStatus = "idle" | "dragging" | "settling";

/** Which axes the drag follows. Default "both". */
export type DragAxis = "x" | "y" | "both";

/**
 * Drag bounds in pixels, relative to the drag origin (the element's
 * resting position). Omit an edge for no limit on that side.
 */
export interface DragConstraints {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

/** Snapshot delivered to `onDragEnd` when the pointer lifts. */
export interface DragEndInfo {
  /** Final drag offset in pixels. */
  x: number;
  /** Final drag offset in pixels. */
  y: number;
  /** Release velocity in px/s. */
  velocityX: number;
  /** Release velocity in px/s. */
  velocityY: number;
}

export interface DragOptions {
  /** Which axes the drag follows. Default "both". */
  axis?: DragAxis;
  /**
   * Bounds in pixels, relative to the drag origin. Omit for free drag.
   * On release the element settles back inside the bounds.
   */
  constraints?: DragConstraints;
  /**
   * Overshoot allowed beyond the constraints while dragging, 0 to 1.
   * 0 is a hard stop, 1 removes all resistance. Default 0.35.
   */
  elastic?: number;
  /** Keep gliding after release with inertia. Default true. */
  momentum?: boolean;
  /**
   * Seconds of release velocity projected into the settle target.
   * Higher values glide further. Default 0.2.
   */
  inertia?: number;
  /**
   * Spring physics for the settle after release. Default
   * `{ stiffness: 300, damping: 32 }`.
   */
  spring?: SpringOptions;
  /** Called when the pointer grabs the element. */
  onDragStart?: () => void;
  /** Called when the pointer lifts, with the release snapshot. */
  onDragEnd?: (info: DragEndInfo) => void;
}

export interface DragControls {
  /** Horizontal offset in pixels from the resting position. */
  x: Accessor<number>;
  /** Vertical offset in pixels from the resting position. */
  y: Accessor<number>;
  /** `idle`, `dragging` while the pointer is down, `settling` after release. */
  status: Accessor<DragStatus>;
}

const zero = () => 0;
const idle = () => "idle" as const;

/**
 * Pointer drag with spring physics, constraints, and momentum.
 *
 * The gesture workhorse: draggable cards, sliders, bottom-sheet handles,
 * sortable rows. While the pointer is down the element tracks it 1:1;
 * on release it glides with inertia and springs into its constraints,
 * stretching elastically past the edges while dragged.
 *
 * This is the framer-motion `drag` vocabulary rebuilt signal-native:
 * `axis` locks direction, `constraints` bounds the travel, `elastic`
 * controls the overshoot, and `momentum` toggles the release glide.
 * For the physics-toy flavor (friction plus bouncing off walls), see
 * `createFling` instead.
 *
 * Set `touch-action: none` on the draggable element so touch drags do
 * not fight the page scroll.
 *
 * SSR-safe and reduced-motion aware: on the server everything rests at
 * 0; under reduced motion the drag still tracks the pointer (direct
 * manipulation is not animation) but release snaps instantly to the
 * constrained target with no glide.
 *
 * ```tsx
 * let card!: HTMLDivElement
 * const { x, y, status } = createDrag(() => card, {
 *   constraints: { left: 0, right: 300, top: 0, bottom: 0 },
 *   elastic: 0.4,
 * })
 * <div
 *   ref={card}
 *   style={{
 *     transform: `translate(${x()}px, ${y()}px)`,
 *     "touch-action": "none",
 *     cursor: status() === "dragging" ? "grabbing" : "grab",
 *   }}
 * >
 *   Drag me
 * </div>
 * ```
 */
export function createDrag(
  ref: MaybeElement,
  options: DragOptions = {},
): DragControls {
  if (typeof window === "undefined") {
    return { x: zero, y: zero, status: idle };
  }

  const {
    axis = "both",
    constraints,
    elastic = 0.35,
    momentum = true,
    inertia = 0.2,
    spring = {},
    onDragStart,
    onDragEnd,
  } = options;

  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [status, setStatus] = createSignal<DragStatus>("idle");

  let cancelSettle: (() => void) | null = null;

  const clampAxis = (value: number, min?: number, max?: number): number => {
    if (min !== undefined && value < min) return min;
    if (max !== undefined && value > max) return max;
    return value;
  };

  /** Elastic resistance past the constraints while dragging. */
  const applyConstraints = (px: number, py: number): [number, number] => {
    if (!constraints) return [px, py];
    const { left, top, right, bottom } = constraints;
    let ox = px;
    let oy = py;
    if (left !== undefined && ox < left) ox = left + (ox - left) * elastic;
    if (right !== undefined && ox > right) ox = right + (ox - right) * elastic;
    if (top !== undefined && oy < top) oy = top + (oy - top) * elastic;
    if (bottom !== undefined && oy > bottom) oy = bottom + (oy - bottom) * elastic;
    return [ox, oy];
  };

  const hardClamp = (px: number, py: number): [number, number] => {
    if (!constraints) return [px, py];
    const { left, top, right, bottom } = constraints;
    return [clampAxis(px, left, right), clampAxis(py, top, bottom)];
  };

  const stopSettle = () => {
    cancelSettle?.();
    cancelSettle = null;
  };

  /** Spring glide toward the target, seeded with the release velocity. */
  const settleTo = (
    tx: number,
    ty: number,
    vx0: number,
    vy0: number,
  ): void => {
    const { stiffness = 300, damping = 32 } = spring;
    let cx = untrack(x);
    let cy = untrack(y);
    let vx = vx0;
    let vy = vy0;
    let last = now();
    setStatus("settling");
    stopSettle();
    const task = (t: number): boolean => {
      const dt = Math.min(Math.max((t - last) / 1000, 0), 0.064);
      last = t;
      // Semi-implicit Euler toward the target, same integrator as createSpring.
      vx += (-stiffness * (cx - tx) - damping * vx) * dt;
      vy += (-stiffness * (cy - ty) - damping * vy) * dt;
      cx += vx * dt;
      cy += vy * dt;
      setX(cx);
      setY(cy);
      const settled =
        Math.hypot(cx - tx, cy - ty) < 0.5 && Math.hypot(vx, vy) < 20;
      if (settled) {
        setX(tx);
        setY(ty);
        setStatus("idle");
        cancelSettle = null;
        return false;
      }
      return true;
    };
    cancelSettle = schedule(task);
  };

  const onDown = (event: PointerEvent) => {
    if (event.isPrimary === false) return;
    const el = ref();
    if (!el) return;
    stopSettle();

    const startPX = event.clientX;
    const startPY = event.clientY;
    const startX = untrack(x);
    const startY = untrack(y);
    const samples: Array<[time: number, x: number, y: number]> = [
      [now(), startX, startY],
    ];

    setStatus("dragging");
    onDragStart?.();

    const move = (ev: PointerEvent) => {
      if (ev.isPrimary === false) return;
      let nx = startX + (ev.clientX - startPX);
      let ny = startY + (ev.clientY - startPY);
      if (axis === "x") ny = startY;
      if (axis === "y") nx = startX;
      [nx, ny] = applyConstraints(nx, ny);
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
      const dt = Math.max(lt - ot, 1) / 1000;
      const velocityX = ((lx - ox) / dt) * (axis === "y" ? 0 : 1);
      const velocityY = ((ly - oy) / dt) * (axis === "x" ? 0 : 1);

      const releaseX = untrack(x);
      const releaseY = untrack(y);
      onDragEnd?.({ x: releaseX, y: releaseY, velocityX, velocityY });

      if (prefersReducedMotion()) {
        // Direct manipulation still works, but the release snaps
        // instantly to the constrained target: no glide, no spring.
        const [cx, cy] = hardClamp(releaseX, releaseY);
        setX(cx);
        setY(cy);
        setStatus("idle");
        return;
      }

      // Project the release velocity forward, then spring to the
      // clamped target. Overshoot past the constraints snaps back
      // elastically because the target sits on the edge.
      let tx = releaseX;
      let ty = releaseY;
      if (momentum) {
        tx += velocityX * inertia;
        ty += velocityY * inertia;
      }
      [tx, ty] = hardClamp(tx, ty);
      const vx0 = momentum ? velocityX : 0;
      const vy0 = momentum ? velocityY : 0;
      settleTo(tx, ty, vx0, vy0);
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Late-bound refs (Solid assigns `ref` after mount) still get the grab.
  createEffect(() => {
    const el = ref();
    if (!el) return;
    el.addEventListener("pointerdown", onDown as EventListener);
    onCleanup(() =>
      el.removeEventListener("pointerdown", onDown as EventListener),
    );
  });

  onCleanup(() => stopSettle());

  return { x, y, status };
}
