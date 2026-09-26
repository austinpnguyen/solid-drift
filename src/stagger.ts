/**
 * Builds a stagger-delay lookup for cascading animations across a list.
 *
 * Given an item index, returns its delay in milliseconds (`index * delayMs`).
 * Pair with `createTween`'s `delay` option (or `animate`) so items entrance
 * one after another instead of all at once. `count` is informational: the
 * number of items being staggered.
 *
 * ```ts
 * const at = createStagger(5, 80); // 5 items, 80ms apart
 * at(0); // 0
 * at(3); // 240
 * ```
 */
export function createStagger(
  count: number,
  delayMs: number,
): (index: number) => number {
  void count;
  return (index: number) => index * delayMs;
}
