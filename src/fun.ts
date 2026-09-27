import {
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { createTween } from "./tween.js";
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

export type RedPacketStatus = "sealed" | "opening" | "bursting" | "revealed";

export interface RedPacketCoin {
  id: number;
  /** Pixels right from the packet center. */
  x: number;
  /** Pixels down from the packet center. */
  y: number;
  vx: number;
  vy: number;
  /** Degrees. */
  rotation: number;
  /** Degrees per second. */
  vr: number;
  /** Diameter in pixels. */
  size: number;
  /** 0..1, fades at the end of life. */
  opacity: number;
  /** This coin's share of the total amount. */
  amount: number;
}

export interface RedPacketOptions {
  /** Coins in the burst. Default 12. */
  coins?: number;
  /** Total amount, split randomly across coins like a real red packet. Default 88. */
  amount?: number;
  /** Burst size in pixels, scales launch speed. Default 160. */
  spread?: number;
  /** Gravity in px/s^2. Default 900. */
  gravity?: number;
  /** Envelope opening ceremony in ms. Default 500. */
  openDuration?: number;
  /** Coin burst in ms before the reveal. Default 1600. */
  burstDuration?: number;
  /** Amount count-up in ms once revealed. Default 800. */
  revealDuration?: number;
  /** Called when the packet is tapped open. */
  onOpen?: () => void;
  /** Called with the total amount when the reveal lands. */
  onReveal?: (amount: number) => void;
}

export interface RedPacketControls {
  status: Accessor<RedPacketStatus>;
  /** Live coin particles, centered on the packet. Render them absolutely. */
  coins: Accessor<RedPacketCoin[]>;
  /** Amount counted up so far. Reaches the total when revealed. */
  revealed: Accessor<number>;
  /** Tap the packet: sealed -> opening -> bursting -> revealed. */
  open: () => void;
  /** Back to sealed. */
  reset: () => void;
}

/**
 * Crypto red packet ceremony: tap to open, coins burst out with physics,
 * the amount counts up. The hongbao moment, as a signal-native primitive.
 *
 * The primitive owns the ceremony state machine and the coin particle
 * physics; you render the envelope and the coins however fits your design.
 * Each coin carries position, rotation, size, opacity, and its share of
 * the total amount, split randomly like a real red packet grab.
 *
 * SSR-safe: `open()` jumps straight to revealed on the server. Under
 * reduced motion the packet opens instantly with no burst: the amount
 * just appears.
 *
 * ```tsx
 * import { createRedPacket } from "solid-drift"
 *
 * const packet = createRedPacket({ amount: 88, coins: 14 })
 *
 * <button onClick={() => packet.open()}>
 *   {packet.status() === "sealed" ? "🧧 Tap to open" : `$${packet.revealed().toFixed(2)}`}
 * </button>
 * <For each={packet.coins()}>
 *   {(coin) => (
 *     <div
 *       class="coin"
 *       style={{
 *         transform: `translate(${coin.x}px, ${coin.y}px) rotate(${coin.rotation}deg)`,
 *         opacity: coin.opacity,
 *         width: `${coin.size}px`,
 *       }}
 *     />
 *   )}
 * </For>
 * ```
 */
export function createRedPacket(
  options: RedPacketOptions = {},
): RedPacketControls {
  const {
    coins: coinCount = 12,
    amount = 88,
    spread = 160,
    gravity = 900,
    openDuration = 500,
    burstDuration = 1600,
    revealDuration = 800,
    onOpen,
    onReveal,
  } = options;

  const [status, setStatus] = createSignal<RedPacketStatus>("sealed");
  const [coinList, setCoinList] = createSignal<RedPacketCoin[]>([]);
  const [target, setTarget] = createSignal(0);
  const tweened = createTween(target, {
    duration: revealDuration,
    easing: "easeOutExpo",
  });
  // On the server the tween effect never runs, so read the target directly.
  const revealed: Accessor<number> = () =>
    typeof window === "undefined" ? target() : tweened();

  let cancel: (() => void) | null = null;
  let burstAt = 0;
  let lastT = 0;
  let nextCoinId = 1;

  const spawnCoins = (): RedPacketCoin[] => {
    const weights = Array.from(
      { length: coinCount },
      () => 0.5 + Math.random(),
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const speedScale = spread / 160;
    return weights.map((w, i) => {
      const angle = ((Math.random() * 120 - 60) * Math.PI) / 180;
      const speed = (200 + Math.random() * 220) * speedScale;
      return {
        id: nextCoinId++,
        x: 0,
        y: 0,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 720,
        size: 24 + Math.random() * 16,
        opacity: 1,
        amount: (amount * w) / totalWeight,
      };
    });
  };

  const stepCoins = (t: number): void => {
    // Every coin is born at burstAt, so they share one age and one fade.
    const dt = Math.min(Math.max((t - lastT) / 1000, 0), 0.05);
    lastT = t;
    const age = t - burstAt;
    if (age >= burstDuration) {
      setCoinList([]);
      return;
    }
    const fadeStart = burstDuration * 0.7;
    const opacity =
      age < fadeStart
        ? 1
        : Math.max(1 - (age - fadeStart) / (burstDuration - fadeStart), 0);
    setCoinList((prev) =>
      prev.map((c) => {
        const vy = c.vy + gravity * dt;
        return {
          ...c,
          x: c.x + c.vx * dt,
          y: c.y + vy * dt,
          vy,
          rotation: c.rotation + c.vr * dt,
          opacity,
        };
      }),
    );
  };

  const open = (): void => {
    if (status() !== "sealed") return;
    onOpen?.();

    if (typeof window === "undefined" || prefersReducedMotion()) {
      // Accessibility / SSR: no ceremony, the amount just appears.
      setTarget(amount);
      setStatus("revealed");
      onReveal?.(amount);
      return;
    }

    setStatus("opening");
    const t0 = now();
    cancel?.();
    cancel = schedule((t: number): boolean => {
      const s = status();
      if (s === "opening" && t - t0 >= openDuration) {
        burstAt = t;
        lastT = t;
        setCoinList(spawnCoins());
        setStatus("bursting");
      } else if (s === "bursting") {
        stepCoins(t);
        if (t - burstAt >= burstDuration) {
          setCoinList([]);
          setTarget(amount);
          setStatus("revealed");
          onReveal?.(amount);
          cancel = null;
          return false;
        }
      }
      return true;
    });
  };

  const reset = (): void => {
    cancel?.();
    cancel = null;
    setCoinList([]);
    setTarget(0);
    setStatus("sealed");
  };

  onCleanup(() => cancel?.());

  return { status, coins: coinList, revealed, open, reset };
}
