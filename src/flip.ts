import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import {
  animate,
  type AnimateOptions,
  type AnimationControls,
} from "./animate.js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import type { SpringOptions } from "./spring.js";

export interface FlipOptions {
  /** Duration in milliseconds. Default 400. */
  duration?: number;
  /** Delay before starting, in milliseconds. Default 0. */
  delay?: number;
  /** Easing function or name. Default "easeOutCubic". */
  easing?: AnimateOptions["easing"];
  /**
   * Also animate the size delta as scale, so growing or shrinking
   * elements morph instead of just sliding. Default true.
   */
  scale?: boolean;
}

/**
 * FLIP layout animation around a DOM mutation.
 *
 * Records the element's position and size (First), runs your `mutate()`
 * which changes the layout (Last), then Inverts the delta as a transform
 * and Plays it back to identity. List reorders, expanding panels, and
 * grid reshuffles glide to their new spots instead of jumping.
 *
 * The element's pre-existing `transform` is captured and restored after
 * the animation, so FLIP composes with other transform animations.
 * `stop()` halts mid-flight and restores the original transform.
 *
 * SSR-safe and reduced-motion safe: the mutation runs with no animation.
 * If the element does not move, no animation runs either.
 *
 * ```tsx
 * import { animateFlip } from "solid-drift"
 *
 * const [items, setItems] = createSignal(["a", "b", "c"])
 * let list!: HTMLUListElement
 *
 * const shuffle = () =>
 *   animateFlip(
 *     () => list,
 *     () => setItems((prev) => [...prev].reverse()),
 *     { duration: 450 },
 *   )
 * ```
 */
export function animateFlip(
  ref: () => Element | null | undefined,
  mutate: () => void,
  options: FlipOptions = {},
): AnimationControls {
  const {
    duration = 400,
    delay = 0,
    easing = "easeOutCubic",
    scale = true,
  } = options;

  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    resolveFinished();
  };

  const el = ref();
  if (typeof window === "undefined" || !el || prefersReducedMotion()) {
    mutate();
    finish();
    return { stop: () => {}, finished };
  }
  const target = el as HTMLElement;
  const prevTransform = target.style.transform;

  const first = target.getBoundingClientRect();
  mutate();

  let stopped = false;
  let step: AnimationControls | null = null;
  const controls: AnimationControls = {
    stop: () => {
      stopped = true;
      step?.stop();
      target.style.transform = prevTransform;
      finish();
    },
    finished,
  };

  // Two frames: one for Solid's DOM update to flush, one to measure it.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (stopped) {
        finish();
        return;
      }
      const last = target.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const sx = scale && last.width > 0 ? first.width / last.width : 1;
      const sy = scale && last.height > 0 ? first.height / last.height : 1;

      const moved =
        Math.abs(dx) >= 0.5 ||
        Math.abs(dy) >= 0.5 ||
        Math.abs(sx - 1) >= 0.001 ||
        Math.abs(sy - 1) >= 0.001;
      if (!moved) {
        finish();
        return;
      }

      const render = (eased: number) => {
        const rest = 1 - eased;
        target.style.transform =
          `translate3d(${(dx * rest).toFixed(2)}px, ${(dy * rest).toFixed(2)}px, 0)` +
          (scale
            ? ` scale(${(1 + (sx - 1) * rest).toFixed(4)}, ${(1 + (sy - 1) * rest).toFixed(4)})`
            : "");
      };
      render(0);
      // Force the inverted state to apply before the animation runs.
      void target.offsetHeight;

      step = animate(0, 1, {
        duration,
        delay,
        easing,
        onUpdate: render,
        onComplete: () => {
          target.style.transform = prevTransform;
          finish();
        },
      });
    }),
  );

  return controls;
}

interface SharedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Donor registry for shared-element handoffs. When an element carrying a
 * shared id unmounts, its last rect is parked here; the next element that
 * mounts with the same id consumes it and flies in from that rect.
 * One active carrier per id: consumption deletes the entry.
 */
const donors = new Map<string, SharedRect>();

function rectOf(el: Element): SharedRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export interface SharedLayoutOptions {
  /**
   * Shared identity. Elements with the same id hand off to each other
   * across mounts: the newcomer flies in from the donor's last rect.
   */
  id: string;
  /**
   * Spring physics for the handoff flight. Default
   * `{ stiffness: 260, damping: 30 }`.
   */
  spring?: SpringOptions;
  /**
   * Also morph the size delta as scale, so growing or shrinking elements
   * morph instead of just sliding. Default true.
   */
  scale?: boolean;
}

export interface SharedLayoutResult {
  /** Horizontal corrective offset in pixels. */
  x: Accessor<number>;
  /** Vertical corrective offset in pixels. */
  y: Accessor<number>;
  /** Horizontal corrective scale. */
  scaleX: Accessor<number>;
  /** Vertical corrective scale. */
  scaleY: Accessor<number>;
  /** True while the handoff flight is running. */
  flying: Accessor<boolean>;
}

const zero = () => 0;
const one = () => 1;
const no = () => false;

/**
 * Shared-element transition across mounts, the `layoutId` magic.
 *
 * Give the same `id` to elements that represent the same thing in
 * different places: a tab pill, a card that opens into a detail view,
 * a thumbnail that becomes a hero image. When the old element unmounts
 * its rect is remembered; when the new one mounts it starts at the
 * donor's rect and springs home, sliding and morphing into place.
 *
 * This is cross-mount FLIP: where `animateFlip` inverts the delta
 * around a mutation on one element, `createSharedLayout` inverts the
 * delta between two elements that share an identity. Bind the returned
 * values as a transform on the mounted element.
 *
 * SSR-safe and reduced-motion safe: the element simply appears, with
 * no flight. One active carrier per id: the first mount consumes the
 * parked donor rect.
 *
 * ```tsx
 * import { createSharedLayout } from "solid-drift"
 *
 * function TabPill(props: { id: string }) {
 *   let pill!: HTMLDivElement
 *   const { x, y, scaleX, scaleY } = createSharedLayout(() => pill, {
 *     id: props.id,
 *   })
 *   return (
 *     <div
 *       ref={pill}
 *       style={{
 *         transform: `translate(${x()}px, ${y()}px) scale(${scaleX()}, ${scaleY()})`,
 *       }}
 *     />
 *   )
 * }
 *
 * // Only one pill is mounted at a time; it glides between tabs.
 * <Show when={tab() === "a"}><TabPill id="pill" /></Show>
 * <Show when={tab() === "b"}><TabPill id="pill" /></Show>
 * ```
 */
export function createSharedLayout(
  ref: () => Element | null | undefined,
  options: SharedLayoutOptions,
): SharedLayoutResult {
  const { id, spring = {}, scale = true } = options;

  if (typeof window === "undefined") {
    return { x: zero, y: zero, scaleX: one, scaleY: one, flying: no };
  }

  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [scaleX, setScaleX] = createSignal(1);
  const [scaleY, setScaleY] = createSignal(1);
  const [flying, setFlying] = createSignal(false);

  let cancelFlight: (() => void) | null = null;
  const stopFlight = () => {
    cancelFlight?.();
    cancelFlight = null;
  };

  /** Spring flight from the inverted delta back to identity. */
  const flyFrom = (dx: number, dy: number, sx: number, sy: number): void => {
    const { stiffness = 260, damping = 30 } = spring;
    let cx = dx;
    let cy = dy;
    let csx = sx;
    let csy = sy;
    let vx = 0;
    let vy = 0;
    let vsx = 0;
    let vsy = 0;
    let last = now();
    setX(cx);
    setY(cy);
    setScaleX(csx);
    setScaleY(csy);
    setFlying(true);
    stopFlight();
    const task = (t: number): boolean => {
      const dt = Math.min(Math.max((t - last) / 1000, 0), 0.064);
      last = t;
      // Semi-implicit Euler per channel, same integrator as createSpring.
      vx += (-stiffness * cx - damping * vx) * dt;
      vy += (-stiffness * cy - damping * vy) * dt;
      vsx += (-stiffness * (csx - 1) - damping * vsx) * dt;
      vsy += (-stiffness * (csy - 1) - damping * vsy) * dt;
      cx += vx * dt;
      cy += vy * dt;
      csx += vsx * dt;
      csy += vsy * dt;
      setX(cx);
      setY(cy);
      setScaleX(csx);
      setScaleY(csy);
      const settled =
        Math.hypot(cx, cy) < 0.5 &&
        Math.abs(csx - 1) < 0.003 &&
        Math.abs(csy - 1) < 0.003 &&
        Math.hypot(vx, vy) < 20 &&
        Math.hypot(vsx, vsy) < 0.05;
      if (settled) {
        setX(0);
        setY(0);
        setScaleX(1);
        setScaleY(1);
        setFlying(false);
        cancelFlight = null;
        return false;
      }
      return true;
    };
    cancelFlight = schedule(task);
  };

  // Late-bound refs (Solid assigns `ref` after mount) still hand off.
  createEffect(() => {
    const el = ref();
    if (!el) return;
    const mountRect = rectOf(el);
    const donor = donors.get(id);
    donors.delete(id);

    if (donor && !prefersReducedMotion()) {
      const own = mountRect;
      const dx = donor.left - own.left;
      const dy = donor.top - own.top;
      const sx = scale && own.width > 0 ? donor.width / own.width : 1;
      const sy = scale && own.height > 0 ? donor.height / own.height : 1;
      const moved =
        Math.abs(dx) >= 0.5 ||
        Math.abs(dy) >= 0.5 ||
        Math.abs(sx - 1) >= 0.002 ||
        Math.abs(sy - 1) >= 0.002;
      if (moved) flyFrom(dx, dy, sx, sy);
    }

    onCleanup(() => {
      // In <Show>/<Switch>/&& branches the cleanup runs while the node
      // is still attached, so this is the live rect. If the node was
      // already detached (all-zero rect), keep the mount snapshot.
      const r = rectOf(el);
      const valid =
        r.width > 0 || r.height > 0 || r.left !== 0 || r.top !== 0;
      donors.set(id, valid ? r : mountRect);
    });
  });

  onCleanup(() => stopFlight());

  return { x, y, scaleX, scaleY, flying };
}
