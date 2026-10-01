/**
 * Privacy-friendly analytics.
 *
 * `createTracker` batches events to a caller-provided sink (no network
 * calls of its own), `useConsent` manages the consent state it gates on,
 * and `createFunnel` tracks step-by-step conversion through a named flow.
 * Everything runs in memory; the app decides where data goes.
 */

import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";

export interface TrackEvent {
  name: string;
  props: Record<string, unknown>;
  timestamp: number;
  userId?: string;
}

export interface TrackerOptions {
  /** Receives each batch. Default: events stay in the in-memory queue. */
  sink?: (events: TrackEvent[]) => void | Promise<void>;
  /** Batch window in ms. Default 5000. 0 sends every event immediately. */
  batchMs?: number;
  /** Flush when the queue reaches this size. Default 50. */
  batchSize?: number;
  /** While false, events are held (not sent) until consent is granted. */
  consent?: Accessor<boolean> | boolean;
  /** Prop keys stripped from every event. */
  blockProps?: string[];
  /** 0 to 1; events are randomly dropped above the rate. Default 1. */
  sampleRate?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
  /** Max held events; oldest are dropped past it. Default 1000. */
  maxQueue?: number;
}

export interface TrackerControls {
  track: (name: string, props?: Record<string, unknown>) => void;
  identify: (id: string, traits?: Record<string, unknown>) => void;
  page: (name: string, props?: Record<string, unknown>) => void;
  queue: Accessor<TrackEvent[]>;
  flush: () => Promise<void>;
  reset: () => void;
  enabled: Accessor<boolean>;
  setEnabled: (enabled: boolean) => void;
}

const random = (): number => Math.random();

/**
 * Batched, consent-gated event tracker. The library never sends data
 * anywhere itself: `sink` decides what happens to each batch, and the
 * default sink keeps events in memory for inspection.
 */
export function createTracker(options: TrackerOptions = {}): TrackerControls {
  const {
    sink,
    batchMs = 5000,
    batchSize = 50,
    blockProps = [],
    sampleRate = 1,
    now = (): number => Date.now(),
    maxQueue = 1000,
  } = options;

  const [queue, setQueue] = createSignal<TrackEvent[]>([]);
  const [enabled, setEnabled] = createSignal(true);
  const [userId, setUserId] = createSignal<string | undefined>(undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;

  const hasConsent = (): boolean =>
    typeof options.consent === "function"
      ? (options.consent as Accessor<boolean>)()
      : (options.consent ?? true);

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const schedule = (): void => {
    if (timer !== undefined || batchMs <= 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, batchMs);
  };

  const cleanProps = (props: Record<string, unknown>): Record<string, unknown> => {
    if (blockProps.length === 0) return { ...props };
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (!blockProps.includes(key)) out[key] = value;
    }
    return out;
  };

  const push = (name: string, props: Record<string, unknown> = {}): void => {
    if (!enabled()) return;
    if (sampleRate < 1 && random() >= sampleRate) return;
    const event: TrackEvent = {
      name,
      props: cleanProps(props),
      timestamp: now(),
      userId: userId(),
    };
    setQueue((prev) => {
      const next = [...prev, event];
      return next.length > maxQueue ? next.slice(next.length - maxQueue) : next;
    });
    if (batchMs <= 0) {
      void flush();
    } else {
      schedule();
      if (queue().length >= batchSize) void flush();
    }
  };

  const flush = async (): Promise<void> => {
    if (flushing || !hasConsent()) return;
    const events = queue();
    if (events.length === 0) return;
    flushing = true;
    clearTimer();
    setQueue([]);
    try {
      await sink?.(events);
    } finally {
      flushing = false;
      if (queue().length > 0) {
        if (batchMs <= 0) void flush();
        else schedule();
      }
    }
  };

  const track = (name: string, props: Record<string, unknown> = {}): void => {
    push(name, props);
  };

  const identify = (id: string, traits: Record<string, unknown> = {}): void => {
    setUserId(id);
    push("$identify", traits);
  };

  const page = (name: string, props: Record<string, unknown> = {}): void => {
    push("$page", { ...props, page: name });
  };

  const reset = (): void => {
    clearTimer();
    setQueue([]);
    setUserId(undefined);
  };

  // Flush held events when consent flips to granted.
  if (typeof options.consent === "function") {
    createEffect(() => {
      if ((options.consent as Accessor<boolean>)()) {
        void flush();
      }
    });
  }

  onCleanup(clearTimer);

  return { track, identify, page, queue, flush, reset, enabled, setEnabled };
}

/* ------------------------------------------------------------------ */
/* useConsent                                                            */
/* ------------------------------------------------------------------ */

export type ConsentState = "unknown" | "granted" | "denied";

export interface ConsentOptions {
  /** Persist the choice to storage under this key. */
  storageKey?: string;
  /** Inject a Storage implementation (tests). */
  storage?: Storage;
}

export interface ConsentControls {
  consent: Accessor<ConsentState>;
  /** True only when granted. Convenient for gating a tracker. */
  granted: Accessor<boolean>;
  grant: () => void;
  deny: () => void;
  /** Back to unknown; clears the stored choice. */
  reset: () => void;
}

/**
 * Consent state for analytics gating. Persists to localStorage when
 * `storageKey` is given. SSR-safe: starts "unknown" on the server.
 */
export function createConsent(options: ConsentOptions = {}): ConsentControls {
  const { storageKey } = options;
  const storage =
    options.storage ??
    (typeof localStorage !== "undefined" ? localStorage : undefined);

  const readStored = (): ConsentState => {
    if (!storage || !storageKey) return "unknown";
    const value = storage.getItem(storageKey);
    return value === "granted" || value === "denied" ? value : "unknown";
  };

  const [consent, setConsent] = createSignal<ConsentState>(readStored());

  const persist = (state: ConsentState): void => {
    setConsent(state);
    if (!storage || !storageKey) return;
    if (state === "unknown") storage.removeItem(storageKey);
    else storage.setItem(storageKey, state);
  };

  return {
    consent,
    granted: () => consent() === "granted",
    grant: () => persist("granted"),
    deny: () => persist("denied"),
    reset: () => persist("unknown"),
  };
}

/**
 * @deprecated Use {@link createConsent} instead. This alias will be
 * removed in v1.0.
 */
export const useConsent = createConsent;

/* ------------------------------------------------------------------ */
/* createFunnel                                                          */
/* ------------------------------------------------------------------ */

export interface FunnelOptions {
  /** Name used in tracked events and as the event prop `funnel`. */
  name: string;
  steps: string[];
  /** Optional tracker; funnel events go here when provided. */
  tracker?: Pick<TrackerControls, "track">;
  /** Max ms to complete the funnel after entering. Default Infinity. */
  windowMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export interface FunnelStepRecord {
  step: string;
  at: number;
}

export interface FunnelControls {
  /** Index of the current step, -1 when not started. */
  step: Accessor<number>;
  current: Accessor<string | undefined>;
  completed: Accessor<boolean>;
  history: Accessor<FunnelStepRecord[]>;
  enter: () => void;
  /** Advance to the next step, or jump forward to a named step. */
  advance: (to?: string | number) => void;
  abandon: (reason?: string) => void;
  reset: () => void;
}

/**
 * Step-by-step funnel tracking. Emits `funnel_enter`, `funnel_step`,
 * `funnel_complete`, and `funnel_abandon` through the given tracker.
 * Advancing after `windowMs` auto-abandons with reason "expired".
 */
export function createFunnel(options: FunnelOptions): FunnelControls {
  const { name, steps, tracker, windowMs = Infinity, now = (): number => Date.now() } =
    options;

  const [step, setStep] = createSignal(-1);
  const [completed, setCompleted] = createSignal(false);
  const [history, setHistory] = createSignal<FunnelStepRecord[]>([]);
  const [startedAt, setStartedAt] = createSignal<number | undefined>(undefined);

  const emit = (event: string, props: Record<string, unknown> = {}): void => {
    tracker?.track(event, { funnel: name, ...props });
  };

  const reset = (): void => {
    setStep(-1);
    setCompleted(false);
    setHistory([]);
    setStartedAt(undefined);
  };

  const enter = (): void => {
    reset();
    const at = now();
    setStartedAt(at);
    setStep(0);
    setHistory([{ step: steps[0], at }]);
    emit("funnel_enter", { step: steps[0] });
  };

  const abandon = (reason = "abandoned"): void => {
    const current = step();
    if (current < 0) return;
    emit("funnel_abandon", {
      step: steps[current],
      reason,
      stepsCompleted: history().length,
    });
    reset();
  };

  const advance = (to?: string | number): void => {
    const current = step();
    if (current < 0 || completed()) return;
    const start = startedAt() ?? now();
    if (now() - start > windowMs) {
      abandon("expired");
      return;
    }

    let next: number;
    if (to === undefined) {
      next = current + 1;
    } else if (typeof to === "number") {
      next = to;
    } else {
      next = steps.indexOf(to);
      if (next < 0) return;
    }
    if (next <= current || next >= steps.length) return;

    const at = now();
    setStep(next);
    setHistory((prev) => [...prev, { step: steps[next], at }]);
    emit("funnel_step", { step: steps[next], from: steps[current] });

    if (next === steps.length - 1) {
      setCompleted(true);
      emit("funnel_complete", {
        durationMs: at - start,
        steps: steps.length,
      });
    }
  };

  return {
    step,
    current: () => (step() >= 0 ? steps[step()] : undefined),
    completed,
    history,
    enter,
    advance,
    abandon,
    reset,
  };
}
