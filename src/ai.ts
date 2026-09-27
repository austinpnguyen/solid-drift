/**
 * Streaming-text and agent-state family: motion primitives for
 * conversational interfaces.
 *
 * Token streams arrive in bursts, so `createStreamReveal` batches them
 * into a readable cadence before animating each unit's entrance.
 * `createAgentState` is a pure-signal state machine for agent
 * status, kept free of motion so each state can pair with any
 * primitive. `parseDriftSpec` and `createSpecPlayer` let generated
 * JSON choreography be validated and rendered deterministically.
 *
 * All primitives are signal-native, SSR-safe, dependency-free, and
 * define sensible static behavior under `prefers-reduced-motion`.
 */

import {
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import { animate } from "./animate.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { now, schedule } from "./engine.js";
import {
  createBeat,
  createCamera,
  createColorShift,
  createKineticType,
  createTransition,
  type BeatOptions,
  type CameraKeyframe,
  type ColorShiftOptions,
  type KineticTypeFrom,
  type KineticTypeOptions,
  type TransitionOptions,
} from "./motion.js";
import type { ColorStop } from "./color.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { appendUnits } from "./text.js";
import {
  createAgentTx,
  type AgentTxControls,
  type AgentTxProposal,
} from "./web3.js";
import { createTxReceipt } from "./web3data.js";
import { isAddress } from "./web3data.js";

/** Re-exported for `SpecPlayerHooks` consumers. */
export type { AgentTxProposal, AgentTxControls };

type MaybeElement = () => Element | null | undefined;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Round to 2 decimals for style values. */
function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/* ------------------------------------------------------------------ */
/* createStreamReveal                                                  */
/* ------------------------------------------------------------------ */

export type StreamRevealStatus = "idle" | "streaming" | "done";

export interface StreamRevealOptions {
  /** Split into "chars" or "words". Default "chars". */
  unit?: "chars" | "words";
  /** Flush the batch queue on this cadence, in ms. Default 120. */
  batchMs?: number;
  /** Flush early when the queue grows past this many chars. Default 24. */
  maxBatch?: number;
  /** Entrance duration per unit, in ms. Default 450. */
  duration?: number;
  /** Milliseconds between unit starts. Default 30. */
  stagger?: number;
  /** Starting transform/opacity/blur for each unit. */
  from?: KineticTypeFrom;
  /** Easing for each unit's entrance. Default "easeOutExpo". */
  easing?: Easing | EasingName;
}

export interface StreamRevealControls {
  /** Append raw stream tokens; they are batched internally. */
  push: (chunk: string) => void;
  /** Flush remaining units and settle. */
  complete: () => void;
  /** Clear the text and return to idle. */
  reset: () => void;
  /** Reactive status: "idle" | "streaming" | "done". */
  status: Accessor<StreamRevealStatus>;
  /** Chars waiting in the batch queue. */
  pending: Accessor<number>;
}

/**
 * Smooth irregular token cadence into readable animated text.
 *
 * Stream tokens arrive in bursts, a flood, then silence. `push()`
 * only appends to an internal queue; one rAF task flushes the queue
 * on a steady cadence (or early when it overflows) and drives every
 * unit's entrance, so a 40-token burst reads as a calm typed line
 * instead of a flicker.
 *
 * SSR-safe: `push` is a no-op on the server, `status()` is "done",
 * and the host renders the full text statically. Under reduced motion
 * batching and entrances are skipped: text appears as it is pushed.
 *
 * ```tsx
 * let out!: HTMLDivElement
 * const stream = createStreamReveal(() => out, { unit: "chars" })
 * const reader = response.body.getReader()
 * onMount(async () => {
 *   for (;;) {
 *     const { done, value } = await reader.read()
 *     if (done) break
 *     stream.push(decoder.decode(value))
 *   }
 *   stream.complete()
 * })
 * <div ref={out} aria-live="polite" />
 * ```
 */
export function createStreamReveal(
  ref: MaybeElement,
  options: StreamRevealOptions = {},
): StreamRevealControls {
  const {
    unit = "chars",
    batchMs = 120,
    maxBatch = 24,
    duration = 450,
    stagger = 30,
    easing: easingOpt = "easeOutExpo",
  } = options;
  const from = {
    y: options.from?.y ?? 28,
    blur: options.from?.blur ?? 10,
    scale: options.from?.scale ?? 0.85,
    opacity: options.from?.opacity ?? 0,
    rotate: options.from?.rotate ?? 0,
  };
  const easing = resolveEasing(easingOpt);
  const server = typeof window === "undefined";

  const [status, setStatus] =
    createSignal<StreamRevealStatus>(server ? "done" : "idle");
  const [pending, setPending] = createSignal(0);

  interface Unit {
    el: HTMLElement;
    startAt: number;
  }
  let queue = "";
  let units: Unit[] = [];
  let unitIndex = 0;
  let cancel: (() => void) | null = null;
  let lastFlush = 0;
  let settling = false;

  const applyEntrance = (el: HTMLElement, e: number): void => {
    const t = 1 - e;
    el.style.transform =
      `translateY(${fmt(from.y * t)}px) scale(${fmt(from.scale + (1 - from.scale) * e)}) rotate(${fmt(from.rotate * t)}deg)`;
    const blur = from.blur * t;
    el.style.filter = blur > 0.05 ? `blur(${fmt(blur)}px)` : "none";
    el.style.opacity = fmt(from.opacity + (1 - from.opacity) * e);
  };

  const flush = (t: number): void => {
    const el = ref();
    if (!el || queue.length === 0) {
      queue = "";
      setPending(0);
      return;
    }
    const batch = queue;
    queue = "";
    setPending(0);
    for (const span of appendUnits(el, batch, unit)) {
      units.push({ el: span, startAt: t + unitIndex * stagger });
      unitIndex++;
    }
  };

  const tick = (t: number): boolean => {
    if (
      queue.length > 0 &&
      (queue.length >= maxBatch || t - lastFlush >= batchMs)
    ) {
      flush(t);
      lastFlush = t;
    }
    let alive = false;
    units = units.filter((u) => {
      const local = clamp01((t - u.startAt) / duration);
      applyEntrance(u.el, easing(local));
      if (local < 1) alive = true;
      return local < 1;
    });
    if (queue.length > 0) alive = true;
    if (!alive) {
      cancel = null;
      if (settling) {
        settling = false;
        setStatus("done");
      }
    }
    return alive;
  };

  const ensureLoop = (): void => {
    if (cancel || server) return;
    lastFlush = now();
    cancel = schedule(tick);
  };

  const push = (chunk: string): void => {
    if (server || chunk.length === 0) return;
    if (prefersReducedMotion()) {
      // Accessibility: skip batching and entrances, show text at once.
      const el = ref();
      if (el) {
        for (const span of appendUnits(el, chunk, unit)) {
          void span;
        }
      }
      setPending(0);
      setStatus("streaming");
      return;
    }
    queue += chunk;
    setPending(queue.length);
    setStatus("streaming");
    ensureLoop();
  };

  const complete = (): void => {
    if (server) {
      setStatus("done");
      return;
    }
    if (prefersReducedMotion()) {
      queue = "";
      setPending(0);
      setStatus("done");
      return;
    }
    flush(now());
    if (units.length === 0 && queue.length === 0) {
      setStatus("done");
      return;
    }
    settling = true;
    ensureLoop();
  };

  const reset = (): void => {
    cancel?.();
    cancel = null;
    queue = "";
    units = [];
    unitIndex = 0;
    settling = false;
    setPending(0);
    if (!server) {
      const el = ref() as HTMLElement | null | undefined;
      el?.removeAttribute?.("aria-label");
      if (el) el.textContent = "";
      setStatus("idle");
    }
  };

  onCleanup(() => {
    cancel?.();
    cancel = null;
  });

  return { push, complete, reset, status, pending };
}

/* ------------------------------------------------------------------ */
/* createAgentState                                                    */
/* ------------------------------------------------------------------ */

/** Lifecycle states of a conversational agent turn. */
export type AgentState =
  | "idle"
  | "thinking"
  | "streaming"
  | "tool-call"
  | "done"
  | "error";

/** One legal state change. */
export interface AgentStateTransition {
  from: AgentState;
  to: AgentState;
}

export interface AgentStateOptions {
  /** Starting state. Default "idle". */
  initial?: AgentState;
  /** Legal transitions. Omit to allow every transition. */
  allowed?: AgentStateTransition[];
  /** Called after entering a state, with the previous state. */
  onEnter?: (state: AgentState, prev: AgentState) => void;
  /** Called before leaving a state, with the next state. */
  onExit?: (state: AgentState, next: AgentState) => void;
}

export interface AgentStateControls {
  /** Current state. */
  state: Accessor<AgentState>;
  /** Previous state. */
  prev: Accessor<AgentState>;
  /** Move to the next state. Illegal transitions are ignored. */
  set: (next: AgentState) => void;
  /** Return to the initial state. */
  reset: () => void;
  /** Convenience for class bindings: `agent.is("thinking")`. */
  is: (s: AgentState) => boolean;
}

/**
 * A pure-signal state machine for agent UI.
 *
 * Motion is deliberately not built in: pair each state with a recipe
 * instead, so the machine stays transparent, testable, and SSR-safe.
 * A typical pairing is `createWobble` on typing dots while "thinking",
 * `createStreamReveal` while "streaming", `createTransition` for the
 * "tool-call" overlay, and `createColorShift` on the status pill for
 * "done"/"error". Each of those degrades on its own under reduced
 * motion.
 *
 * SSR-safe by construction: signals only, no DOM, no clock.
 *
 * ```ts
 * const agent = createAgentState()
 * agent.set("thinking")
 * agent.state() // "thinking"
 * agent.is("streaming") // false
 * ```
 */
export function createAgentState(
  options: AgentStateOptions = {},
): AgentStateControls {
  const { initial = "idle", allowed, onEnter, onExit } = options;
  const [state, setState] = createSignal<AgentState>(initial);
  const [prev, setPrev] = createSignal<AgentState>(initial);

  const legal = (from: AgentState, to: AgentState): boolean => {
    if (!allowed) return true;
    return allowed.some((t) => t.from === from && t.to === to);
  };

  const move = (next: AgentState): void => {
    const current = state();
    if (next === current || !legal(current, next)) return;
    onExit?.(current, next);
    setPrev(current);
    setState(next);
    onEnter?.(next, current);
  };

  const reset = (): void => {
    move(initial);
  };

  return {
    state,
    prev,
    set: move,
    reset,
    is: (s) => state() === s,
  };
}

/* ------------------------------------------------------------------ */
/* DriftSpec: schema, validator, player                                */
/* ------------------------------------------------------------------ */

/** Primitives a drift spec can choreograph. */
export type DriftSpecPrimitive =
  | "kineticType"
  | "camera"
  | "colorShift"
  | "transition"
  | "beat"
  | "streamReveal"
  | "agentTx"
  | "txReceipt";

/** One choreographed step. */
export interface DriftSpecStep {
  /** Which primitive renders this step. */
  primitive: DriftSpecPrimitive;
  /**
   * Key into the refs record given to `createSpecPlayer`. Required
   * for primitives that render into an element ("kineticType" and
   * "streamReveal").
   */
  target?: string;
  /**
   * Primitive options. Validated against each primitive's minimal
   * shape. "camera" reads `keyframes`, "colorShift" reads `stops`,
   * "streamReveal" reads `text`, "agentTx" reads `to`, `description`,
   * `value`, `data`, `chainId` and `autoApprove`, "txReceipt" reads
   * `hash`, `endpoint` and `timeout`.
   */
  options?: Record<string, unknown>;
  /** Step budget in milliseconds, for timed players. */
  duration?: number;
}

/** A deterministic motion choreography, usually generated as JSON. */
export interface DriftSpec {
  version: 1;
  scenes: DriftSpecStep[];
}

/**
 * Thrown by `parseDriftSpec`. `path` pinpoints the invalid value
 * (for example "scenes[2].options.duration") so a generator can
 * repair the spec without guessing.
 */
export class DriftSpecError extends Error {
  /** Dot/bracket path to the invalid value, "" for the root. */
  path: string;
  constructor(path: string, message: string) {
    super(
      path
        ? `Invalid drift spec at "${path}": ${message}`
        : `Invalid drift spec: ${message}`,
    );
    this.name = "DriftSpecError";
    this.path = path;
  }
}

const PRIMITIVES: readonly DriftSpecPrimitive[] = [
  "kineticType",
  "camera",
  "colorShift",
  "transition",
  "beat",
  "streamReveal",
  "agentTx",
  "txReceipt",
];

/** Primitives that render into an element and need a target key. */
const DOM_PRIMITIVES: readonly DriftSpecPrimitive[] = [
  "kineticType",
  "streamReveal",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertPositiveNumber(
  value: unknown,
  path: string,
): asserts value is number {
  if (typeof value !== "number" || !(value > 0)) {
    throw new DriftSpecError(path, "expected a positive number");
  }
}

function checkOptions(
  primitive: DriftSpecPrimitive,
  options: Record<string, unknown>,
  base: string,
): void {
  const at = (key: string): string => `${base}.options.${key}`;
  switch (primitive) {
    case "kineticType":
      if (options.duration !== undefined) {
        assertPositiveNumber(options.duration, at("duration"));
      }
      if (options.stagger !== undefined) {
        assertPositiveNumber(options.stagger, at("stagger"));
      }
      break;
    case "camera":
      if (
        options.keyframes !== undefined &&
        !Array.isArray(options.keyframes)
      ) {
        throw new DriftSpecError(at("keyframes"), "expected an array");
      }
      break;
    case "colorShift":
      if (options.stops !== undefined && !Array.isArray(options.stops)) {
        throw new DriftSpecError(at("stops"), "expected an array");
      }
      if (options.duration !== undefined) {
        assertPositiveNumber(options.duration, at("duration"));
      }
      break;
    case "transition":
      if (
        options.type !== undefined &&
        !["cut", "fade", "slide", "wipe"].includes(options.type as string)
      ) {
        throw new DriftSpecError(
          at("type"),
          'expected one of "cut", "fade", "slide", "wipe"',
        );
      }
      if (options.duration !== undefined) {
        assertPositiveNumber(options.duration, at("duration"));
      }
      break;
    case "beat":
      if (options.bpm !== undefined) {
        assertPositiveNumber(options.bpm, at("bpm"));
      }
      break;
    case "streamReveal":
      if (options.text !== undefined && typeof options.text !== "string") {
        throw new DriftSpecError(at("text"), "expected a string");
      }
      break;
    case "agentTx":
      if (typeof options.to !== "string" || !isAddress(options.to)) {
        throw new DriftSpecError(at("to"), "expected a valid 0x address");
      }
      if (
        typeof options.description !== "string" ||
        options.description.length === 0
      ) {
        throw new DriftSpecError(
          at("description"),
          "expected a non-empty string",
        );
      }
      if (options.value !== undefined && typeof options.value !== "string") {
        throw new DriftSpecError(at("value"), "expected a string");
      }
      if (options.data !== undefined && typeof options.data !== "string") {
        throw new DriftSpecError(at("data"), "expected a string");
      }
      if (options.chainId !== undefined) {
        assertPositiveNumber(options.chainId, at("chainId"));
      }
      if (
        options.autoApprove !== undefined &&
        typeof options.autoApprove !== "boolean"
      ) {
        throw new DriftSpecError(at("autoApprove"), "expected a boolean");
      }
      break;
    case "txReceipt":
      if (
        typeof options.hash !== "string" ||
        !/^0x[0-9a-fA-F]{64}$/.test(options.hash)
      ) {
        throw new DriftSpecError(at("hash"), "expected a 0x transaction hash");
      }
      if (
        options.endpoint !== undefined &&
        typeof options.endpoint !== "string"
      ) {
        throw new DriftSpecError(at("endpoint"), "expected a string");
      }
      if (options.timeout !== undefined) {
        assertPositiveNumber(options.timeout, at("timeout"));
      }
      break;
  }
}

/**
 * Validate unknown input against the DriftSpec schema and return the
 * typed spec. Throws `DriftSpecError` with a precise `path` on the
 * first invalid value.
 *
 * Pure validation, no DOM: safe to run on the server.
 *
 * ```ts
 * const spec = parseDriftSpec(JSON.parse(raw))
 * const player = createSpecPlayer(spec, { title: () => titleEl })
 * await player.play()
 * ```
 */
export function parseDriftSpec(input: unknown): DriftSpec {
  if (!isRecord(input)) {
    throw new DriftSpecError("", "expected an object");
  }
  if (input.version !== 1) {
    throw new DriftSpecError("version", "expected 1");
  }
  if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
    throw new DriftSpecError("scenes", "expected a non-empty array");
  }
  const scenes: DriftSpecStep[] = input.scenes.map((raw, i) => {
    const base = `scenes[${i}]`;
    if (!isRecord(raw)) {
      throw new DriftSpecError(base, "expected an object");
    }
    if (
      typeof raw.primitive !== "string" ||
      !(PRIMITIVES as readonly string[]).includes(raw.primitive)
    ) {
      throw new DriftSpecError(
        `${base}.primitive`,
        `expected one of ${PRIMITIVES.join(", ")}`,
      );
    }
    const primitive = raw.primitive as DriftSpecPrimitive;
    let target: string | undefined;
    if (raw.target !== undefined) {
      if (typeof raw.target !== "string" || raw.target.length === 0) {
        throw new DriftSpecError(
          `${base}.target`,
          "expected a non-empty string key",
        );
      }
      target = raw.target;
    } else if (DOM_PRIMITIVES.includes(primitive)) {
      throw new DriftSpecError(
        `${base}.target`,
        `"${primitive}" needs a target key into the refs record`,
      );
    }
    let specOptions: Record<string, unknown> | undefined;
    if (raw.options !== undefined) {
      if (!isRecord(raw.options)) {
        throw new DriftSpecError(`${base}.options`, "expected an object");
      }
      specOptions = raw.options;
      checkOptions(primitive, specOptions, base);
    }
    let duration: number | undefined;
    if (raw.duration !== undefined) {
      assertPositiveNumber(raw.duration, `${base}.duration`);
      duration = raw.duration;
    }
    return { primitive, target, options: specOptions, duration };
  });
  return { version: 1, scenes };
}

export type SpecPlayerStatus = "idle" | "running" | "done";

export interface SpecPlayerControls {
  /** Play every scene in order. Resolves after the last scene. */
  play: () => Promise<void>;
  /** Stop mid-spec. The play() promise resolves. */
  stop: () => void;
  /** Reactive status: "idle" | "running" | "done". */
  status: Accessor<SpecPlayerStatus>;
  /** Current scene index, or -1 before the first play(). */
  scene: Accessor<number>;
}

interface StepHandle {
  promise: Promise<void>;
  stop: () => void;
}

const noopHandle = (): StepHandle => ({
  promise: Promise.resolve(),
  stop: () => {},
});

/** Resolve when `isDone()` turns true, on the shared clock. */
function whenDone(isDone: () => boolean): StepHandle {
  let cancel: (() => void) | null = null;
  let resolveFn!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
    if (isDone()) {
      resolve();
      return;
    }
    cancel = schedule(() => {
      if (isDone()) {
        resolve();
        return false;
      }
      return true;
    });
  });
  return {
    promise,
    stop: () => {
      cancel?.();
      cancel = null;
      resolveFn();
    },
  };
}

/** Host hooks for spec steps that need the outside world. */
export interface SpecPlayerHooks {
  /**
   * Called when an "agentTx" step proposes its transaction. Show your
   * approval UI here and call `tx.approve()` / `tx.reject()` (then
   * `tx.execute()`) on the controls. The step waits for a terminal
   * state ("confirmed", "rejected", "failed"); `stop()` skips it.
   */
  onAgentTxStep?: (
    proposal: AgentTxProposal,
    tx: AgentTxControls,
  ) => void;
}

type StepPlayer = (
  target: MaybeElement | undefined,
  options: Record<string, unknown>,
  budget: number | undefined,
  hooks: SpecPlayerHooks | undefined,
) => StepHandle;

const stepPlayers: Record<DriftSpecPrimitive, StepPlayer> = {
  kineticType: (target, options) => {
    const c = createKineticType(
      target ?? (() => null),
      options as KineticTypeOptions,
    );
    return { promise: c.play(), stop: c.stop };
  },
  streamReveal: (target, options) => {
    const c = createStreamReveal(
      target ?? (() => null),
      options as StreamRevealOptions,
    );
    const text = typeof options.text === "string" ? options.text : "";
    c.push(text);
    c.complete();
    return whenDone(() => c.status() === "done");
  },
  camera: (target, options, budget) => {
    const el = target?.() as HTMLElement | null | undefined;
    const keyframes = (options.keyframes as CameraKeyframe[] | undefined) ?? [];
    if (!el || keyframes.length === 0) return noopHandle();
    const [p, setP] = createSignal(0);
    const cam = createCamera(keyframes, { progress: p });
    const ctl = animate(0, 1, {
      duration: Math.max(budget ?? 1200, 1),
      easing: "linear",
      onUpdate: (v) => {
        setP(v);
        el.style.transform = cam();
      },
    });
    return { promise: ctl.finished, stop: ctl.stop };
  },
  colorShift: (target, options, budget) => {
    const el = target?.() as HTMLElement | null | undefined;
    const stops = (options.stops as ColorStop[] | undefined) ?? [];
    if (!el || stops.length === 0) return noopHandle();
    const c = createColorShift(stops, {
      ...((options as unknown) as ColorShiftOptions),
      duration: Math.max(budget ?? 1200, 1),
    });
    const playPromise = c.play();
    const apply = schedule(() => {
      el.style.color = c.color();
      return c.status() === "running";
    });
    const settle = (): void => {
      apply();
      el.style.color = c.color();
    };
    return {
      promise: playPromise.then(settle),
      stop: () => {
        c.stop();
        settle();
      },
    };
  },
  transition: (_target, options) => {
    const c = createTransition(options as TransitionOptions);
    return { promise: c.play(), stop: c.stop };
  },
  beat: (_target, options, budget) => {
    const c = createBeat(options as BeatOptions);
    c.start();
    const timer = animate(0, 1, { duration: Math.max(budget ?? 2000, 1) });
    const stopAll = (): void => {
      timer.stop();
      c.stop();
    };
    return { promise: timer.finished.then(() => c.stop()), stop: stopAll };
  },
  agentTx: (_target, options, _budget, hooks) => {
    const tx = createAgentTx();
    const proposal: AgentTxProposal = {
      to: options.to as string,
      description: options.description as string,
    };
    if (typeof options.value === "string") proposal.value = options.value;
    if (typeof options.data === "string") proposal.data = options.data;
    if (typeof options.chainId === "number") {
      proposal.chainId = options.chainId;
    }
    tx.propose(proposal);
    hooks?.onAgentTxStep?.(proposal, tx);
    if (options.autoApprove === true) tx.approve();
    // The host approves through the hook; the step ends at a terminal
    // state. Without a host the step simply waits until stop() skips it.
    return whenDone(() => {
      const s = tx.state();
      return s === "confirmed" || s === "rejected" || s === "failed";
    });
  },
  txReceipt: (_target, options) => {
    const watcher = createTxReceipt(options.hash as string, {
      endpoint:
        typeof options.endpoint === "string" ? options.endpoint : undefined,
      interval: 4000,
    });
    const timeout =
      typeof options.timeout === "number" ? options.timeout : 120000;
    let cancel: (() => void) | null = null;
    let resolveFn!: () => void;
    const started = Date.now();
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
      if (watcher.mined()) {
        resolve();
        return;
      }
      cancel = schedule(() => {
        if (watcher.mined() || Date.now() - started >= timeout) {
          resolve();
          return false;
        }
        return true;
      });
    });
    const done = (): void => {
      cancel?.();
      cancel = null;
      watcher.abort();
    };
    return {
      promise: promise.then(done),
      stop: () => {
        done();
        resolveFn();
      },
    };
  },
};

/**
 * Render a validated DriftSpec: each scene's primitive plays in
 * order against the element refs the host supplies. `duration` on a
 * step caps that step's budget. Web3 steps ("agentTx", "txReceipt")
 * choreograph on-chain actions: "agentTx" proposes a transaction and
 * waits for the host (via `hooks.onAgentTxStep`) to approve and
 * execute it; "txReceipt" waits for a transaction hash to mine.
 *
 * SSR-safe: `play()` is a no-op on the server. Under reduced motion
 * `play()` jumps straight to the last scene (the clean final frame),
 * matching `createScenePlayer`.
 *
 * ```ts
 * const player = createSpecPlayer(spec, {
 *   title: () => titleEl,
 *   body: () => bodyEl,
 * })
 * player.scene() // 0, 1, ... as the spec plays
 * await player.play()
 * ```
 */
export function createSpecPlayer(
  spec: DriftSpec,
  refs: Record<string, MaybeElement>,
  hooks?: SpecPlayerHooks,
): SpecPlayerControls {
  const [status, setStatus] = createSignal<SpecPlayerStatus>("idle");
  const [scene, setScene] = createSignal(-1);

  let currentStop: (() => void) | null = null;
  let resolvePlay: (() => void) | null = null;
  let stopped = false;

  const runStep = async (step: DriftSpecStep): Promise<void> => {
    const target = step.target === undefined ? undefined : refs[step.target];
    const handle = stepPlayers[step.primitive](
      target,
      step.options ?? {},
      step.duration,
      hooks,
    );
    currentStop = handle.stop;
    if (step.duration === undefined) {
      await handle.promise;
    } else {
      // The duration is a budget: the step ends when the primitive
      // finishes or the budget runs out, whichever comes first.
      const timer = animate(0, 1, { duration: Math.max(step.duration, 0.001) });
      const stopStep = currentStop;
      currentStop = () => {
        stopStep();
        timer.stop();
      };
      await Promise.race([handle.promise, timer.finished]);
      timer.stop();
    }
    currentStop = null;
  };

  const play = (): Promise<void> => {
    if (spec.scenes.length === 0) {
      setScene(-1);
      setStatus("done");
      return Promise.resolve();
    }
    if (prefersReducedMotion() || typeof window === "undefined") {
      setScene(spec.scenes.length - 1);
      setStatus("done");
      return Promise.resolve();
    }
    // A superseded play() must not leave its caller hanging.
    resolvePlay?.();
    resolvePlay = null;
    stopped = false;
    setStatus("running");
    return new Promise<void>((resolve) => {
      resolvePlay = resolve;
      void (async () => {
        for (let i = 0; i < spec.scenes.length; i++) {
          if (stopped) break;
          setScene(i);
          await runStep(spec.scenes[i]);
        }
        currentStop = null;
        const done = resolvePlay;
        resolvePlay = null;
        setStatus(stopped ? "idle" : "done");
        done?.();
      })();
    });
  };

  const stop = (): void => {
    if (status() !== "running") return;
    stopped = true;
    currentStop?.();
    currentStop = null;
    // The async loop observes `stopped`, breaks, and resolves play().
  };

  onCleanup(stop);

  return { play, stop, status, scene };
}
