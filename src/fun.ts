import {
  createEffect,
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

/* ------------------------------------------------------------------ */
/* Particle engine (shared by createConfetti and createEmojiBurst)     */
/* ------------------------------------------------------------------ */

type ParticleShape = "rect" | "circle" | "emoji";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  sway: number;
  swaySpeed: number;
  swayPhase: number;
  size: number;
  color: string;
  shape: ParticleShape;
  text: string;
  born: number;
  life: number;
}

interface ParticleLayer {
  active: Accessor<boolean>;
  spawn: (make: () => Particle) => void;
  clear: () => void;
}

/**
 * A canvas particle layer with gravity, drag, sway, and flutter, run
 * on the shared animation clock. One rAF loop per layer, only while
 * particles are alive. The canvas is fitted to its CSS size times the
 * device pixel ratio on every frame, so a fullscreen fixed overlay
 * canvas just works.
 */
function createParticleLayer(
  canvas: () => HTMLCanvasElement | null | undefined,
  gravity: number,
  drag: number,
  onDone?: () => void,
): ParticleLayer {
  const server = typeof window === "undefined";
  const [active, setActive] = createSignal(false);
  let particles: Particle[] = [];
  let cancel: (() => void) | null = null;
  let lastT = 0;
  const MAX_PARTICLES = 1200;

  const loop = (t: number): boolean => {
    const cvs = canvas();
    if (!cvs) {
      particles = [];
      setActive(false);
      cancel = null;
      return false;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cvs.clientWidth;
    const h = cvs.clientHeight;
    if (w === 0 || h === 0) return true; // no layout yet; keep waiting
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (cvs.width !== pw || cvs.height !== ph) {
      cvs.width = pw;
      cvs.height = ph;
    }
    const ctx = cvs.getContext("2d");
    if (!ctx) {
      particles = [];
      setActive(false);
      cancel = null;
      return false;
    }
    const dt = lastT === 0 ? 0.016 : Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const dk = Math.max(0, 1 - drag * dt);
    particles = particles.filter((p) => {
      const age = t - p.born;
      if (age >= p.life) return false;
      p.vx *= dk;
      p.vy = p.vy * dk + gravity * dt;
      p.swayPhase += p.swaySpeed * dt;
      p.x += (p.vx + Math.sin(p.swayPhase) * p.sway) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      // Fade over the last quarter of life.
      ctx.globalAlpha = Math.min(1, (p.life - age) / (p.life * 0.25));
      if (p.shape === "circle") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "emoji") {
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * 0.3);
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      } else {
        // Paper flutter: the rect tumbles and its width breathes.
        const squash = 0.35 + 0.65 * Math.abs(Math.sin(p.swayPhase * 2));
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, squash);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      return true;
    });
    ctx.globalAlpha = 1;
    if (particles.length === 0) {
      setActive(false);
      cancel = null;
      onDone?.();
      return false;
    }
    return true;
  };

  const spawn = (make: () => Particle): void => {
    if (server) return;
    particles.push(make());
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
    if (!cancel) {
      lastT = 0;
      setActive(true);
      cancel = schedule(loop);
    }
  };

  const clear = (): void => {
    cancel?.();
    cancel = null;
    particles = [];
    setActive(false);
  };

  if (!server) {
    onCleanup(() => {
      cancel?.();
      cancel = null;
    });
  }

  return { active, spawn, clear };
}

/* ------------------------------------------------------------------ */
/* createConfetti                                                      */
/* ------------------------------------------------------------------ */

export interface ConfettiOptions {
  /** Particles per burst. Default 120. */
  count?: number;
  /** Confetti colors. Default a festive palette. */
  colors?: string[];
  /** Launch cone in degrees around straight up. Default 70. */
  spread?: number;
  /** Launch speed in px/s. Default 900. */
  power?: number;
  /** Gravity in px/s^2. Default 1100. */
  gravity?: number;
  /** Air drag. Default 1.2. */
  drag?: number;
  /** Particle size range in px. Default [6, 12]. */
  size?: [min: number, max: number];
  /** Particle shapes. Default ["rect", "circle"]. */
  shapes?: Array<"rect" | "circle">;
  /** Particle lifetime in ms. Default 2600. */
  lifetime?: number;
  /** Called when the last particle fades. */
  onDone?: () => void;
}

export interface ConfettiControls {
  /** True while any particles are alive. */
  active: Accessor<boolean>;
  /**
   * Fire a burst from a normalized origin (0..1 across the canvas).
   * Default `{ x: 0.5, y: 0.6 }`.
   */
  burst: (origin?: { x: number; y: number }) => void;
  /** Remove every particle immediately. */
  clear: () => void;
}

const CONFETTI_COLORS = [
  "#ff4757",
  "#ffa502",
  "#2ed573",
  "#1e90ff",
  "#eccc68",
  "#ff6b81",
  "#7bed9f",
  "#70a1ff",
  "#f368e0",
  "#48dbfb",
];

/**
 * Canvas confetti bursts: celebration physics with gravity, drag,
 * sway, and tumbling paper flutter, rendered on the shared clock.
 *
 * Give it a canvas (a fullscreen fixed overlay with
 * `pointer-events: none` is the classic setup) and call `burst()`
 * from party moments: mints, wins, onboarding completions. Bursts
 * accumulate, so rapid celebrations stack instead of replacing.
 *
 * SSR-safe: `burst()` is a no-op on the server. Under reduced motion
 * `burst()` skips the particles but still calls `onDone`, so chained
 * logic (show the prize after the celebration) keeps working.
 *
 * ```tsx
 * import { createConfetti } from "solid-drift"
 *
 * let cvs!: HTMLCanvasElement
 * const confetti = createConfetti(() => cvs, {
 *   onDone: () => console.log("party over"),
 * })
 * <canvas ref={cvs} style={{ position: "fixed", inset: "0", "pointer-events": "none" }} />
 * <button onClick={() => confetti.burst()}>Celebrate</button>
 * <button onClick={() => confetti.burst({ x: 0.2, y: 0.8 })}>Side popper</button>
 * ```
 */
export function createConfetti(
  canvas: () => HTMLCanvasElement | null | undefined,
  options: ConfettiOptions = {},
): ConfettiControls {
  const {
    count = 120,
    colors = CONFETTI_COLORS,
    spread = 70,
    power = 900,
    gravity = 1100,
    drag = 1.2,
    size = [6, 12],
    shapes = ["rect", "circle"],
    lifetime = 2600,
    onDone,
  } = options;
  const server = typeof window === "undefined";
  const layer = createParticleLayer(canvas, gravity, drag, onDone);

  const burst = (origin: { x: number; y: number } = { x: 0.5, y: 0.6 }): void => {
    if (server || prefersReducedMotion()) {
      onDone?.();
      return;
    }
    const cvs = canvas();
    if (!cvs || cvs.clientWidth === 0) return;
    const ox = origin.x * cvs.clientWidth;
    const oy = origin.y * cvs.clientHeight;
    const [minSize, maxSize] = size;
    for (let i = 0; i < count; i++) {
      const angle = ((-90 + (Math.random() - 0.5) * spread) * Math.PI) / 180;
      const speed = power * (0.4 + Math.random() * 0.8);
      const shape = shapes[(Math.random() * shapes.length) | 0];
      layer.spawn(() => ({
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 20,
        sway: 40 + Math.random() * 60,
        swaySpeed: 4 + Math.random() * 6,
        swayPhase: Math.random() * Math.PI * 2,
        size: minSize + Math.random() * (maxSize - minSize),
        color: colors[(Math.random() * colors.length) | 0],
        shape,
        text: "",
        born: now(),
        life: lifetime * (0.7 + Math.random() * 0.6),
      }));
    }
  };

  return { active: layer.active, burst, clear: layer.clear };
}

/* ------------------------------------------------------------------ */
/* createEmojiBurst                                                    */
/* ------------------------------------------------------------------ */

export interface EmojiBurstOptions {
  /** Emoji pool. Default ["\u{1F389}", "\u2728", "\u{1F4A5}", "\u2B50", "\u{1F496}", "\u{1F973}"]. */
  emoji?: string[];
  /** Particles per burst. Default 24. */
  count?: number;
  /** Launch speed in px/s. Default 650. */
  power?: number;
  /** Gravity in px/s^2. Default 700: floatier than confetti. */
  gravity?: number;
  /** Air drag. Default 1.6. */
  drag?: number;
  /** Font size range in px. Default [24, 48]. */
  size?: [min: number, max: number];
  /** Launch cone in degrees around straight up. Default 90. */
  spread?: number;
  /** Particle lifetime in ms. Default 1800. */
  lifetime?: number;
  /** Called when the last particle fades. */
  onDone?: () => void;
}

export interface EmojiBurstControls {
  /** True while any particles are alive. */
  active: Accessor<boolean>;
  /**
   * Fire a burst from a normalized origin (0..1 across the canvas).
   * Default `{ x: 0.5, y: 0.6 }`.
   */
  burst: (origin?: { x: number; y: number }) => void;
  /** Remove every particle immediately. */
  clear: () => void;
}

const BURST_EMOJI = ["\u{1F389}", "\u2728", "\u{1F4A5}", "\u2B50", "\u{1F496}", "\u{1F973}"];

/**
 * Emoji celebration burst: the same particle physics as confetti,
 * but the particles are emoji glyphs that rise, tumble gently, and
 * fade. Reactions, likes, level-ups, chat celebrations.
 *
 * Same canvas setup and safety rules as `createConfetti`: SSR-safe,
 * and under reduced motion `burst()` skips the particles but still
 * calls `onDone`.
 *
 * ```tsx
 * import { createEmojiBurst } from "solid-drift"
 *
 * let cvs!: HTMLCanvasElement
 * const burst = createEmojiBurst(() => cvs, { emoji: ["\u2764\uFE0F", "\u{1F525}"] })
 * <canvas ref={cvs} style={{ position: "fixed", inset: "0", "pointer-events": "none" }} />
 * <button onClick={() => burst.burst()}>Send love</button>
 * ```
 */
export function createEmojiBurst(
  canvas: () => HTMLCanvasElement | null | undefined,
  options: EmojiBurstOptions = {},
): EmojiBurstControls {
  const {
    emoji = BURST_EMOJI,
    count = 24,
    power = 650,
    gravity = 700,
    drag = 1.6,
    size = [24, 48],
    spread = 90,
    lifetime = 1800,
    onDone,
  } = options;
  const server = typeof window === "undefined";
  const layer = createParticleLayer(canvas, gravity, drag, onDone);

  const burst = (origin: { x: number; y: number } = { x: 0.5, y: 0.6 }): void => {
    if (server || prefersReducedMotion()) {
      onDone?.();
      return;
    }
    const cvs = canvas();
    if (!cvs || cvs.clientWidth === 0) return;
    const ox = origin.x * cvs.clientWidth;
    const oy = origin.y * cvs.clientHeight;
    const [minSize, maxSize] = size;
    for (let i = 0; i < count; i++) {
      const angle = ((-90 + (Math.random() - 0.5) * spread) * Math.PI) / 180;
      const speed = power * (0.5 + Math.random() * 0.7);
      layer.spawn(() => ({
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: (Math.random() - 0.5) * Math.PI,
        vr: (Math.random() - 0.5) * 6,
        sway: 30 + Math.random() * 40,
        swaySpeed: 3 + Math.random() * 4,
        swayPhase: Math.random() * Math.PI * 2,
        size: minSize + Math.random() * (maxSize - minSize),
        color: "#ffffff",
        shape: "emoji",
        text: emoji[(Math.random() * emoji.length) | 0],
        born: now(),
        life: lifetime * (0.7 + Math.random() * 0.6),
      }));
    }
  };

  return { active: layer.active, burst, clear: layer.clear };
}

/* ------------------------------------------------------------------ */
/* createScratch                                                       */
/* ------------------------------------------------------------------ */

export interface ScratchOptions {
  /**
   * Fraction of the cover that must be cleared to complete, 0 to 1.
   * Default 0.45.
   */
  threshold?: number;
  /** Eraser brush radius in px. Default 26. */
  brush?: number;
  /**
   * Paint the cover yourself: foil art, branding, "scratch here" copy.
   * Receives the 2D context and the canvas size in px. Default is a
   * silver holographic foil.
   */
  paint?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Called once when clearing passes the threshold. */
  onComplete?: () => void;
}

export interface ScratchControls {
  /** 0..1 fraction of the cover cleared. */
  cleared: Accessor<number>;
  /** True after clearing passes the threshold. */
  done: Accessor<boolean>;
  /** Repaint the cover and reset progress. */
  reset: () => void;
}

/** Default cover: a silver holographic foil with sheen streaks. */
function paintFoil(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#dde2e9");
  g.addColorStop(0.45, "#a9b2bf");
  g.addColorStop(0.55, "#c3ccd7");
  g.addColorStop(1, "#98a2b1");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Diagonal sheen streaks.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = Math.max(2, w * 0.02);
  for (let i = -2; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo((i * w) / 3, -10);
    ctx.lineTo((i * w) / 3 + h * 0.6, h + 10);
    ctx.stroke();
  }
  // Speckle.
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  const n = Math.floor((w * h) / 900);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

/**
 * Scratch-off cover: a lottery-ticket foil over hidden content.
 *
 * The canvas paints an opaque cover (silver holographic foil by
 * default, or your own art via `paint`). Pointer drags erase through
 * it with `destination-out`; the cleared fraction is sampled from the
 * alpha channel on a throttled cadence, and `onComplete` fires once
 * past `threshold`. Layer it over the prize with absolute positioning.
 *
 * Set `touch-action: none` on the canvas so touch scratches do not
 * scroll the page. Scratching is direct manipulation, so it works
 * identically under reduced motion. SSR-safe: `cleared()` stays 0.
 *
 * ```tsx
 * import { createScratch } from "solid-drift"
 *
 * let foil!: HTMLCanvasElement
 * const scratch = createScratch(() => foil, {
 *   onComplete: () => console.log("revealed!"),
 * })
 * <div style={{ position: "relative" }}>
 *   <div>YOU WON 50 STARS</div>
 *   <canvas ref={foil} style={{ position: "absolute", inset: "0", "touch-action": "none" }} />
 * </div>
 * ```
 */
export function createScratch(
  canvas: () => HTMLCanvasElement | null | undefined,
  options: ScratchOptions = {},
): ScratchControls {
  const { threshold = 0.45, brush = 26, paint, onComplete } = options;
  const server = typeof window === "undefined";
  const [cleared, setCleared] = createSignal(0);
  const [done, setDone] = createSignal(false);
  if (server) {
    return { cleared, done, reset: () => {} };
  }

  const paintCover = (): void => {
    const cvs = canvas();
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (cvs.width !== w || cvs.height !== h) {
      cvs.width = w;
      cvs.height = h;
    }
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (paint) paint(ctx, w, h);
    else paintFoil(ctx, w, h);
  };

  /** Fraction of sampled pixels erased, via the alpha channel. */
  const sampleCleared = (): void => {
    const cvs = canvas();
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = cvs;
    if (w === 0 || h === 0) return;
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch {
      return; // tainted canvas: cannot read pixels
    }
    const step = 6;
    let clear = 0;
    let total = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        total++;
        if (data[(y * w + x) * 4 + 3] < 128) clear++;
      }
    }
    const frac = total === 0 ? 0 : clear / total;
    setCleared(frac);
    if (!done() && frac >= threshold) {
      setDone(true);
      onComplete?.();
    }
  };

  const eraseAt = (clientX: number, clientY: number): void => {
    const cvs = canvas();
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const sx = cvs.width / rect.width;
    const sy = cvs.height / rect.height;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(
      (clientX - rect.left) * sx,
      (clientY - rect.top) * sy,
      brush * Math.max(sx, sy),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };

  // Throttle the (relatively expensive) pixel sampling.
  let lastSample = 0;
  const maybeSample = (): void => {
    const t = now();
    if (t - lastSample < 120) return;
    lastSample = t;
    sampleCleared();
  };

  const onDown = (event: PointerEvent): void => {
    if (event.isPrimary === false) return;
    const cvs = canvas();
    if (!cvs) return;
    eraseAt(event.clientX, event.clientY);
    maybeSample();
    try {
      cvs.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture may throw for synthetic events; the window
      // fallback below is not needed since moves stay on the canvas.
    }
    const move = (ev: PointerEvent): void => {
      eraseAt(ev.clientX, ev.clientY);
      maybeSample();
    };
    const up = (): void => {
      cvs.removeEventListener("pointermove", move);
      cvs.removeEventListener("pointerup", up);
      cvs.removeEventListener("pointercancel", up);
      sampleCleared(); // final accurate read
    };
    cvs.addEventListener("pointermove", move);
    cvs.addEventListener("pointerup", up);
    cvs.addEventListener("pointercancel", up);
  };

  // Late-bound refs (Solid assigns `ref` after mount) get the cover
  // painted and the gesture attached as soon as they exist.
  createEffect(() => {
    const cvs = canvas();
    if (!cvs) return;
    paintCover();
    cvs.addEventListener("pointerdown", onDown as EventListener);
    onCleanup(() =>
      cvs.removeEventListener("pointerdown", onDown as EventListener),
    );
  });

  const reset = (): void => {
    setCleared(0);
    setDone(false);
    paintCover();
  };

  return { cleared, done, reset };
}
