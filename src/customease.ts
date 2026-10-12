import type { Easing } from "./easing.js";

const TABLE_SIZE = 200;

/**
 * Build a custom easing from an SVG path describing a curve in the
 * 0..1 x 0..1 box, like GSAP's CustomEase.
 *
 * The path is sampled into a 200-entry lookup table with
 * `getPointAtLength`, mapping x to y. The x coordinates must be
 * monotonically increasing (a function, not a loop); otherwise a clear
 * error is thrown.
 *
 * The returned easing works anywhere an easing is accepted
 * (`animate`, `createTween`, `createMorph`, ...).
 *
 * Requires DOM (uses SVG geometry). Throws a clear error on the server.
 *
 * ```ts
 * const snap = createCustomEase("M0,0 C0.2,0 0.4,1 1,1");
 * animate(0, 100, { easing: snap, duration: 600, onUpdate });
 * ```
 */
export function createCustomEase(path: string): Easing {
  if (typeof document === "undefined") {
    throw new Error("createCustomEase requires DOM (SVG geometry).");
  }

  const tmp = document.createElementNS("http://www.w3.org/2000/svg", "path");
  tmp.setAttribute("d", path);

  let length: number;
  try {
    length = tmp.getTotalLength();
  } catch {
    throw new Error("createCustomEase: invalid path data.");
  }
  if (!isFinite(length) || length <= 0) {
    throw new Error("createCustomEase: invalid path data.");
  }

  // Raw samples along the path.
  const RAW = 400;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= RAW; i++) {
    const p = tmp.getPointAtLength((length * i) / RAW);
    xs.push(p.x);
    ys.push(p.y);
  }

  // X must be monotonically increasing for x->y to be a function.
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] < xs[i - 1] - 1e-9) {
      throw new Error(
        "createCustomEase: path x must increase monotonically " +
          "(the curve must be a function of x).",
      );
    }
  }

  // Uniform lookup table: table[i] = y at x = i / (TABLE_SIZE - 1).
  const table: number[] = [];
  let j = 0;
  for (let i = 0; i < TABLE_SIZE; i++) {
    const x = i / (TABLE_SIZE - 1);
    while (j < xs.length - 2 && xs[j + 1] < x) j++;
    const x0 = xs[j];
    const x1 = xs[j + 1];
    const span = x1 - x0;
    const t = span <= 1e-12 ? 0 : (x - x0) / span;
    table.push(ys[j] + (ys[j + 1] - ys[j]) * t);
  }

  return (t: number): number => {
    const clamped = Math.min(Math.max(t, 0), 1);
    const pos = clamped * (TABLE_SIZE - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, TABLE_SIZE - 1);
    const f = pos - i0;
    return table[i0] + (table[i1] - table[i0]) * f;
  };
}
