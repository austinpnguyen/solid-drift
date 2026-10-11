import { onCleanup } from "solid-js";
import { schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";

/**
 * Per-frame setter for 60fps pointer-driven motion.
 *
 * Cursor followers, drag-linked values, and parallax need a new value
 * every frame. Creating a tween per frame is overhead; `createQuickSetter`
 * writes directly to the element's style, batching multiple sets in the
 * same frame into a single write on the shared rAF tick.
 *
 * Transform shortcuts (`x`, `y`, `scale`, `rotation`, ...) compose into
 * the element's transform string without clobbering each other. Any
 * other prop is set as a CSS property (numbers become px except for
 * unitless props like `opacity`).
 *
 * Null targets are no-ops. SSR-safe: returns a no-op setter.
 *
 * ```ts
 * const setX = createQuickSetter(() => el, "x");
 * window.addEventListener("pointermove", (e) => setX(e.clientX));
 * ```
 */
export function createQuickSetter(
  target: () => HTMLElement | null | undefined,
  prop: string,
): (value: number | string) => void {
  const writer = makeWriter(target, prop);
  return (value: number | string) => writer.set(value);
}

export interface QuickToOptions {
  /**
   * Damping factor (lambda). Higher = snappier. Default 12.
   * The setter glides toward each new target with frame-rate
   * independent exponential damping.
   */
  damping?: number;
}

/**
 * Smoothed version of `createQuickSetter`: each rAF tick the value glides
 * toward the latest target with exponential damping, giving the buttery
 * feel of a cursor follower without creating tweens.
 *
 * Under reduced motion the value is set directly with no glide.
 *
 * ```ts
 * const setX = createQuickTo(() => el, "x", { damping: 12 });
 * window.addEventListener("pointermove", (e) => setX(e.clientX));
 * ```
 */
export function createQuickTo(
  target: () => HTMLElement | null | undefined,
  prop: string,
  options: QuickToOptions = {},
): (value: number) => void {
  const { damping = 12 } = options;
  const writer = makeWriter(target, prop);

  let current: number | null = null;
  let goal = 0;
  let cancel: (() => void) | null = null;
  let lastT = 0;

  const ensureTick = () => {
    if (cancel) return;
    if (typeof window === "undefined") return;
    lastT = performance.now();
    cancel = schedule((t: number) => {
      const dt = Math.min((t - lastT) / 1000, 0.1);
      lastT = t;
      if (current === null) current = goal;
      // Frame-rate independent exponential damping.
      const next = current + (goal - current) * (1 - Math.exp(-damping * dt));
      // Snap when close enough to avoid endless micro-ticks.
      current = Math.abs(next - goal) < 0.01 ? goal : next;
      writer.set(current);
      if (current === goal) {
        cancel = null;
        return false;
      }
      return true;
    });
  };

  const set = (value: number) => {
    goal = value;
    if (prefersReducedMotion() || typeof window === "undefined") {
      current = value;
      cancel?.();
      cancel = null;
      writer.set(value);
      return;
    }
    ensureTick();
  };

  onCleanup(() => {
    cancel?.();
    cancel = null;
  });

  return set;
}

const TRANSFORM_KEYS: Record<string, (v: number | string) => string> = {
  x: (v) => `translateX(${cssNum(v)}px)`,
  y: (v) => `translateY(${cssNum(v)}px)`,
  z: (v) => `translateZ(${cssNum(v)}px)`,
  scale: (v) => `scale(${v})`,
  scaleX: (v) => `scaleX(${v})`,
  scaleY: (v) => `scaleY(${v})`,
  rotation: (v) => `rotate(${cssNum(v)}deg)`,
};

const UNITLESS = new Set(["opacity", "zIndex", "z-index", "flexGrow", "flex-grow"]);

function cssNum(v: number | string): number | string {
  return typeof v === "number" ? Math.round(v * 100) / 100 : v;
}

function toCssProp(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

interface Writer {
  set: (value: number | string) => void;
}

function makeWriter(
  target: () => HTMLElement | null | undefined,
  prop: string,
): Writer {
  const transform = TRANSFORM_KEYS[prop] as ((v: number | string) => string) | undefined;
  // Batching: coalesce multiple sets per frame into one style write.
  let pending: number | string | undefined;
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    if (pending === undefined) return;
    const value = pending;
    pending = undefined;
    const el = target();
    if (!el) return;
    if (transform !== undefined) {
      (el as unknown as { __driftQuick: Record<string, number | string> }).__driftQuick ??= {};
      const store = (el as unknown as { __driftQuick: Record<string, number | string> }).__driftQuick;
      store[prop] = value;
      const parts: string[] = [];
      for (const key of Object.keys(store)) {
        const fn = TRANSFORM_KEYS[key];
        if (fn) parts.push(fn(store[key]));
      }
      el.style.transform = parts.join(" ");
      return;
    }
    const cssKey = toCssProp(prop);
    const cssValue =
      typeof value === "number" && !UNITLESS.has(prop) && !UNITLESS.has(cssKey)
        ? `${cssNum(value)}px`
        : String(value);
    el.style.setProperty(cssKey, cssValue);
  };

  return {
    set: (value: number | string) => {
      if (typeof window === "undefined") return;
      pending = value;
      if (!scheduled) {
        scheduled = true;
        schedule(() => {
          flush();
          return false;
        });
      }
    },
  };
}
