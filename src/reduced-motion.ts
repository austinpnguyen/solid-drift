import { createSignal, onCleanup, type Accessor } from "solid-js";

const QUERY = "(prefers-reduced-motion: reduce)";

function queryMatches(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(QUERY).matches
  );
}

/**
 * Non-reactive check: does the user currently prefer reduced motion?
 *
 * SSR-safe: always `false` on the server. `createSpring`, `createTween`
 * and `animate` sample this whenever they (re)start: when reduced motion
 * is preferred they jump straight to the target value instead of animating.
 */
export function prefersReducedMotion(): boolean {
  return queryMatches();
}

/**
 * Reactive signal for the `(prefers-reduced-motion: reduce)` media query.
 *
 * Updates live if the OS preference changes while the app is running.
 * SSR-safe: `false` on the server.
 *
 * ```tsx
 * const reduced = createPrefersReducedMotion()
 * const duration = () => (reduced() ? 0 : 400)
 * ```
 */
export function createPrefersReducedMotion(): Accessor<boolean> {
  const [reduced, setReduced] = createSignal(queryMatches());

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    onCleanup(() => mq.removeEventListener("change", onChange));
  }

  return reduced;
}

/**
 * @deprecated Use {@link createPrefersReducedMotion} instead. This alias
 * will be removed in v1.0.
 */
export const usePrefersReducedMotion = createPrefersReducedMotion;
