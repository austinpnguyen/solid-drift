/**
 * web3 family: motion primitives for onchain product UI.
 *
 * Transaction lifecycle, price tickers, mint reveals, and wallet
 * button micro-interactions, without depending on any wallet or chain
 * library. State arrives through accessors in a wagmi/viem-style
 * shape (the adapter pattern), so the primitives stay zero-dependency
 * while your app keeps its own stack.
 *
 * All primitives are signal-native, SSR-safe, dependency-free, and
 * define sensible static behavior under `prefers-reduced-motion`.
 */

import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { animate } from "./animate.js";
import { createSquashStretch } from "./cartoon.js";
import { createAnticipation } from "./cartoon.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { now, schedule } from "./engine.js";
import { createMagnetic } from "./pointer.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { createSpring } from "./spring.js";
import { ownerDoc } from "./text.js";

type MaybeElement = () => Element | null | undefined;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Round to 2 decimals for style values. */
function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/* ------------------------------------------------------------------ */
/* createTxLifecycle                                                   */
/* ------------------------------------------------------------------ */

/** Stages of a transaction's life, from wallet prompt to finality. */
export type TxState =
  | "idle"
  | "signing"
  | "pending"
  | "confirming"
  | "success"
  | "failed";

/** wagmi/viem-style transaction status fed through `source`. */
export interface TxStatusInput {
  /** Transaction status from the wallet/chain adapter. */
  status?: "pending" | "success" | "error" | "idle";
  /** Confirmations seen so far, once a hash exists. */
  confirmations?: number;
}

export interface TxLifecycleOptions {
  /**
   * wagmi/viem-style state accessor. Omit for fully manual control
   * through `set()`.
   */
  source?: Accessor<TxStatusInput>;
  /** Confirmations that promote "pending" to "confirming". Default 1. */
  requiredConfirmations?: number;
  /** Spring stiffness for the progress ring. Default 170. */
  stiffness?: number;
  /** Spring damping for the progress ring. Default 26. */
  damping?: number;
  /** Called after entering a state, with the previous state. */
  onEnter?: (state: TxState, prev: TxState) => void;
}

export interface TxLifecycleControls {
  /** Current lifecycle state. */
  state: Accessor<TxState>;
  /**
   * Set the state manually, for stages the chain never reports
   * (for example "signing" when the wallet prompt opens).
   */
  set: (next: TxState) => void;
  /** Return to "idle". */
  reset: () => void;
  /**
   * 0 to 1 across the lifecycle, spring-smoothed for progress rings
   * and bars: idle 0, signing 0.25, pending 0.5, confirming 0.75,
   * success/failed 1.
   */
  progress: Accessor<number>;
}

const STATE_PROGRESS: Record<TxState, number> = {
  idle: 0,
  signing: 0.25,
  pending: 0.5,
  confirming: 0.75,
  success: 1,
  failed: 1,
};

/**
 * Signal-native transaction lifecycle.
 *
 * Feed it wagmi/viem-style state through `source` and it derives the
 * stage: a reported hash with too few confirmations is "pending",
 * enough confirmations is "confirming", success/error map to
 * "success"/"failed". Stages the chain never reports, like "signing"
 * while the wallet prompt is open, are set manually.
 *
 * ```ts
 * const tx = createTxLifecycle({
 *   source: () => ({
 *     status: receiptQuery.status, // "pending" | "success" | "error" | "idle"
 *     confirmations: receiptQuery.confirmations,
 *   }),
 *   requiredConfirmations: 2,
 * })
 * const openWallet = () => {
 *   tx.set("signing")
 *   sendTransaction()
 * }
 * // <ProgressRing value={tx.progress()} state={tx.state()} />
 * ```
 *
 * SSR-safe: "idle" with `progress()` 0. Under reduced motion state
 * changes apply instantly and `progress()` jumps to its target.
 */
export function createTxLifecycle(
  options: TxLifecycleOptions = {},
): TxLifecycleControls {
  const {
    source,
    requiredConfirmations = 1,
    stiffness = 170,
    damping = 26,
    onEnter,
  } = options;

  const [state, setState] = createSignal<TxState>("idle");
  const [target, setTarget] = createSignal(0);
  const progress = createSpring(target, { stiffness, damping });

  const apply = (next: TxState): void => {
    const current = state();
    if (next === current) return;
    setState(next);
    setTarget(STATE_PROGRESS[next]);
    onEnter?.(next, current);
  };

  const derive = (input: TxStatusInput): TxState => {
    if (input.status === "success") return "success";
    if (input.status === "error") return "failed";
    if (input.status === "pending") {
      return (input.confirmations ?? 0) >= requiredConfirmations
        ? "confirming"
        : "pending";
    }
    return "idle";
  };

  if (source) {
    createEffect(() => {
      const next = derive(source());
      // Apply untracked: reading state() inside apply() must not make this
      // effect depend on state, or a manual set() would be undone by a
      // re-derive from the unchanged source.
      untrack(() => apply(next));
    });
  }

  return {
    state,
    set: apply,
    reset: () => apply("idle"),
    progress,
  };
}

/* ------------------------------------------------------------------ */
/* createTicker                                                        */
/* ------------------------------------------------------------------ */

export interface TickerOptions {
  /** Decimals in the formatted output. Default 2. */
  decimals?: number;
  /** Roll duration per digit, in ms. Default 400. */
  duration?: number;
  /** Flash color when the value rises. Default "#16a34a". */
  upColor?: string;
  /** Flash color when the value falls. Default "#dc2626". */
  downColor?: string;
  /** How long the flash color holds, in ms. Default 600. */
  flashMs?: number;
  /** Locale for grouping separators. Default "en-US". */
  locale?: string;
}

export interface TickerControls {
  /** Formatted value, SSR-safe. */
  display: Accessor<string>;
  /** Direction of the last update: "up" | "down" | "flat". */
  direction: Accessor<"up" | "down" | "flat">;
}

/**
 * Animated price/balance ticker: per-digit roll, direction flash.
 *
 * Each digit is a 0-9 strip in an overflow-hidden column, driven by a
 * single rAF task for the whole ticker. Rapid source updates batch to
 * one render per frame, keeping only the latest value, so a hot price
 * feed never queues animation debt. Non-digit characters (decimal
 * point, grouping separators, minus sign) render statically.
 *
 * ```tsx
 * let el!: HTMLSpanElement
 * const [price, setPrice] = createSignal(48210.5)
 * const ticker = createTicker(price, () => el, { decimals: 2 })
 * <span ref={el} style={{ color: ticker.direction() === "up" ? "green" : "red" }}>
 *   {ticker.display()}
 * </span>
 * ```
 *
 * SSR-safe: `display()` returns the formatted string with no DOM.
 * Under reduced motion the text swaps instantly: no roll, no flash.
 */
export function createTicker(
  source: Accessor<number>,
  ref: MaybeElement,
  options: TickerOptions = {},
): TickerControls {
  const {
    decimals = 2,
    duration = 400,
    upColor = "#16a34a",
    downColor = "#dc2626",
    flashMs = 600,
    locale = "en-US",
  } = options;
  const server = typeof window === "undefined";
  const easing = resolveEasing("easeOutCubic");

  const format = (v: number): string =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(v);

  const initial = untrack(source);
  const [display, setDisplay] = createSignal(format(initial));
  const [direction, setDirection] =
    createSignal<"up" | "down" | "flat">("flat");

  let prevValue = initial;
  let rendered = "";
  let strips: (HTMLElement | null)[] = [];
  let scheduled = false;
  let renderCancel: (() => void) | null = null;
  let flashStop: (() => void) | null = null;
  let driveCancel: (() => void) | null = null;

  interface DigitAnim {
    strip: HTMLElement;
    from: number;
    to: number;
    startAt: number;
  }
  let anims: DigitAnim[] = [];

  const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";

  /** One rAF task drives every rolling digit. */
  const drive = (): void => {
    if (driveCancel || anims.length === 0 || server) return;
    driveCancel = schedule((t) => {
      let alive = false;
      anims = anims.filter((a) => {
        const local = clamp01((t - a.startAt) / duration);
        const v = a.from + (a.to - a.from) * easing(local);
        a.strip.style.transform = `translateY(${fmt(-v * 10)}%)`;
        if (local < 1) alive = true;
        return local < 1;
      });
      if (!alive) driveCancel = null;
      return alive;
    });
  };

  const flash = (color: string): void => {
    const el = ref() as HTMLElement | null | undefined;
    if (!el) return;
    flashStop?.();
    el.style.color = color;
    const timer = animate(0, 1, {
      duration: Math.max(flashMs, 1),
      onComplete: () => {
        el.style.color = "";
      },
    });
    flashStop = timer.stop;
  };

  const makeStrip = (doc: Document, digit: number): HTMLElement => {
    const wrap = doc.createElement("span") as HTMLElement;
    wrap.style.display = "inline-block";
    wrap.style.overflow = "hidden";
    wrap.style.verticalAlign = "top";
    const strip = doc.createElement("span") as HTMLElement;
    strip.style.display = "block";
    strip.style.willChange = "transform";
    strip.style.transform = `translateY(${-digit * 10}%)`;
    for (let d = 0; d <= 9; d++) {
      const cell = doc.createElement("span") as HTMLElement;
      cell.textContent = String(d);
      cell.style.display = "block";
      cell.setAttribute("aria-hidden", "true");
      strip.appendChild(cell);
    }
    wrap.appendChild(strip);
    return wrap;
  };

  const stripOf = (wrap: HTMLElement): HTMLElement | null =>
    (wrap.firstChild as HTMLElement | null) ?? null;

  const render = (): void => {
    const value = untrack(source);
    const formatted = format(value);
    setDisplay(formatted);
    const dir = value > prevValue ? "up" : value < prevValue ? "down" : "flat";
    prevValue = value;
    setDirection(dir);
    if (dir !== "flat" && !prefersReducedMotion()) {
      flash(dir === "up" ? upColor : downColor);
    }

    const el = ref() as HTMLElement | null | undefined;
    if (!el || server) return;
    const doc = ownerDoc(el);
    if (!doc) return;

    if (prefersReducedMotion()) {
      // Accessibility: swap the text instantly, no roll, no flash.
      el.textContent = formatted;
      rendered = formatted;
      strips = [];
      return;
    }

    const chars = [...formatted];
    const prevChars = [...rendered];
    const maskChanged =
      rendered === "" ||
      chars.length !== prevChars.length ||
      chars.some((ch, i) => isDigit(ch) !== isDigit(prevChars[i]));
    if (maskChanged) {
      el.textContent = "";
      strips = [];
      for (const ch of chars) {
        if (isDigit(ch)) {
          const wrap = makeStrip(doc, Number(ch));
          el.appendChild(wrap);
          strips.push(stripOf(wrap));
        } else {
          const s = doc.createElement("span") as HTMLElement;
          s.textContent = ch;
          el.appendChild(s);
          strips.push(null);
        }
      }
      rendered = formatted;
      return;
    }
    // Same layout: roll only the digits that changed.
    const t = now();
    chars.forEach((ch, i) => {
      if (!isDigit(ch) || ch === prevChars[i]) return;
      const strip = strips[i];
      if (!strip) return;
      anims = anims.filter((a) => a.strip !== strip);
      anims.push({
        strip,
        from: Number(prevChars[i]),
        to: Number(ch),
        startAt: t,
      });
    });
    rendered = formatted;
    drive();
  };

  /** Batch rapid updates: at most one render per frame, latest wins. */
  const requestRender = (): void => {
    if (scheduled || server) return;
    scheduled = true;
    renderCancel?.();
    renderCancel = schedule(() => {
      scheduled = false;
      renderCancel = null;
      render();
      return false;
    });
  };

  if (!server) {
    createEffect(() => {
      source(); // track
      requestRender();
    });
  }

  onCleanup(() => {
    renderCancel?.();
    renderCancel = null;
    driveCancel?.();
    driveCancel = null;
    flashStop?.();
    flashStop = null;
  });

  return { display, direction };
}

/* ------------------------------------------------------------------ */
/* createMintReveal                                                    */
/* ------------------------------------------------------------------ */

export type MintRevealStatus =
  | "idle"
  | "anticipating"
  | "flipping"
  | "revealed";

export interface MintRevealOptions {
  /** Anticipation shake duration, in ms. Default 500. */
  shakeDuration?: number;
  /** rotateY flip duration, in ms. Default 700. */
  flipDuration?: number;
  /** Squash and stretch on landing. Default true. */
  squash?: boolean;
  /** Easing for the flip. Default "easeOutCubic". */
  easing?: Easing | EasingName;
  /** Called at the flip midpoint: swap the card faces here. */
  onFlip?: () => void;
}

export interface MintRevealControls {
  /** Play the full reveal choreography. Resolves when revealed. */
  play: () => Promise<void>;
  /** Return to "idle". */
  reset: () => void;
  /** Reactive status. */
  status: Accessor<MintRevealStatus>;
}

/**
 * Pack-open / card-reveal choreography, built on the cartoon family:
 * an anticipation shake, a rotateY flip with a face swap at the
 * midpoint, and squash and stretch driven by the flip's own velocity
 * as the card lands. Everything stays on compositor-friendly
 * properties (transform, and the CSS `scale` property for the deform).
 *
 * ```tsx
 * let card!: HTMLDivElement
 * const [face, setFace] = createSignal<"back" | "front">("back")
 * const reveal = createMintReveal(() => card, {
 *   onFlip: () => setFace("front"), // swap faces mid-flip
 * })
 * <button onClick={() => reveal.play()}>Reveal</button>
 * <div ref={card} style={{ "backface-visibility": "hidden" }}>
 *   {face() === "back" ? <CardBack /> : <NftFront />}
 * </div>
 * ```
 *
 * SSR-safe: no-op on the server, `status()` is "revealed" so the face
 * renders statically. Under reduced motion the shake and flip are
 * skipped and the final face shows at once.
 */
export function createMintReveal(
  ref: MaybeElement,
  options: MintRevealOptions = {},
): MintRevealControls {
  const {
    shakeDuration = 500,
    flipDuration = 700,
    squash = true,
    easing: easingOpt = "easeOutCubic",
    onFlip,
  } = options;
  const easing = resolveEasing(easingOpt);
  const server = typeof window === "undefined";

  const [status, setStatus] =
    createSignal<MintRevealStatus>(server ? "revealed" : "idle");
  const [flipP, setFlipP] = createSignal(0);

  let stopCurrent: (() => void) | null = null;
  let runToken = 0;

  if (squash) {
    // The flip's own progress is the motion source: the card stretches
    // mid-flip and squashes as it lands. Self-guards SSR and reduced
    // motion, where it applies no deform.
    createSquashStretch(ref, {
      source: flipP,
      fullSpeed: 400,
      impactThreshold: 1200,
    });
  }

  const play = (): Promise<void> => {
    const token = ++runToken;
    stopCurrent?.();
    stopCurrent = null;
    if (server) {
      setStatus("revealed");
      return Promise.resolve();
    }
    const el = ref() as HTMLElement | null | undefined;
    if (!el) {
      setStatus("revealed");
      return Promise.resolve();
    }
    if (prefersReducedMotion()) {
      // Accessibility: skip the shake and the flip.
      onFlip?.();
      setFlipP(180);
      setStatus("revealed");
      return Promise.resolve();
    }
    setStatus("anticipating");
    return (async () => {
      // Anticipation shake: wind up before the flip fires.
      // Await `finished` (not onComplete): it resolves when the animation
      // is stopped too, so reset() mid-play cannot strand this promise.
      if (token === runToken) {
        const ctl = createAnticipation(0, 0, {
          windup: 14,
          windupDuration: Math.max(shakeDuration * 0.55, 1),
          holdDuration: Math.max(shakeDuration * 0.15, 0),
          duration: Math.max(shakeDuration * 0.3, 1),
          onUpdate: (v) => {
            if (token === runToken) {
              el.style.transform = `translateX(${fmt(v)}px)`;
            }
          },
        });
        stopCurrent = ctl.stop;
        await ctl.finished;
      }
      if (token !== runToken) return;
      // The flip. onFlip fires at the midpoint, while the card is
      // edge-on and the face swap is invisible.
      setStatus("flipping");
      let flipped = false;
      const flip = animate(0, 180, {
        duration: Math.max(flipDuration, 1),
        easing,
        onUpdate: (v) => {
          if (token !== runToken) return;
          setFlipP(v);
          el.style.transform = `rotateY(${fmt(v)}deg)`;
          if (!flipped && v >= 90) {
            flipped = true;
            onFlip?.();
          }
        },
      });
      stopCurrent = flip.stop;
      await flip.finished;
      stopCurrent = null;
      if (token !== runToken) return;
      setFlipP(180);
      el.style.transform = "rotateY(180deg)";
      setStatus("revealed");
    })();
  };

  const reset = (): void => {
    runToken++;
    stopCurrent?.();
    stopCurrent = null;
    setFlipP(0);
    if (!server) {
      const el = ref() as HTMLElement | null | undefined;
      if (el) el.style.transform = "";
      setStatus("idle");
    }
  };

  onCleanup(() => {
    runToken++;
    stopCurrent?.();
    stopCurrent = null;
  });

  return { play, reset, status };
}

/* ------------------------------------------------------------------ */
/* createConnectButton                                                 */
/* ------------------------------------------------------------------ */

export interface ConnectButtonOptions {
  /** Magnetic pull strength, 0 to 1. Default 0.35. */
  strength?: number;
  /** Scale while pressed. Default 0.96. */
  pressScale?: number;
}

export type ConnectButtonStatus = "idle" | "ticking" | "pulsing";

export interface ConnectButtonControls {
  /** Checkmark tick for copy-address feedback. */
  copyTick: () => void;
  /** Expanding ring pulse for chain switches. */
  chainPulse: () => void;
  /** Reactive status: "idle" | "ticking" | "pulsing". */
  status: Accessor<ConnectButtonStatus>;
}

/**
 * Wallet connect-button micro-interactions: magnetic hover pull,
 * press scale, a checkmark tick for copy-address feedback, and an
 * expanding ring pulse for chain switches.
 *
 * The button's transform is owned by the primitive (magnetic pull
 * plus press scale); the tick and pulse animate overlay spans so
 * they never fight the hover motion. The button is given
 * `position: relative` the first time a tick or pulse runs, to stage
 * the overlays.
 *
 * ```tsx
 * let btn!: HTMLButtonElement
 * const connect = createConnectButton(() => btn)
 * const copy = async () => {
 *   await navigator.clipboard.writeText(address())
 *   connect.copyTick()
 * }
 * <button ref={btn} onClick={copy}>0x7a…f3c2</button>
 * ```
 *
 * SSR-safe: no-op on the server. Under reduced motion the magnetic
 * pull is off and the tick/pulse become instant state changes (the
 * check shows statically, then hides).
 */
export function createConnectButton(
  ref: MaybeElement,
  options: ConnectButtonOptions = {},
): ConnectButtonControls {
  const { strength = 0.35, pressScale = 0.96 } = options;
  const server = typeof window === "undefined";
  const staticMode = server || prefersReducedMotion();

  const [status, setStatus] = createSignal<ConnectButtonStatus>("idle");
  const [pressed, setPressed] = createSignal(false);

  const magnetic = createMagnetic(ref, { strength });

  let checkEl: HTMLElement | null = null;
  let ringEl: HTMLElement | null = null;
  let tickStop: (() => void) | null = null;
  let pulseStop: (() => void) | null = null;
  let tickToken = 0;
  let pulseToken = 0;

  const targets = (el: Element, target: unknown): boolean => {
    if (target === el) return true;
    const contains = (
      el as { contains?: (n: unknown) => boolean }
    ).contains;
    return (
      typeof contains === "function" && contains.call(el, target) === true
    );
  };

  if (!server && !staticMode) {
    const onDown = (e: { target?: unknown }): void => {
      const el = ref();
      if (el && targets(el, e.target)) setPressed(true);
    };
    const onUp = (): void => {
      setPressed(false);
    };
    const w = window as unknown as {
      addEventListener: (
        type: string,
        fn: (e: { target?: unknown }) => void,
      ) => void;
      removeEventListener: (
        type: string,
        fn: (e: { target?: unknown }) => void,
      ) => void;
    };
    w.addEventListener("pointerdown", onDown);
    w.addEventListener("pointerup", onUp);
    w.addEventListener("pointercancel", onUp);
    onCleanup(() => {
      w.removeEventListener("pointerdown", onDown);
      w.removeEventListener("pointerup", onUp);
      w.removeEventListener("pointercancel", onUp);
    });

    // The primitive owns the button's transform: magnetic pull plus
    // press scale. Tick and pulse use overlays, never the transform.
    createEffect(() => {
      const el = ref() as HTMLElement | null | undefined;
      if (!el) return;
      const s = pressed() ? pressScale : 1;
      el.style.transform =
        `translate(${fmt(magnetic.x())}px, ${fmt(magnetic.y())}px) scale(${fmt(s)})`;
    });
  }

  /** Stage the button for absolutely-positioned overlays. */
  const stage = (): { host: HTMLElement; doc: Document } | null => {
    const el = ref() as HTMLElement | null | undefined;
    if (!el || server) return null;
    const doc = ownerDoc(el);
    if (!doc) return null;
    if (el.style.position !== "relative" && el.style.position !== "absolute") {
      el.style.position = "relative";
    }
    return { host: el, doc };
  };

  const getCheck = (host: HTMLElement, doc: Document): HTMLElement => {
    if (!checkEl) {
      checkEl = doc.createElement("span") as HTMLElement;
      checkEl.textContent = "✓";
      checkEl.setAttribute("aria-hidden", "true");
      const s = checkEl.style;
      s.position = "absolute";
      s.inset = "0";
      s.display = "flex";
      s.alignItems = "center";
      s.justifyContent = "center";
      s.fontSize = "1.25em";
      s.pointerEvents = "none";
      s.opacity = "0";
      host.appendChild(checkEl);
    }
    return checkEl;
  };

  const getRing = (host: HTMLElement, doc: Document): HTMLElement => {
    if (!ringEl) {
      ringEl = doc.createElement("span") as HTMLElement;
      ringEl.setAttribute("aria-hidden", "true");
      const s = ringEl.style;
      s.position = "absolute";
      s.inset = "-2px";
      s.borderRadius = "inherit";
      s.pointerEvents = "none";
      s.opacity = "0";
      host.appendChild(ringEl);
    }
    return ringEl;
  };

  const copyTick = (): void => {
    const staged = stage();
    if (!staged) return;
    const token = ++tickToken;
    tickStop?.();
    tickStop = null;
    setStatus("ticking");
    const check = getCheck(staged.host, staged.doc);
    if (staticMode) {
      // Accessibility: show the check statically, then hide it.
      check.style.transform = "none";
      check.style.opacity = "1";
      const timer = animate(0, 1, {
        duration: 1200,
        onComplete: () => {
          if (token !== tickToken) return;
          check.style.opacity = "0";
          setStatus("idle");
        },
      });
      tickStop = timer.stop;
      return;
    }
    check.style.opacity = "1";
    const pop = animate(0, 1, {
      duration: 280,
      easing: "easeOutBack",
      onUpdate: (v) => {
        if (token !== tickToken) return;
        check.style.transform = `scale(${fmt(0.6 + 0.4 * v)})`;
        check.style.opacity = fmt(Math.min(v * 2, 1));
      },
      onComplete: () => {
        if (token !== tickToken) return;
        const fade = animate(1, 0, {
          duration: 220,
          onUpdate: (v) => {
            check.style.opacity = fmt(v);
          },
          onComplete: () => {
            if (token !== tickToken) return;
            setStatus("idle");
          },
        });
        tickStop = fade.stop;
      },
    });
    tickStop = pop.stop;
  };

  const chainPulse = (): void => {
    const staged = stage();
    if (!staged) return;
    const token = ++pulseToken;
    pulseStop?.();
    pulseStop = null;
    setStatus("pulsing");
    const ring = getRing(staged.host, staged.doc);
    if (staticMode) {
      // Accessibility: instant state change, no expanding ring.
      ring.style.opacity = "0";
      setStatus("idle");
      return;
    }
    const wave = animate(0, 1, {
      duration: 600,
      easing: "easeOutCubic",
      onUpdate: (v) => {
        if (token !== pulseToken) return;
        ring.style.opacity = fmt(1 - v);
        ring.style.boxShadow = `0 0 0 ${fmt(v * 14)}px currentColor`;
      },
      onComplete: () => {
        if (token !== pulseToken) return;
        ring.style.opacity = "0";
        ring.style.boxShadow = "none";
        setStatus("idle");
      },
    });
    pulseStop = wave.stop;
  };

  onCleanup(() => {
    tickToken++;
    pulseToken++;
    tickStop?.();
    tickStop = null;
    pulseStop?.();
    pulseStop = null;
  });

  return { copyTick, chainPulse, status };
}
