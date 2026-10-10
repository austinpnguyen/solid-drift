import { createSignal, onCleanup, type Accessor } from "solid-js";
import { now, schedule } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

/** A nested sequence that can be added as a step of another sequence. */
export interface NestedSequence {
  /** @internal total duration for nesting. */
  readonly totalMs: number;
  /** @internal render at an absolute sequence time. */
  readonly renderAt: (ms: number) => void;
}

/**
 * Position parameter for a sequence step, following GSAP semantics.
 *
 * - `"<"` start of the previous step, `">"` end of the previous step
 *   (default when omitted).
 * - `"<+=100"` / `">-=200"`: offset from previous step start/end.
 * - `"-=300"` / `"+=100"`: offset relative to the end of the timeline
 *   built so far.
 * - `number`: absolute milliseconds from the sequence start.
 * - `"label"` / `"label+=100"`: a label registered with addLabel().
 */
export type SequenceAt =
  | number
  | "<"
  | ">"
  | (string & {});

export interface SequenceStep {
  /** Element to animate. Null targets are skipped silently. */
  target: () => HTMLElement | null | undefined;
  /**
   * Properties to animate. Each key is either a `[from, to]` pair or a
   * keyframes array with 3+ values (evenly spaced across the duration).
   * Transform shortcuts: `x`, `y`, `z` (px), `scale`, `scaleX`, `scaleY`,
   * `rotation` (deg). Anything else is set as a CSS property; plain
   * numbers become px except for known unitless props like `opacity`.
   */
  props: Record<string, [number, number] | number[]>;
  /** Duration in milliseconds. */
  duration: number;
  /** Where to place this step. Default `">"`. */
  at?: SequenceAt;
  /** Easing function or name. Default "easeOutCubic". */
  easing?: Easing | EasingName;
  /** Extra delay before this step starts, in milliseconds. */
  delay?: number;
  /** Called when this step starts playing. */
  onStart?: () => void;
  /** Called when this step completes. */
  onComplete?: () => void;
}

export type SequenceStatus = "idle" | "playing" | "paused" | "done";

export interface SequenceControls extends NestedSequence {
  /** Play from the current position. Resolves when the sequence ends. */
  play: () => Promise<void>;
  /** Pause wherever the playhead is. */
  pause: () => void;
  /** Resume after pause. */
  resume: () => void;
  /** Play backwards from the current position to 0. */
  reverse: () => Promise<void>;
  /** Jump to a time; every step renders its correct state. */
  seek: (ms: number) => void;
  /** Playback speed multiplier. 1 is normal. */
  timeScale: (n: number) => void;
  /** Register a label at a position for later `at` references. */
  addLabel: (name: string, at: SequenceAt) => void;
  /** Append a step (or a nested sequence) to the end of the layout. */
  add: (step: SequenceStep | NestedSequence) => void;
  /** Total duration in milliseconds, computed from the layout. */
  duration: Accessor<number>;
  /** Reactive status. */
  status: Accessor<SequenceStatus>;
  /** Stop everything and release the engine task. */
  dispose: () => void;
}

interface ResolvedStep {
  start: number;
  end: number;
  step: SequenceStep;
  easing: Easing;
  started: boolean;
  completed: boolean;
}

const TRANSFORM_PROPS: Record<string, (v: number) => string> = {
  x: (v) => `translateX(${v}px)`,
  y: (v) => `translateY(${v}px)`,
  z: (v) => `translateZ(${v}px)`,
  scale: (v) => `scale(${v})`,
  scaleX: (v) => `scaleX(${v})`,
  scaleY: (v) => `scaleY(${v})`,
  rotation: (v) => `rotate(${v}deg)`,
};

/** CSS props that take unitless numbers. */
const UNITLESS = new Set([
  "opacity",
  "zIndex",
  "z-index",
  "flexGrow",
  "flex-grow",
  "flexShrink",
  "flex-shrink",
  "order",
  "fontWeight",
  "font-weight",
  "lineHeight",
  "line-height",
]);

function toCssProp(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function setProp(el: HTMLElement, key: string, value: number): void {
  const transform = TRANSFORM_PROPS[key] as ((v: number) => string) | undefined;
  if (transform !== undefined) {
    // Compose with any existing transform parts we manage. Steps own
    // their props, so we rebuild the transform from this step's keys.
    // (Cross-step transform composition is handled per element below.)
    el.dataset[`driftSeq${key}`] = String(value);
    rebuildTransform(el);
    return;
  }
  const cssKey = toCssProp(key);
  const cssValue = UNITLESS.has(key) || UNITLESS.has(cssKey)
    ? String(value)
    : `${value}px`;
  el.style.setProperty(cssKey, cssValue);
}

function rebuildTransform(el: HTMLElement): void {
  const parts: string[] = [];
  for (const key of Object.keys(TRANSFORM_PROPS)) {
    const raw = el.dataset[`driftSeq${key}`];
    if (raw !== undefined) parts.push(TRANSFORM_PROPS[key](Number(raw)));
  }
  // Preserve any transform the page set itself outside the sequence.
  const own = el.dataset.driftSeqOwn ?? "";
  el.style.transform = (own ? `${own} ` : "") + parts.join(" ");
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Value of a keyframes array at progress t (evenly spaced). */
function keyframeValue(frames: number[], t: number): number {
  if (frames.length === 0) return 0;
  if (frames.length === 1) return frames[0];
  const scaled = t * (frames.length - 1);
  const i = Math.min(Math.floor(scaled), frames.length - 2);
  const local = scaled - i;
  return lerp(frames[i], frames[i + 1], local);
}

function stepValue(frames: [number, number] | number[], t: number): number {
  return keyframeValue(frames as number[], t);
}

/**
 * Choreographed timeline with overlap, labels, and nesting.
 *
 * Unlike `createTimeline` (strictly sequential), steps can overlap using
 * GSAP-style position parameters: `"<"`, `">"`, `"-=300"`, labels, and
 * absolute times. Steps animate CSS props on their target; transform
 * shortcuts (`x`, `y`, `scale`, `rotation`) compose into the transform
 * string without clobbering each other.
 *
 * `seek(ms)` renders every step at its correct state for any time, which
 * makes scrub-driven storytelling trivial: wire a scroll progress value
 * straight into `seek`. `reverse()` plays back to 0 from the playhead.
 *
 * Under reduced motion `play()` applies every end value immediately and
 * still resolves. SSR-safe: renders end values with no timers.
 *
 * ```ts
 * const intro = createSequence()
 * intro.addLabel("headlineIn", 0)
 * intro.add({
 *   target: () => titleEl,
 *   props: { y: [24, 0], opacity: [0, 1] },
 *   duration: 500, at: "headlineIn",
 * })
 * intro.add({
 *   target: () => ctaEl,
 *   props: { y: [16, 0], opacity: [0, 1] },
 *   duration: 400, at: "-=200", // overlap the previous step by 200ms
 * })
 * await intro.play()
 * ```
 */
export function createSequence(
  steps: (SequenceStep | NestedSequence)[] = [],
): SequenceControls {
  const [status, setStatus] = createSignal<SequenceStatus>("idle");
  const [durationMs, setDurationMs] = createSignal(0);

  let resolved: ResolvedStep[] = [];
  let nested: { start: number; controls: NestedSequence }[] = [];
  const labels = new Map<string, number>();
  let totalMs = 0;

  // Playback state
  let playhead = 0;
  let direction: 1 | -1 = 1;
  let scale = 1;
  let cancelTick: (() => void) | null = null;
  let lastTick = 0;
  let runToken = 0;
  let resolvePlay: (() => void) | null = null;

  const isNestedControls = (
    s: SequenceStep | NestedSequence,
  ): s is NestedSequence =>
    typeof (s as NestedSequence).renderAt === "function";

  function resolveAt(
    at: SequenceAt | undefined,
    prevStart: number,
    prevEnd: number,
  ): number {
    if (at === undefined || at === ">") return prevEnd;
    if (at === "<") return prevStart;
    if (typeof at === "number") {
      if (at < 0) throw new Error(`createSequence: at (${at}) must be >= 0`);
      return at;
    }
    const rel = /^(-|\+)=(\d+)$/.exec(at);
    if (rel) {
      const n = Number(rel[2]);
      return Math.max(0, totalMs + (rel[1] === "-" ? -n : n));
    }
    const fromPrev = /^(<|>)([+-])=(\d+)$/.exec(at);
    if (fromPrev) {
      const base = fromPrev[1] === "<" ? prevStart : prevEnd;
      const n = Number(fromPrev[3]);
      return Math.max(0, base + (fromPrev[2] === "+" ? n : -n));
    }
    // Label or "label+=offset".
    const labelRef = /^([A-Za-z_][\w-]*)([+-]=(\d+))?$/.exec(at);
    if (labelRef) {
      const pos = labels.get(labelRef[1]);
      if (pos === undefined) {
        throw new Error(
          `createSequence: unknown label "${labelRef[1]}". Register it with addLabel() first.`,
        );
      }
      const offset = labelRef[2]
        ? Number(labelRef[3]) * (labelRef[2][0] === "+" ? 1 : -1)
        : 0;
      return Math.max(0, pos + offset);
    }
    throw new Error(`createSequence: invalid at value "${at}"`);
  }

  function layout(items: (SequenceStep | NestedSequence)[]): void {
    resolved = [];
    nested = [];
    totalMs = 0;
    let prevStart = 0;
    let prevEnd = 0;
    for (const item of items) {
      if (isNestedControls(item)) {
        const start = prevEnd;
        nested.push({ start, controls: item });
        prevStart = start;
        prevEnd = start + item.totalMs;
        totalMs = Math.max(totalMs, prevEnd);
        continue;
      }
      const duration = Math.max(0, item.duration);
      const delay = Math.max(0, item.delay ?? 0);
      const start = resolveAt(item.at, prevStart, prevEnd) + delay;
      const end = start + duration;
      resolved.push({
        start,
        end,
        step: item,
        easing: resolveEasing(item.easing ?? "easeOutCubic"),
        started: false,
        completed: false,
      });
      prevStart = start;
      prevEnd = end;
      totalMs = Math.max(totalMs, end);
    }
    setDurationMs(totalMs);
  }

  let items: (SequenceStep | NestedSequence)[] = [...steps];
  layout(items);

  function renderStep(r: ResolvedStep, ms: number): void {
    const el = r.step.target();
    if (!el) return;
    const span = Math.max(r.end - r.start, 0.001);
    const t = Math.min(Math.max((ms - r.start) / span, 0), 1);
    const eased = r.easing(t);
    for (const key of Object.keys(r.step.props)) {
      setProp(el, key, stepValue(r.step.props[key], eased));
    }
  }

  function renderAt(ms: number): void {
    const clamped = Math.min(Math.max(ms, 0), totalMs);
    for (const r of resolved) renderStep(r, clamped);
    for (const n of nested) n.controls.renderAt(clamped - n.start);
    playhead = clamped;
  }

  function clearTick(): void {
    cancelTick?.();
    cancelTick = null;
  }

  function finishRun(completed: boolean): void {
    clearTick();
    const token = runToken;
    void token;
    if (completed) {
      for (const r of resolved) {
        if (!r.completed && direction === 1) {
          r.completed = true;
          r.step.onComplete?.();
        }
        if (!r.started && direction === -1) {
          r.started = false;
        }
      }
      setStatus("done");
    }
    resolvePlay?.();
    resolvePlay = null;
  }

  function tickLoop(): void {
    clearTick();
    if (typeof window === "undefined") return;
    lastTick = now();
    cancelTick = schedule((t: number) => {
      const dt = (t - lastTick) * scale;
      lastTick = t;
      const next = playhead + dt * direction;

      // Fire per-step callbacks on crossings.
      for (const r of resolved) {
        const el = r.step.target();
        if (direction === 1) {
          if (!r.started && next >= r.start && playhead < r.start) {
            r.started = true;
            if (el) r.step.onStart?.();
          }
          if (!r.completed && next >= r.end) {
            r.completed = true;
            if (el) r.step.onComplete?.();
          }
        } else {
          if (r.completed && next < r.end && playhead >= r.end) {
            r.completed = false;
          }
          if (r.started && next < r.start) {
            r.started = false;
          }
        }
      }

      if (direction === 1 && next >= totalMs) {
        renderAt(totalMs);
        finishRun(true);
        return false;
      }
      if (direction === -1 && next <= 0) {
        renderAt(0);
        finishRun(true);
        return false;
      }
      renderAt(next);
      return true;
    });
  }

  function startRun(dir: 1 | -1): Promise<void> {
    // New run invalidates the previous play() promise.
    runToken++;
    clearTick();
    resolvePlay?.();
    direction = dir;

    if (prefersReducedMotion() || typeof window === "undefined") {
      renderAt(dir === 1 ? totalMs : 0);
      for (const r of resolved) {
        r.started = dir === 1;
        r.completed = dir === 1;
        if (dir === 1) {
          r.step.onStart?.();
          r.step.onComplete?.();
        }
      }
      setStatus("done");
      return Promise.resolve();
    }

    // Reset per-step flags when starting from an endpoint.
    if ((dir === 1 && playhead >= totalMs) || (dir === -1 && playhead <= 0)) {
      for (const r of resolved) {
        r.started = false;
        r.completed = false;
      }
    }

    setStatus("playing");
    return new Promise<void>((resolve) => {
      resolvePlay = resolve;
      tickLoop();
    });
  }

  const controls: SequenceControls = {
    play: () => startRun(1),
    pause: () => {
      if (status() !== "playing") return;
      clearTick();
      setStatus("paused");
    },
    resume: () => {
      if (status() !== "paused") return;
      setStatus("playing");
      tickLoop();
    },
    reverse: () => startRun(-1),
    seek: (ms: number) => {
      clearTick();
      for (const r of resolved) {
        r.started = ms >= r.start;
        r.completed = ms >= r.end;
      }
      renderAt(ms);
      setStatus("idle");
      resolvePlay?.();
      resolvePlay = null;
    },
    timeScale: (n: number) => {
      if (n > 0 && Number.isFinite(n)) scale = n;
    },
    addLabel: (name: string, at: SequenceAt) => {
      labels.set(name, resolveAt(at, 0, totalMs));
    },
    add: (step: SequenceStep | NestedSequence) => {
      items.push(step);
      layout(items);
    },
    duration: durationMs,
    status,
    dispose: () => {
      runToken++;
      clearTick();
      resolvePlay?.();
      resolvePlay = null;
      setStatus("idle");
    },
    get totalMs() {
      return totalMs;
    },
    renderAt,
  };

  onCleanup(() => controls.dispose());

  return controls;
}
