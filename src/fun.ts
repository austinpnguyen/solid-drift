import {
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export type SlotMachineStatus = "idle" | "spinning" | "done";

export interface SlotMachineOptions<T = string> {
  /** Symbol strip every reel cycles through. Required, at least 2 entries. */
  symbols: T[];
  /** Number of reels. Default 3. */
  reels?: number;
  /** Spin duration in ms for the first reel. Default 1400. */
  duration?: number;
  /** Extra ms per subsequent reel, so reels stop left to right. Default 500. */
  stagger?: number;
  /** Full rotations before a reel may stop. Default 3. */
  minSpins?: number;
  /** Deceleration curve: fast launch, long settle. Default "easeOutQuart". */
  easing?: Easing | EasingName;
  /** Called each time a reel passes a symbol. Pair with a haptic tick. */
  onTick?: (reel: number, symbol: T) => void;
  /** Called with the final symbols when all reels stop. */
  onDone?: (result: T[]) => void;
}

export interface SlotMachineControls<T = string> {
  /** Currently visible symbol per reel. */
  values: Accessor<T[]>;
  /** Final symbols of the last completed spin. */
  result: Accessor<T[]>;
  status: Accessor<SlotMachineStatus>;
  /**
   * Spin the reels. Pass landing symbols to rig the outcome: the spin
   * becomes theater for a predetermined mint result. A wrong-length
   * landing falls back to a random one.
   */
  spin: (landing?: T[]) => void;
  /** Halt immediately at the current symbols. */
  stop: () => void;
  /** Back to idle with the initial symbols. */
  reset: () => void;
}

interface ReelAnim {
  from: number;
  to: number;
  startAt: number;
  duration: number;
  lastIndex: number;
}

/**
 * Gacha slot machine: reels launch fast, decelerate with momentum, and
 * stop left to right. Spin-to-mint theater for reveals, loot boxes, and
 * prize draws.
 *
 * Pass `landing` to `spin()` when the outcome is already decided (the
 * minted NFT, the prize): the reels still spin with full drama and land
 * exactly on your symbols. Omit it for a fair random spin.
 *
 * SSR-safe: on the server `spin()` jumps straight to the result.
 * Under reduced motion the reels jump straight to the result with no spin.
 *
 * ```tsx
 * import { createSlotMachine } from "solid-drift"
 *
 * const machine = createSlotMachine({
 *   symbols: ["🍒", "⭐", "💎", "🚀"],
 *   onTick: (reel) => navigator.vibrate?.(10), // haptic tick per symbol
 *   onDone: (result) => console.log("minted:", result),
 * })
 *
 * <button onClick={() => machine.spin()}>SPIN</button>
 * <div>{machine.values().join(" ")}</div>
 * ```
 */
export function createSlotMachine<T = string>(
  options: SlotMachineOptions<T>,
): SlotMachineControls<T> {
  const {
    symbols,
    reels = 3,
    duration = 1400,
    stagger = 500,
    minSpins = 3,
    onTick,
    onDone,
  } = options;
  const easing = resolveEasing(options.easing ?? "easeOutQuart");

  if (symbols.length < 2) {
    throw new Error("createSlotMachine: symbols needs at least 2 entries.");
  }

  const len = symbols.length;
  const wrap = (index: number): number => ((index % len) + len) % len;
  const symbolAt = (offset: number): T => symbols[wrap(Math.floor(offset))];
  const targetIndex = (symbol: T): number => {
    const i = symbols.indexOf(symbol);
    return i === -1 ? 0 : i;
  };

  const initialOffsets = (): number[] =>
    Array.from({ length: reels }, (_, i) => i % len);
  const initialValues = (): T[] => initialOffsets().map(symbolAt);

  const [values, setValues] = createSignal<T[]>(initialValues());
  const [result, setResult] = createSignal<T[]>(initialValues());
  const [status, setStatus] =
    createSignal<SlotMachineStatus>("idle");

  let offsets = initialOffsets();
  let anims: ReelAnim[] = [];
  let cancel: (() => void) | null = null;

  const settle = (finalSymbols: T[]): void => {
    cancel = null;
    anims = [];
    setValues(finalSymbols);
    setResult(finalSymbols);
    setStatus("done");
    onDone?.(finalSymbols);
  };

  const spin = (landing?: T[]): void => {
    cancel?.();
    cancel = null;

    const finalSymbols =
      landing && landing.length === reels
        ? landing.map((s) => symbols[targetIndex(s)])
        : Array.from(
            { length: reels },
            () => symbols[(Math.random() * len) | 0],
          );

    if (typeof window === "undefined" || prefersReducedMotion()) {
      // Accessibility / SSR: no theater, straight to the result.
      offsets = finalSymbols.map((s) => targetIndex(s));
      settle(finalSymbols);
      return;
    }

    setStatus("spinning");
    const t0 = now();
    anims = finalSymbols.map((symbol, i) => {
      const from = offsets[i];
      const currentIdx = wrap(Math.floor(from));
      const delta = wrap(targetIndex(symbol) - currentIdx);
      // minSpins full turns plus the forward distance to the target index.
      // len divides minSpins * len, so floor(to) lands exactly on target.
      const to = from + minSpins * len + delta;
      return {
        from,
        to,
        startAt: t0,
        duration: duration + i * stagger,
        lastIndex: currentIdx,
      };
    });

    cancel = schedule((t: number): boolean => {
      let allDone = true;
      const next = offsets.slice();
      for (let i = 0; i < reels; i++) {
        const a = anims[i];
        const p = Math.min(Math.max((t - a.startAt) / a.duration, 0), 1);
        const offset = a.from + (a.to - a.from) * easing(p);
        next[i] = offset;
        const index = wrap(Math.floor(offset));
        if (index !== a.lastIndex) {
          a.lastIndex = index;
          onTick?.(i, symbols[index]);
        }
        if (p < 1) allDone = false;
      }
      offsets = next;
      setValues(next.map(symbolAt));
      if (allDone) {
        settle(finalSymbols);
        return false;
      }
      return true;
    });
  };

  const stop = (): void => {
    if (!cancel) return;
    cancel();
    const current = offsets.map(symbolAt);
    offsets = current.map((s) => targetIndex(s));
    settle(current);
  };

  const reset = (): void => {
    cancel?.();
    cancel = null;
    anims = [];
    offsets = initialOffsets();
    const initial = initialValues();
    setValues(initial);
    setResult(initial);
    setStatus("idle");
  };

  onCleanup(() => cancel?.());

  return { values, result, status, spin, stop, reset };
}
