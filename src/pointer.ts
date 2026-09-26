import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { createSpring, type SpringOptions } from "./spring.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface MagneticOptions {
  /**
   * Attraction radius in pixels around the element's center. Outside the
   * radius the element springs back to rest. Default 140.
   */
  radius?: number;
  /** Pull strength at the center, 0 to 1. Default 0.35. */
  strength?: number;
  /** Spring physics for the pull and the release. */
  spring?: SpringOptions;
}

export interface MagneticResult {
  /** Horizontal pull in pixels, spring-smoothed. */
  x: Accessor<number>;
  /** Vertical pull in pixels, spring-smoothed. */
  y: Accessor<number>;
}

export interface TiltOptions {
  /** Maximum tilt in degrees at the element's edge. Default 10. */
  maxAngle?: number;
  /** Spring physics for the tilt and the settle-back. */
  spring?: SpringOptions;
}

export interface TiltResult {
  /** Tilt around the horizontal axis in degrees, spring-smoothed. */
  rotateX: Accessor<number>;
  /** Tilt around the vertical axis in degrees, spring-smoothed. */
  rotateY: Accessor<number>;
}

const zero = () => 0;

/**
 * Magnetic attraction toward the pointer.
 *
 * When the pointer comes within `radius` of the element's center, the
 * element is pulled toward it with a strength that fades with distance.
 * when the pointer leaves, it springs back to rest. The pull itself is a
 * spring, so arrivals and releases both glide instead of snapping.
 *
 * Built on `pointermove`, so touch drags work the same as mouse hovers.
 * SSR-safe and reduced-motion safe: both return constant `0` accessors.
 *
 * ```tsx
 * let btn!: HTMLButtonElement
 * const { x, y } = createMagnetic(() => btn, { strength: 0.4 })
 * <button ref={btn} style={{ transform: `translate(${x()}px, ${y()}px)` }}>
 *   Pull me
 * </button>
 * ```
 */
export function createMagnetic(
  ref: () => Element | null | undefined,
  options: MagneticOptions = {},
): MagneticResult {
  if (typeof window === "undefined" || prefersReducedMotion()) {
    return { x: zero, y: zero };
  }

  const { radius = 140, strength = 0.35, spring } = options;
  const [targetX, setTargetX] = createSignal(0);
  const [targetY, setTargetY] = createSignal(0);
  const x = createSpring(targetX, spring);
  const y = createSpring(targetY, spring);

  const onMove = (event: PointerEvent) => {
    const el = ref();
    if (!el) {
      setTargetX(0);
      setTargetY(0);
      return;
    }
    const rect = el.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist >= radius) {
      setTargetX(0);
      setTargetY(0);
      return;
    }
    const falloff = 1 - dist / radius;
    setTargetX(dx * strength * falloff);
    setTargetY(dy * strength * falloff);
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  onCleanup(() => window.removeEventListener("pointermove", onMove));

  return { x, y };
}

/**
 * 3D tilt that follows the pointer across an element.
 *
 * The pointer's position over the element maps to `rotateX`/`rotateY` in
 * degrees, spring-smoothed so the card leans with weight instead of
 * jittering. When the pointer leaves, the element settles back to flat.
 * Pair with a CSS `perspective` on the parent for real depth.
 *
 * Touch drags tilt while touching, release settles back to flat.
 * SSR-safe and reduced-motion safe: both return constant `0` accessors.
 *
 * ```tsx
 * let card!: HTMLDivElement
 * const { rotateX, rotateY } = createTilt(() => card, { maxAngle: 12 })
 * <div style={{ perspective: "800px" }}>
 *   <div
 *     ref={card}
 *     style={{
 *       transform: `rotateX(${rotateX()}deg) rotateY(${rotateY()}deg)`,
 *     }}
 *   />
 * </div>
 * ```
 */
export function createTilt(
  ref: () => Element | null | undefined,
  options: TiltOptions = {},
): TiltResult {
  if (typeof window === "undefined" || prefersReducedMotion()) {
    return { rotateX: zero, rotateY: zero };
  }

  const { maxAngle = 10, spring } = options;
  const [targetRX, setTargetRX] = createSignal(0);
  const [targetRY, setTargetRY] = createSignal(0);
  const rotateX = createSpring(targetRX, spring);
  const rotateY = createSpring(targetRY, spring);

  const onMove = (event: PointerEvent) => {
    const el = ref();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return; // outside: pointerleave resets the tilt
    }
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTargetRY(px * 2 * maxAngle);
    setTargetRX(-py * 2 * maxAngle);
  };

  const onLeave = () => {
    setTargetRX(0);
    setTargetRY(0);
  };

  window.addEventListener("pointermove", onMove, { passive: true });

  // Late-bound refs (Solid assigns `ref` after mount) still get the reset.
  createEffect(() => {
    const el = ref();
    if (!el) return;
    el.addEventListener("pointerleave", onLeave);
    onCleanup(() => el.removeEventListener("pointerleave", onLeave));
  });

  onCleanup(() => window.removeEventListener("pointermove", onMove));

  return { rotateX, rotateY };
}
