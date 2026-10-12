import { createSignal, onCleanup, type Accessor } from "solid-js";
import { schedule, now } from "./engine.js";
import { damp } from "./math.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export interface SmoothScrollOptions {
  /** Lerp factor for wheel smoothing. Default 0.1 (lambda 6). */
  lerp?: number;
  /** Scale wheel input distance. Default 1. */
  wheelMultiplier?: number;
  /** Default duration for programmatic scrollTo. */
  duration?: number;
  /** Default easing for programmatic scrollTo. */
  easing?: Easing | EasingName;
}

export interface ScrollToOptions {
  /** Offset in px added to the target. */
  offset?: number;
  /** Jump immediately without animation. */
  immediate?: boolean;
  /** Animation duration in ms. */
  duration?: number;
  /** Easing for the animation. */
  easing?: Easing | EasingName;
  /** Called when the scroll completes. */
  onComplete?: () => void;
}

export interface ScrollState {
  scroll: number;
  velocity: number;
  direction: -1 | 0 | 1;
  progress: number;
  limit: number;
  isScrolling: "smooth" | "native" | false;
}

export interface SmoothScrollControls {
  scroll: Accessor<number>;
  velocity: Accessor<number>;
  direction: Accessor<-1 | 0 | 1>;
  progress: Accessor<number>;
  scrollTo: (target: number | string | HTMLElement, opts?: ScrollToOptions) => Promise<void>;
  stop: () => void;
  start: () => void;
  onScroll: (cb: (s: ScrollState) => void) => () => void;
  dispose: () => void;
}

const expoOut: Easing = (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

/**
 * Buttery smooth scrolling, Lenis-grade.
 *
 * Keeps native scroll position real (`window.scrollY`) so `position: sticky`,
 * anchors, find-in-page, and IntersectionObserver keep working. The page
 * never fakes scroll with transforms.
 *
 * Three-value model: `targetScroll` (user intent) / `animatedScroll`
 * (rendered) / `actualScroll` (browser). Wheel input is prevented and added
 * to the target; each rAF tick moves the animated value toward the target
 * with frame-rate independent damping, then writes it back.
 *
 * Touch stays native in v1 (no touchmove interception). Window-only,
 * vertical-only.
 *
 * Required CSS (document in your stylesheet):
 * ```css
 * .drift-smooth { scroll-behavior: auto !important; }
 * .drift-stopped { overflow: clip; }
 * ```
 * Do not combine with CSS scroll-snap.
 *
 * Under reduced motion, wheel tracks 1:1 (no smoothing, same pipeline)
 * and programmatic scrollTo jumps immediately.
 *
 * ```ts
 * const smooth = createSmoothScroll({ lerp: 0.1 });
 * smooth.onScroll(({ scroll, velocity }) => {
 *   // drive parallax, progress bars, scrub primitives
 * });
 * await smooth.scrollTo("#features");
 * smooth.dispose();
 * ```
 */
export function createSmoothScroll(
  opts: SmoothScrollOptions = {},
): SmoothScrollControls {
  const {
    lerp = 0.1,
    wheelMultiplier = 1,
    duration = 1000,
  } = opts;
  const defaultEasing = resolveEasing(opts.easing ?? expoOut);

  const [scroll, setScroll] = createSignal(0);
  const [velocity, setVelocity] = createSignal(0);
  const [direction, setDirection] = createSignal<-1 | 0 | 1>(0);
  const [progress, setProgress] = createSignal(0);

  const isSSR = typeof window === "undefined";

  let targetScroll = 0;
  let animatedScroll = 0;
  let isStopped = false;
  let isSmoothScrolling = false; // we're driving (vs native)
  let preventNextNative = false;
  let cancelTick: (() => void) | null = null;
  let lastTickT = 0;
  let lastEmitT = 0;
  let lastEmitY = 0;
  let velocityZeroTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  // Programmatic scroll state (duration/easing mode).
  let progActive = false;
  let progFrom = 0;
  let progTo = 0;
  let progStart = 0;
  let progDuration = 0;
  let progEasing: Easing = defaultEasing;
  let progResolve: (() => void) | null = null;
  let progOnComplete: (() => void) | null = null;

  const scrollCallbacks = new Set<(s: ScrollState) => void>();

  function limit(): number {
    if (isSSR) return 0;
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function emit(isScrolling: ScrollState["isScrolling"]): void {
    const y = animatedScroll;
    const lim = limit();
    setScroll(y);
    setProgress(lim > 0 ? y / lim : 0);
    const state: ScrollState = {
      scroll: y,
      velocity: velocity(),
      direction: direction(),
      progress: lim > 0 ? y / lim : 0,
      limit: lim,
      isScrolling,
    };
    for (const cb of [...scrollCallbacks]) {
      try {
        cb(state);
      } catch {
        // ignore
      }
    }
  }

  function trackVelocity(y: number): void {
    const t = now();
    const dt = Math.max(t - lastEmitT, 1);
    const v = ((y - lastEmitY) / dt) * 16.7; // px per frame
    setVelocity(v);
    setDirection(v > 0.1 ? 1 : v < -0.1 ? -1 : 0);
    lastEmitT = t;
    lastEmitY = y;
    if (velocityZeroTimer) clearTimeout(velocityZeroTimer);
    velocityZeroTimer = setTimeout(() => {
      setVelocity(0);
      setDirection(0);
    }, 400);
  }

  function writeScroll(y: number): void {
    if (isSSR) return;
    preventNextNative = true;
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  }

  function ensureTick(): void {
    if (cancelTick || isSSR || disposed) return;
    lastTickT = now();
    cancelTick = schedule((t: number) => {
      if (disposed) {
        cancelTick = null;
        return false;
      }
      const dt = Math.min((t - lastTickT) / 1000, 0.1);
      lastTickT = t;

      if (progActive) {
        // Duration/easing mode for programmatic scrollTo.
        const p = Math.min((t - progStart) / Math.max(progDuration, 1), 1);
        const eased = progEasing(p);
        animatedScroll = progFrom + (progTo - progFrom) * eased;
        targetScroll = animatedScroll;
        writeScroll(animatedScroll);
        trackVelocity(animatedScroll);
        emit("smooth");
        if (p >= 1) {
          progActive = false;
          isSmoothScrolling = false;
          cancelTick = null;
          progResolve?.();
          progResolve = null;
          progOnComplete?.();
          progOnComplete = null;
          emit(false);
          return false;
        }
        return true;
      }

      // Lerp mode for wheel smoothing.
      const reduced = prefersReducedMotion();
      const lambda = reduced ? 1000 : lerp * 60; // lerp=1 effectively when reduced
      const next = reduced
        ? targetScroll
        : damp(animatedScroll, targetScroll, lambda, dt);
      // Snap when close.
      animatedScroll = Math.abs(next - targetScroll) < 0.5 ? targetScroll : next;
      if (animatedScroll !== lastEmitY || isSmoothScrolling) {
        writeScroll(animatedScroll);
        trackVelocity(animatedScroll);
        emit("smooth");
      }
      if (animatedScroll === targetScroll && !progActive) {
        isSmoothScrolling = false;
        cancelTick = null;
        emit(false);
        return false;
      }
      return true;
    });
  }

  function normalizeWheel(e: WheelEvent): number {
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16.67; // lines
    else if (e.deltaMode === 2) delta *= window.innerHeight; // pages
    return delta * wheelMultiplier;
  }

  function onWheel(e: WheelEvent): void {
    if (disposed || isStopped) return;
    // Exclusion gauntlet: pinch-zoom never intercepted.
    if (e.ctrlKey) return;
    // Nodes with data-drift-prevent opt out (e.g. nested scrollers).
    const path = e.composedPath?.() ?? [];
    const HTMLEl = typeof HTMLElement !== "undefined" ? HTMLElement : null;
    for (const node of path) {
      if (
        HTMLEl &&
        node instanceof HTMLEl &&
        (node as HTMLElement).hasAttribute("data-drift-prevent")
      ) {
        return;
      }
      // Fallback for test environments without HTMLElement.
      if (
        !HTMLEl &&
        node &&
        typeof (node as unknown as { hasAttribute?: (n: string) => boolean }).hasAttribute === "function" &&
        (node as unknown as { hasAttribute: (n: string) => boolean }).hasAttribute("data-drift-prevent")
      ) {
        return;
      }
    }
    e.preventDefault();
    // User input wins: retarget even mid programmatic scroll.
    if (progActive) {
      progActive = false;
      progResolve?.();
      progResolve = null;
      progOnComplete = null;
    }
    const lim = limit();
    targetScroll = Math.min(Math.max(targetScroll + normalizeWheel(e), 0), lim);
    isSmoothScrolling = true;
    ensureTick();
  }

  function onNativeScroll(): void {
    if (disposed || isSSR) return;
    if (preventNextNative) {
      preventNextNative = false;
      return;
    }
    if (isSmoothScrolling) return; // our own write, already handled
    // Browser scrolled on its own (keyboard, scrollbar, touch): re-sync.
    const y = window.scrollY;
    targetScroll = y;
    animatedScroll = y;
    trackVelocity(y);
    emit("native");
  }

  function onResize(): void {
    if (disposed || isSSR) return;
    const lim = limit();
    targetScroll = Math.min(targetScroll, lim);
    animatedScroll = Math.min(animatedScroll, lim);
    emit(false);
  }

  function resolveTarget(target: number | string | HTMLElement): number {
    if (typeof target === "number") return target;
    if (isSSR) return 0;
    let el: HTMLElement | null = null;
    if (target instanceof HTMLElement) {
      el = target;
    } else {
      // getElementById first: handles weird ids that querySelector chokes on.
      const id = target.startsWith("#") ? target.slice(1) : target;
      el = document.getElementById(id) ?? document.querySelector(target);
    }
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const scrollMargin = parseFloat(style.scrollMarginTop || "0") || 0;
    const rootStyle = getComputedStyle(document.documentElement);
    const scrollPadding = parseFloat(rootStyle.scrollPaddingTop || "0") || 0;
    return rect.top + animatedScroll - scrollMargin - scrollPadding;
  }

  function scrollTo(
    target: number | string | HTMLElement,
    sopts: ScrollToOptions = {},
  ): Promise<void> {
    if (isSSR || disposed) return Promise.resolve();
    const {
      offset = 0,
      immediate = false,
      onComplete,
    } = sopts;
    const sduration = sopts.duration ?? duration;
    const seasing = resolveEasing(sopts.easing ?? defaultEasing);

    let dest = Math.min(Math.max(resolveTarget(target) + offset, 0), limit());

    if (immediate || prefersReducedMotion()) {
      // Cancel any in-flight animation and jump.
      if (cancelTick) {
        cancelTick();
        cancelTick = null;
      }
      progActive = false;
      progResolve?.();
      progResolve = null;
      targetScroll = dest;
      animatedScroll = dest;
      writeScroll(dest);
      trackVelocity(dest);
      emit(false);
      // Let the echo scroll event through then suppress it.
      preventNextNative = true;
      onComplete?.();
      return Promise.resolve();
    }

    // Cancel previous programmatic scroll; the new one wins.
    progResolve?.();
    progActive = true;
    progFrom = animatedScroll;
    progTo = dest;
    progStart = now();
    progDuration = sduration;
    progEasing = seasing;
    progOnComplete = onComplete ?? null;
    isSmoothScrolling = true;
    ensureTick();
    return new Promise<void>((resolve) => {
      progResolve = resolve;
    });
  }

  function stop(): void {
    if (isSSR || disposed) return;
    isStopped = true;
    document.documentElement.classList.add("drift-stopped");
  }

  function start(): void {
    if (isSSR || disposed) return;
    isStopped = false;
    document.documentElement.classList.remove("drift-stopped");
  }

  function onScroll(cb: (s: ScrollState) => void): () => void {
    scrollCallbacks.add(cb);
    return () => {
      scrollCallbacks.delete(cb);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (cancelTick) {
      cancelTick();
      cancelTick = null;
    }
    if (velocityZeroTimer) clearTimeout(velocityZeroTimer);
    progResolve?.();
    progResolve = null;
    scrollCallbacks.clear();
    if (!isSSR) {
      window.removeEventListener("wheel", onWheel as EventListener);
      window.removeEventListener("scroll", onNativeScroll);
      window.removeEventListener("resize", onResize);
      document.documentElement.classList.remove("drift-stopped");
      document.documentElement.classList.remove("drift-smooth");
    }
  }

  if (!isSSR) {
    targetScroll = window.scrollY;
    animatedScroll = window.scrollY;
    lastEmitY = window.scrollY;
    lastEmitT = now();
    document.documentElement.classList.add("drift-smooth");
    window.addEventListener("wheel", onWheel as EventListener, { passive: false });
    window.addEventListener("scroll", onNativeScroll, { passive: true });
    window.addEventListener("resize", onResize);
  }

  onCleanup(dispose);

  return {
    scroll,
    velocity,
    direction,
    progress,
    scrollTo,
    stop,
    start,
    onScroll,
    dispose,
  };
}
