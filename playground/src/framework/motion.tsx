import { createSignal, type JSX, Show } from "solid-js";

/* Reduced-motion helper for demos. Autoplay loops and ambient animation
   check this and render their end state instead of animating. */

let cached: boolean | null = null;

export function animationsDisabled(): boolean {
  if (cached === null) {
    cached =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return cached;
}

export function resetMotionCacheForTests() {
  cached = null;
}

/* Wraps an auto-playing demo: when reduced motion is requested, renders the
   static fallback instead of starting the animation. */

interface RespectMotionProps {
  fallback: JSX.Element;
  children: JSX.Element;
}

export function RespectMotion(props: RespectMotionProps) {
  const [disabled] = createSignal(animationsDisabled());
  return (
    <Show when={!disabled()} fallback={props.fallback}>
      {props.children}
    </Show>
  );
}
