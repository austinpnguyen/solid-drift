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

/* ------------------------------------------------------------------ */
/* createTiltCard                                                      */
/* ------------------------------------------------------------------ */

export interface TiltCardOptions {
  /** Max tilt angle in degrees. Default 12. */
  maxAngle?: number;
  /** Scale while hovering. Default 1.04. */
  scale?: number;
  /** Perspective distance in px for the transform. Default 900. */
  perspective?: number;
  /** Spring options for tilt, shine, and scale. */
  spring?: SpringOptions;
}

export interface TiltCardResult {
  /** Spring-smoothed rotateX in degrees. */
  rotateX: Accessor<number>;
  /** Spring-smoothed rotateY in degrees. */
  rotateY: Accessor<number>;
  /** Pointer position 0..1 across the card, for glare placement. */
  glareX: Accessor<number>;
  /** Pointer position 0..1 down the card, for glare placement. */
  glareY: Accessor<number>;
  /** Rainbow angle in degrees, follows the pointer. Spring-smoothed. */
  holoAngle: Accessor<number>;
  /** 0..1 shine intensity, spring-smoothed, 0 when not hovering. */
  shine: Accessor<number>;
  /** Spring-smoothed scale. */
  scale: Accessor<number>;
  /** Whether the pointer is over the card. */
  hovering: Accessor<boolean>;
  /** Ready-made transform: perspective, rotateX/rotateY, scale. */
  transform: Accessor<string>;
}

/**
 * Holographic trading-card tilt: 3D lean plus the signals a holo
 * foil needs.
 *
 * Beyond `createTilt`'s spring-smoothed rotation, this tracks the
 * pointer as `glareX`/`glareY` (0..1, for a radial glare overlay),
 * `holoAngle` (a rainbow angle that sweeps with the pointer, for a
 * gradient foil overlay), `shine` (0..1 overlay intensity that fades
 * in on hover and out on leave), and a hover `scale` pop. Bind them
 * to two absolutely-positioned overlays over your card art:
 *
 * ```tsx
 * const card = createTiltCard(() => el, { maxAngle: 14 });
 * <div style={{ transform: card.transform() }}>
 *   {art}
 *   <div style={{
 *     background: `radial-gradient(circle at ${card.glareX() * 100}% ${card.glareY() * 100}%, rgba(255,255,255,0.6), transparent 60%)`,
 *     opacity: card.shine(),
 *   }} />
 *   <div style={{
 *     background: `linear-gradient(${card.holoAngle()}deg, #ff0080, #ff8000, #ffff00, #00ff80, #0080ff, #8000ff)`,
 *     "mix-blend-mode": "color-dodge",
 *     opacity: card.shine() * 0.55,
 *   }} />
 * </div>
 * ```
 *
 * SSR-safe and reduced-motion safe: static constants (no tilt, no
 * shine). Touch drags tilt while touching, release settles back.
 */
export function createTiltCard(
  ref: () => Element | null | undefined,
  options: TiltCardOptions = {},
): TiltCardResult {
  const half = () => 0.5;
  const one = () => 1;
  const no = () => false;
  if (typeof window === "undefined" || prefersReducedMotion()) {
    const p = options.perspective ?? 900;
    return {
      rotateX: zero,
      rotateY: zero,
      glareX: half,
      glareY: half,
      holoAngle: zero,
      shine: zero,
      scale: one,
      hovering: no,
      transform: () =>
        `perspective(${p}px) rotateX(0deg) rotateY(0deg) scale(1)`,
    };
  }

  const {
    maxAngle = 12,
    scale: hoverScale = 1.04,
    perspective = 900,
    spring,
  } = options;

  const [targetRX, setTargetRX] = createSignal(0);
  const [targetRY, setTargetRY] = createSignal(0);
  const [targetHolo, setTargetHolo] = createSignal(0);
  const [targetShine, setTargetShine] = createSignal(0);
  const [targetScale, setTargetScale] = createSignal(1);
  const [glareX, setGlareX] = createSignal(0.5);
  const [glareY, setGlareY] = createSignal(0.5);
  const [hovering, setHovering] = createSignal(false);

  const rotateX = createSpring(targetRX, spring);
  const rotateY = createSpring(targetRY, spring);
  const holoAngle = createSpring(targetHolo, spring);
  const shine = createSpring(targetShine, spring);
  const scale = createSpring(targetScale, spring);

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
      return; // outside: pointerleave resets the card
    }
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const cx = px - 0.5;
    const cy = py - 0.5;
    setTargetRY(cx * 2 * maxAngle);
    setTargetRX(-cy * 2 * maxAngle);
    setGlareX(px);
    setGlareY(py);
    setTargetHolo((cx + cy) * 180);
    setTargetShine(1);
    setTargetScale(hoverScale);
    setHovering(true);
  };

  const onLeave = () => {
    setTargetRX(0);
    setTargetRY(0);
    setTargetHolo(0);
    setTargetShine(0);
    setTargetScale(1);
    setHovering(false);
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

  return {
    rotateX,
    rotateY,
    glareX,
    glareY,
    holoAngle,
    shine,
    scale,
    hovering,
    transform: () =>
      `perspective(${perspective}px) rotateX(${rotateX()}deg) rotateY(${rotateY()}deg) scale(${scale()})`,
  };
}
