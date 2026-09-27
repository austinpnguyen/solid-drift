import { createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import { now, schedule } from "./engine.js";
import { easeOutCubic, type Easing } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

/**
 * One named animation state: CSS-ish property values. Numeric values
 * interpolate; anything else snaps to the target when the transition
 * finishes.
 */
export interface VariantDef {
  [prop: string]: number | string;
}

export interface VariantsOptions {
  /** Variant applied immediately on creation. */
  initial?: string;
  /** Transition length in ms. Default 250. */
  duration?: number;
  /** Easing for numeric interpolation. Default easeOutCubic. */
  easing?: Easing;
}

export interface VariantsControls {
  /** Name of the last variant passed to `go`. */
  current: Accessor<string | undefined>;
  /**
   * Current interpolated values. Bind these straight into styles:
   * `style={{ transform: `scale(${v.values().scale})` }}`.
   */
  values: Accessor<Record<string, number | string>>;
  /** Transition to the named variant. Unknown names are ignored. */
  go: (name: string) => void;
}

/**
 * Named animation states with tweened transitions, in the vocabulary of
 * "variants". `go(name)` interpolates every numeric property from the
 * current values to the target variant on the shared clock; non-numeric
 * properties (colors, keywords) snap at the end of the transition.
 *
 * Pairs with `createHover` / `createPress`: map gesture states to variant
 * names and the element animates between them.
 *
 * Under reduced motion (and on the server) transitions snap instantly.
 * SSR-safe.
 *
 * ```tsx
 * const card = createVariants(
 *   {
 *     idle: { scale: 1, shadow: 0 },
 *     hover: { scale: 1.04, shadow: 12 },
 *     press: { scale: 0.96, shadow: 4 },
 *   },
 *   { initial: "idle", duration: 180 },
 * );
 * createHover(() => el, {
 *   onChange: (h) => card.go(h ? "hover" : "idle"),
 * });
 * <div
 *   ref={el}
 *   style={{
 *     transform: `scale(${card.values().scale})`,
 *     "box-shadow": `0 ${card.values().shadow}px 24px rgb(0 0 0 / 0.12)`,
 *   }}
 * />
 * ```
 */
export function createVariants(
  variants: Record<string, VariantDef>,
  options: VariantsOptions = {},
): VariantsControls {
  const { initial, duration = 250, easing = easeOutCubic } = options;

  const first = initial ?? Object.keys(variants)[0];
  const [current, setCurrent] = createSignal<string | undefined>(first);
  const [values, setValues] = createSignal<Record<string, number | string>>({
    ...(first ? variants[first] : {}),
  });

  if (typeof window === "undefined") {
    return { current, values, go: () => {} };
  }

  let stopClock: (() => void) | null = null;

  const go = (name: string): void => {
    const target = variants[name];
    if (!target) return;
    setCurrent(name);
    stopClock?.();
    stopClock = null;
    const from = untrack(values);
    if (duration <= 0 || prefersReducedMotion()) {
      setValues({ ...target });
      return;
    }
    const start = now();
    const numeric = Object.keys(target).filter(
      (k) => typeof target[k] === "number" && typeof from[k] === "number",
    );
    stopClock = schedule((t) => {
      const p = Math.min(Math.max((t - start) / duration, 0), 1);
      const e = easing(p);
      const next: Record<string, number | string> = { ...untrack(values) };
      for (const k of numeric) {
        const a = from[k] as number;
        const b = target[k] as number;
        next[k] = a + (b - a) * e;
      }
      if (p >= 1) {
        // Snap non-numeric props (and exact numeric targets) at the end.
        for (const k of Object.keys(target)) next[k] = target[k];
        setValues(next);
        stopClock = null;
        return false;
      }
      setValues(next);
      return true;
    });
  };

  onCleanup(() => stopClock?.());

  return { current, values, go };
}
