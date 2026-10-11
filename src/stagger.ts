import { resolveEasing, type Easing, type EasingName } from "./easing.js";

export interface StaggerOptions {
  /**
   * Where the stagger starts. `"first"` (default) goes 0..n,
   * `"last"` goes n..0, `"center"` spreads from the middle outward,
   * or a number for a specific index.
   */
  from?: "first" | "last" | "center" | number;
  /**
   * Grid dimensions `[cols, rows]` for 2D stagger. The delay is based on
   * the distance from the `from` point in grid space.
   */
  grid?: [cols: number, rows: number];
  /** Only measure distance along one axis in grid mode. */
  axis?: "x" | "y";
  /** Ease applied to the normalized delay distribution. */
  ease?: Easing | EasingName;
}

/**
 * Builds a stagger-delay lookup for cascading animations across a list.
 *
 * Given an item index, returns its delay in milliseconds. Pair with
 * `createTween`'s `delay` option (or `animate`) so items entrance one
 * after another instead of all at once.
 *
 * ```ts
 * const at = createStagger(5, 80) // 5 items, 80ms apart
 * at(0) // 0
 * at(3) // 240
 *
 * // From the center outward:
 * const at2 = createStagger(5, 80, { from: "center" })
 *
 * // 3x3 grid, center-out:
 * const at3 = createStagger(9, 100, { grid: [3, 3], from: "center" })
 * ```
 */
export function createStagger(
  count: number,
  delayMs: number,
  opts: StaggerOptions = {},
): (index: number) => number {
  const { from = "first", grid, axis, ease } = opts;
  const easing = ease !== undefined ? resolveEasing(ease) : null;

  // Resolve the origin index for distance measurement.
  const originIndex = (() => {
    if (typeof from === "number") return Math.max(0, Math.min(count - 1, from));
    if (from === "last") return count - 1;
    if (from === "center") return (count - 1) / 2;
    return 0; // "first"
  })();

  // Max distance for normalization.
  const maxDist = (() => {
    if (!grid) {
      if (from === "center") return (count - 1) / 2;
      return count - 1;
    }
    const [cols, rows] = grid;
    const origin = indexToPos(originIndex, cols);
    let max = 0;
    for (let i = 0; i < count; i++) {
      const p = indexToPos(i, cols);
      const d = gridDistance(p, origin, axis);
      if (d > max) max = d;
    }
    void rows;
    return max || 1;
  })();

  return (index: number) => {
    if (index < 0 || index >= count) return 0;
    let dist: number;
    if (grid) {
      const [cols] = grid;
      const p = indexToPos(index, cols);
      const origin = indexToPos(originIndex, cols);
      dist = gridDistance(p, origin, axis);
    } else if (from === "last") {
      dist = count - 1 - index;
    } else if (from === "center") {
      dist = Math.abs(index - originIndex);
    } else if (typeof from === "number") {
      dist = Math.abs(index - originIndex);
    } else {
      dist = index; // "first"
    }
    const t = maxDist === 0 ? 0 : dist / maxDist;
    const eased = easing ? easing(t) : t;
    return eased * delayMs * maxDist;
  };
}

function indexToPos(index: number, cols: number): { x: number; y: number } {
  return { x: index % cols, y: Math.floor(index / cols) };
}

function gridDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
  axis?: "x" | "y",
): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (axis === "x") return dx;
  if (axis === "y") return dy;
  return Math.sqrt(dx * dx + dy * dy);
}
