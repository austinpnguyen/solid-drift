import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { animate } from "./animate.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { createScrollProgress } from "./scroll.js";

type MaybeElement = () => Element | null | undefined;

function ownerDoc(el: Element): Document | undefined {
  const od = (el as unknown as { ownerDocument?: Document | null })
    .ownerDocument;
  if (od) return od ?? undefined;
  return typeof document !== "undefined" ? document : undefined;
}

/**
 * Split an element's text into per-character inline-block spans so each
 * letter can be transformed independently. The original text is preserved
 * as an aria-label for screen readers.
 */
function splitChars(el: Element): HTMLElement[] {
  const doc = ownerDoc(el);
  if (!doc) return [];
  const text = el.textContent ?? "";
  el.textContent = "";
  el.setAttribute("aria-label", text);
  const chars: HTMLElement[] = [];
  for (const ch of text) {
    const s = doc.createElement("span") as HTMLElement;
    s.textContent = ch === " " ? "\u00A0" : ch;
    s.setAttribute("aria-hidden", "true");
    s.style.display = "inline-block";
    s.style.willChange = "transform";
    el.appendChild(s);
    chars.push(s);
  }
  return chars;
}

export interface FontSwapOptions {
  /** Font family to swap to on hover. */
  to: string;
  /** Font weight to swap to. Defaults to keeping the current weight. */
  toWeight?: string | number;
  /** Duration in ms for each half of the letter roll. Default 160. */
  duration?: number;
  /** Stagger in ms between letters. Default 24. */
  stagger?: number;
  /** Easing for the roll. Default "easeInOutCubic". */
  easing?: Easing | EasingName;
  /** On touch devices (no hover) a tap toggles the swap. Default true. */
  tapToToggle?: boolean;
}

export interface FontSwapResult {
  /** True while the swapped font is showing. */
  swapped: Accessor<boolean>;
  /** Swap to the alternate font (true) or back (false). */
  swap: (to: boolean) => void;
  /** Toggle between the two fonts. */
  toggle: () => void;
}

/**
 * Swap a heading's font family (and optionally weight) on hover with a
 * per-letter roll: each letter flips away in the old font and lands in the
 * new one. Because the letters roll individually, the metric change never
 * reads as a layout jump.
 *
 * On touch devices a tap toggles the swap instead of hover. Under reduced
 * motion the font swaps instantly with no roll.
 */
export function createFontSwap(
  ref: MaybeElement,
  options: FontSwapOptions,
): FontSwapResult {
  const {
    to,
    toWeight,
    duration = 160,
    stagger = 24,
    easing: easingOpt = "easeInOutCubic",
    tapToToggle = true,
  } = options;
  const easing = resolveEasing(easingOpt);

  if (typeof window === "undefined") {
    const no = () => false;
    return { swapped: no, swap: () => {}, toggle: () => {} };
  }

  const [swapped, setSwapped] = createSignal(false);
  let chars: HTMLElement[] | null = null;
  let fromFont = "";
  let fromWeight = "";
  let stoppers: Array<() => void> = [];

  const ensureSplit = () => {
    const el = ref();
    if (!el || chars) return;
    fromFont = (el as HTMLElement).style.fontFamily || "";
    fromWeight = (el as HTMLElement).style.fontWeight || "";
    chars = splitChars(el);
  };

  const applyFont = (useTo: boolean) => {
    if (!chars) return;
    for (const c of chars) {
      c.style.fontFamily = useTo ? to : fromFont;
      if (toWeight !== undefined) {
        c.style.fontWeight = useTo ? String(toWeight) : fromWeight;
      }
    }
  };

  const flipChar = (
    c: HTMLElement,
    index: number,
    useTo: boolean,
  ): (() => void) => {
    let cancelled = false;
    let stopSecond = () => {};
    const first = animate(0, 90, {
      duration: Math.max(duration, 1),
      delay: index * stagger,
      easing,
      onUpdate: (v) => {
        if (!cancelled) c.style.transform = `rotateX(${v.toFixed(2)}deg)`;
      },
      onComplete: () => {
        if (cancelled) return;
        c.style.fontFamily = useTo ? to : fromFont;
        if (toWeight !== undefined) {
          c.style.fontWeight = useTo ? String(toWeight) : fromWeight;
        }
        stopSecond = animate(-90, 0, {
          duration: Math.max(duration, 1),
          easing,
          onUpdate: (v) => {
            if (!cancelled) c.style.transform = `rotateX(${v.toFixed(2)}deg)`;
          },
          onComplete: () => {
            if (!cancelled) c.style.transform = "";
          },
        }).stop;
      },
    });
    return () => {
      cancelled = true;
      first.stop();
      stopSecond();
    };
  };

  const swap = (useTo: boolean) => {
    ensureSplit();
    for (const stopChar of stoppers) stopChar();
    stoppers = [];
    if (!chars || prefersReducedMotion()) {
      applyFont(useTo);
      setSwapped(useTo);
      return;
    }
    setSwapped(useTo);
    stoppers = chars.map((c, i) => flipChar(c, i, useTo));
  };

  const toggle = () => swap(!untrack(swapped));

  createEffect(() => {
    const el = ref();
    if (!el) return;
    ensureSplit();
    const onEnter = () => swap(true);
    const onLeave = () => swap(false);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    let onTap: (() => void) | null = null;
    if (tapToToggle && window.matchMedia("(hover: none)").matches) {
      onTap = () => toggle();
      el.addEventListener("click", onTap);
    }
    onCleanup(() => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      if (onTap) el.removeEventListener("click", onTap);
    });
  });

  onCleanup(() => {
    for (const stopChar of stoppers) stopChar();
    stoppers = [];
  });

  return { swapped, swap, toggle };
}

export interface TypingOptions {
  /** Text to type. Defaults to the element's current text. */
  text?: string;
  /** Base milliseconds per character. Default 45. */
  speed?: number;
  /** Randomness 0..1 added to each character's timing. Default 0.4. */
  variance?: number;
  /** Extra pause in ms after specific characters. */
  pauses?: Record<string, number>;
  /** Cursor glyph. Set to "" for no cursor. Default "|". */
  cursor?: string;
  /** Cursor blink period in ms. Default 530. */
  blinkRate?: number;
  /** Start typing as soon as the element is available. Default true. */
  autostart?: boolean;
  /** Called when typing completes. */
  onComplete?: () => void;
}

export interface TypingResult {
  /** Start typing from the beginning. */
  start: () => void;
  /** Type again from an empty element. */
  replay: () => void;
  /** Stop typing where it is. */
  stop: () => void;
  /** True while characters are being typed. */
  typing: Accessor<boolean>;
  /** True once the full text is showing. */
  completed: Accessor<boolean>;
}

/**
 * Type out text character by character with human-like variable speed:
 * each character's delay jitters around the base speed, and punctuation
 * from `pauses` gets a beat of its own. A blinking block cursor rides
 * along and parks itself when the text is done.
 *
 * Under reduced motion (or on the server) the full text appears instantly.
 */
export function createTyping(
  ref: MaybeElement,
  options: TypingOptions = {},
): TypingResult {
  const {
    text: textOpt,
    speed = 45,
    variance = 0.4,
    pauses = { ".": 350, ",": 180, "!": 350, "?": 350, "\n": 450 },
    cursor = "|",
    blinkRate = 530,
    autostart = true,
    onComplete,
  } = options;

  if (typeof window === "undefined") {
    const no = () => false;
    return {
      start: () => {},
      replay: () => {},
      stop: () => {},
      typing: no,
      completed: no,
    };
  }

  const [typing, setTyping] = createSignal(false);
  const [completed, setCompleted] = createSignal(false);

  let full = textOpt ?? "";
  let textSpan: HTMLElement | null = null;
  let cursorSpan: HTMLElement | null = null;
  let cancel: (() => void) | null = null;
  let index = 0;
  let nextT = 0;
  let doneT = 0;
  let lastBlink = 0;
  let cursorOn = true;

  const ensureSetup = () => {
    const el = ref();
    if (!el || textSpan) return;
    const doc = ownerDoc(el);
    if (!doc) return;
    if (!textOpt) full = el.textContent ?? "";
    el.textContent = "";
    el.setAttribute("aria-label", full);
    textSpan = doc.createElement("span") as HTMLElement;
    textSpan.setAttribute("aria-hidden", "true");
    el.appendChild(textSpan);
    if (cursor) {
      cursorSpan = doc.createElement("span") as HTMLElement;
      cursorSpan.textContent = cursor;
      cursorSpan.setAttribute("aria-hidden", "true");
      el.appendChild(cursorSpan);
    }
    if (prefersReducedMotion()) {
      textSpan.textContent = full;
      if (cursorSpan) cursorSpan.style.display = "none";
      setCompleted(true);
    }
  };

  const charDelay = (ch: string): number => {
    const jitter = variance <= 0 ? 0 : (Math.random() * 2 - 1) * variance;
    return Math.max(1, speed * (1 + jitter) + (pauses[ch] ?? 0));
  };

  const loop = (t: number): boolean => {
    if (!textSpan) {
      cancel = null;
      return false;
    }
    while (index < full.length && t >= nextT) {
      const ch = full[index];
      index++;
      nextT = t + charDelay(ch);
      textSpan.textContent = full.slice(0, index);
      if (index >= full.length) doneT = t;
    }
    if (cursorSpan && t - lastBlink >= blinkRate) {
      lastBlink = t;
      cursorOn = !cursorOn;
      cursorSpan.style.opacity = cursorOn ? "1" : "0";
    }
    const tail = cursorSpan ? blinkRate * 2 : 0;
    if (index >= full.length && t - doneT >= tail) {
      if (cursorSpan) cursorSpan.style.display = "none";
      setTyping(false);
      setCompleted(true);
      cancel = null;
      onComplete?.();
      return false;
    }
    return true;
  };

  const start = () => {
    ensureSetup();
    if (!textSpan || prefersReducedMotion()) return;
    cancel?.();
    index = 0;
    doneT = 0;
    cursorOn = true;
    textSpan.textContent = "";
    if (cursorSpan) {
      cursorSpan.style.display = "";
      cursorSpan.style.opacity = "1";
    }
    setTyping(true);
    setCompleted(false);
    nextT = now();
    lastBlink = nextT;
    cancel = schedule(loop);
  };

  const stop = () => {
    cancel?.();
    cancel = null;
    setTyping(false);
  };

  if (autostart) {
    createEffect(() => {
      if (ref()) start();
    });
  }
  onCleanup(() => cancel?.());

  return { start, replay: start, stop, typing, completed };
}

export interface TextPhysicsOptions {
  /** How far above their slots (px) letters start falling. Default 320. */
  dropHeight?: number;
  /** Gravity in px/s^2. Default 2600. */
  gravity?: number;
  /** Bounciness 0..1 on each bounce. Default 0.45. */
  bounciness?: number;
  /** Max initial tumble in degrees. Default 200. */
  tumble?: number;
  /** Stagger in ms between letters. Default 45. */
  stagger?: number;
  /** Bounce speed below which a letter settles. Default 60. */
  restThreshold?: number;
  /** Called when every letter has settled. */
  onSettle?: () => void;
}

export interface TextPhysicsResult {
  /** Rain the letters in: they fall, tumble, bounce, and settle into place. */
  drop: () => void;
  /** Fling the letters apart so they can rain again. */
  scatter: () => void;
  /** True once every letter has settled. */
  settled: Accessor<boolean>;
}

/**
 * Per-letter cartoon physics: `drop()` rains each letter from above with
 * gravity, tumbling rotation, and squashy bounces until every letter lands
 * in its slot. `scatter()` flings the letters apart so they can rain again.
 *
 * Pair it with `createInView` to rain a headline in as it scrolls into view.
 * Under reduced motion (or on the server) letters simply sit in place.
 */
export function createTextPhysics(
  ref: MaybeElement,
  options: TextPhysicsOptions = {},
): TextPhysicsResult {
  const {
    dropHeight = 320,
    gravity = 2600,
    bounciness = 0.45,
    tumble = 200,
    stagger = 45,
    restThreshold = 60,
    onSettle,
  } = options;

  if (typeof window === "undefined") {
    const yes = () => true;
    return { drop: () => {}, scatter: () => {}, settled: yes };
  }

  interface Body {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vr: number;
    opacity: number;
    fading: boolean;
    live: boolean;
    startAt: number;
  }

  const [settled, setSettled] = createSignal(true);
  let chars: HTMLElement[] | null = null;
  let bodies: Body[] = [];
  let cancel: (() => void) | null = null;
  let lastT = 0;

  const ensureSplit = () => {
    const el = ref();
    if (!el || chars) return;
    chars = splitChars(el);
    bodies = chars.map(() => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rot: 0,
      vr: 0,
      opacity: 1,
      fading: false,
      live: false,
      startAt: 0,
    }));
  };

  const render = (i: number) => {
    const b = bodies[i];
    chars![i].style.transform =
      `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px) ` +
      `rotate(${b.rot.toFixed(1)}deg)`;
    chars![i].style.opacity = String(Math.max(0, Math.min(1, b.opacity)));
  };

  const park = (i: number) => {
    const b = bodies[i];
    b.x = 0;
    b.y = 0;
    b.vx = 0;
    b.vy = 0;
    b.rot = 0;
    b.vr = 0;
    b.opacity = 1;
    b.fading = false;
    b.live = false;
    render(i);
  };

  const loop = (t: number): boolean => {
    const dt = Math.min(Math.max((t - lastT) / 1000, 0), 0.064);
    lastT = t;
    let allRest = true;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.live) continue;
      if (t < b.startAt) {
        allRest = false;
        continue;
      }
      if (b.fading) {
        // Scatter: fly apart and fade out.
        b.vy += gravity * dt * 0.4;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        b.opacity -= dt * 1.5;
        if (b.opacity <= 0) {
          b.opacity = 0;
          b.live = false;
        } else {
          allRest = false;
        }
        render(i);
        continue;
      }
      b.vy += gravity * dt;
      b.y += b.vy * dt;
      b.x += b.vx * dt;
      b.rot += b.vr * dt;
      if (b.y >= 0) {
        b.y = 0;
        if (Math.abs(b.vy) > restThreshold) {
          b.vy = -b.vy * bounciness;
          b.vx *= 0.6;
          b.vr *= 0.5;
        } else {
          b.vy = 0;
          b.vr = 0;
          b.rot = 0;
          b.x *= Math.pow(0.02, dt);
          if (Math.abs(b.x) < 0.5) b.x = 0;
        }
      }
      if (b.y === 0 && b.vy === 0 && b.vr === 0 && b.x === 0) {
        b.live = false;
      } else {
        allRest = false;
      }
      render(i);
    }
    if (allRest) {
      setSettled(true);
      cancel = null;
      onSettle?.();
      return false;
    }
    return true;
  };

  const kick = (setupBody: (b: Body, i: number, t0: number) => void) => {
    ensureSplit();
    if (!chars) return;
    cancel?.();
    const t0 = now();
    bodies.forEach((b, i) => setupBody(b, i, t0));
    setSettled(false);
    lastT = t0;
    cancel = schedule(loop);
  };

  const drop = () => {
    if (prefersReducedMotion()) {
      ensureSplit();
      if (!chars) return;
      cancel?.();
      cancel = null;
      bodies.forEach((_, i) => park(i));
      setSettled(true);
      return;
    }
    kick((b, i, t0) => {
      b.live = true;
      b.fading = false;
      b.startAt = t0 + i * stagger;
      b.y = -dropHeight - Math.random() * 80;
      b.x = 0;
      b.vy = 0;
      b.vx = 0;
      b.rot = (Math.random() * 2 - 1) * tumble;
      b.vr = (Math.random() * 2 - 1) * 420;
      b.opacity = 1;
      render(i);
    });
  };

  const scatter = () => {
    if (prefersReducedMotion()) return;
    kick((b, i, t0) => {
      b.live = true;
      b.fading = true;
      b.startAt = t0 + i * 20;
      b.vy = -(450 + Math.random() * 750);
      b.vx = (Math.random() * 2 - 1) * 520;
      b.vr = (Math.random() * 2 - 1) * 540;
      b.opacity = 1;
      render(i);
    });
  };

  onCleanup(() => cancel?.());

  return { drop, scatter, settled };
}

export interface TextTunnelOptions {
  /** What drives the zoom: "time", "scroll", or your own 0..1 signal. Default "time". */
  drive?: "time" | "scroll" | Accessor<number>;
  /** Seconds per zoom cycle (time drive). Default 3. */
  period?: number;
  /** Number of depth layers. Default 6. */
  layers?: number;
  /** Scale of the front layer. Default 3. */
  zoom?: number;
}

export interface TextTunnelResult {
  /** The current 0..1 zoom phase. */
  progress: Accessor<number>;
  /** Stop a time-driven tunnel. */
  stop: () => void;
}

/**
 * An infinite 3D text tunnel: copies of the text at staggered depths zoom
 * toward the viewer forever, each fading in from the distance and out past
 * the camera. Drive it with time, with scroll progress, or with your own
 * 0..1 signal.
 *
 * Under reduced motion (or on the server) the text renders as a single
 * static line.
 */
export function createTextTunnel(
  ref: MaybeElement,
  options: TextTunnelOptions = {},
): TextTunnelResult {
  const { drive = "time", period = 3, layers = 6, zoom = 3 } = options;

  if (typeof window === "undefined") {
    return { progress: () => 0, stop: () => {} };
  }

  const el = ref();
  if (!el) return { progress: () => 0, stop: () => {} };
  const doc = ownerDoc(el);
  if (!doc) return { progress: () => 0, stop: () => {} };

  const [progress, setProgress] = createSignal(0);
  let cancel: (() => void) | null = null;

  if (!prefersReducedMotion()) {
    const text = el.textContent ?? "";
    el.textContent = "";
    el.setAttribute("aria-label", text);
    const host = el as HTMLElement;
    host.style.position = "relative";
    host.style.overflow = "hidden";

    // An invisible sizer keeps the box at the text's natural size.
    const sizer = doc.createElement("span") as HTMLElement;
    sizer.textContent = text;
    sizer.style.visibility = "hidden";
    sizer.setAttribute("aria-hidden", "true");
    el.appendChild(sizer);

    const clones: HTMLElement[] = [];
    for (let i = 0; i < Math.max(layers, 1); i++) {
      const s = doc.createElement("span") as HTMLElement;
      s.textContent = text;
      s.setAttribute("aria-hidden", "true");
      s.style.position = "absolute";
      s.style.inset = "0";
      s.style.display = "flex";
      s.style.alignItems = "center";
      s.style.justifyContent = "center";
      s.style.willChange = "transform, opacity";
      el.appendChild(s);
      clones.push(s);
    }

    const minScale = 0.25;
    const render = (p: number) => {
      for (let i = 0; i < clones.length; i++) {
        const d = (p + i / clones.length) % 1;
        const scale = minScale * Math.pow(zoom / minScale, d);
        const alpha = Math.min(
          Math.min(d / 0.12, 1),
          Math.min((1 - d) / 0.12, 1),
        );
        clones[i].style.transform = `scale(${scale.toFixed(3)})`;
        clones[i].style.opacity = String(Math.max(0, Math.min(1, alpha)));
      }
    };

    if (drive === "time") {
      const t0 = now();
      cancel = schedule((t) => {
        const p = ((((t - t0) / 1000 / period) % 1) + 1) % 1;
        setProgress(p);
        render(p);
        return true;
      });
    } else if (drive === "scroll") {
      const sp = createScrollProgress(ref);
      createEffect(() => {
        const p = sp();
        setProgress(p);
        render(p);
      });
    } else {
      createEffect(() => {
        const p = ((drive() % 1) + 1) % 1;
        setProgress(p);
        render(p);
      });
    }
  }

  onCleanup(() => cancel?.());

  return {
    progress,
    stop: () => {
      cancel?.();
      cancel = null;
    },
  };
}

export interface TextCutoutOptions {
  /**
   * "gradient": an animated inner world clipped inside the letterforms.
   * "window": transparent fill with a stroked outline, made to overlay a
   * live scene (canvas, video, 3D) so it shows through the letters.
   * Default "gradient".
   */
  mode?: "gradient" | "window";
  /** 0..1 signal driving the inner world. Defaults to a slow time drift. */
  progress?: Accessor<number>;
  /** The three colors of the inner world. */
  palette?: [string, string, string];
  /** Stroke color for "window" mode. Default "currentColor". */
  stroke?: string;
  /** Stroke width in px for "window" mode. Default 1.5. */
  strokeWidth?: number;
  /** Seconds per drift cycle (time drive). Default 9. */
  period?: number;
}

/**
 * Turn text into letter-shaped windows onto another world. In "gradient"
 * mode an animated nebula drifts behind the letterforms via
 * background-clip. In "window" mode the fill goes transparent with a
 * stroked outline: overlay it on a canvas, video, or 3D scene and the live
 * scene shows through the letters themselves.
 */
export function createTextCutout(
  ref: MaybeElement,
  options: TextCutoutOptions = {},
): { stop: () => void } {
  const {
    mode = "gradient",
    progress,
    palette = ["#312e81", "#7c3aed", "#22d3ee"],
    stroke = "currentColor",
    strokeWidth = 1.5,
    period = 9,
  } = options;

  if (typeof window === "undefined") return { stop: () => {} };
  const el = ref();
  if (!el) return { stop: () => {} };

  const st = (el as HTMLElement).style as CSSStyleDeclaration & {
    webkitBackgroundClip?: string;
    webkitTextStroke?: string;
  };
  let cancel: (() => void) | null = null;

  if (mode === "gradient") {
    st.color = "transparent";
    st.backgroundImage =
      `radial-gradient(circle at 25% 35%, ${palette[0]}, transparent 62%), ` +
      `radial-gradient(circle at 75% 65%, ${palette[1]}, transparent 62%), ` +
      `radial-gradient(circle at 50% 50%, ${palette[2]}, transparent 70%)`;
    st.backgroundSize = "220% 220%, 220% 220%, 220% 220%";
    st.webkitBackgroundClip = "text";
    st.backgroundClip = "text";

    const render = (p: number) => {
      const a = (p * 100).toFixed(2);
      const b = ((1 - p) * 100).toFixed(2);
      st.backgroundPosition = `${a}% ${b}%, ${b}% ${a}%, 50% 50%`;
    };

    if (prefersReducedMotion()) {
      render(0.35);
    } else if (progress) {
      createEffect(() => render(((progress() % 1) + 1) % 1));
    } else {
      const t0 = now();
      cancel = schedule((t) => {
        render(((((t - t0) / 1000 / period) % 1) + 1) % 1);
        return true;
      });
    }
  } else {
    st.color = "transparent";
    st.webkitTextStroke = `${strokeWidth}px ${stroke}`;
  }

  onCleanup(() => cancel?.());

  return {
    stop: () => {
      cancel?.();
      cancel = null;
    },
  };
}

export interface TextGradientOptions {
  /** 0..1 signal driving the hue cycle. Defaults to a slow time loop. */
  progress?: Accessor<number>;
  /** Hue degrees spread across the string. Default 140. */
  spread?: number;
  /** Base hue. Default 210. */
  hue?: number;
  /** Saturation percent. Default 85. */
  saturation?: number;
  /** Lightness percent. Default 62. */
  lightness?: number;
  /** Seconds per full hue cycle (time drive). Default 7. */
  period?: number;
}

/**
 * Paint each character its own hue and cycle the rainbow across the text:
 * the hue shifts along the string by `spread` degrees and the whole cycle
 * rotates over time (or with your own progress signal, e.g. scroll).
 * Under reduced motion the gradient parks on its first frame.
 */
export function createTextGradient(
  ref: MaybeElement,
  options: TextGradientOptions = {},
): { stop: () => void } {
  const {
    progress,
    spread = 140,
    hue = 210,
    saturation = 85,
    lightness = 62,
    period = 7,
  } = options;

  if (typeof window === "undefined") return { stop: () => {} };
  const el = ref();
  if (!el) return { stop: () => {} };
  const chars = splitChars(el);
  if (chars.length === 0) return { stop: () => {} };

  let cancel: (() => void) | null = null;

  const render = (shift: number) => {
    const n = chars.length;
    for (let i = 0; i < n; i++) {
      const along = n === 1 ? 0 : (i / (n - 1)) * spread;
      const h = (((hue + along + shift) % 360) + 360) % 360;
      chars[i].style.color =
        `hsl(${h.toFixed(1)}, ${saturation}%, ${lightness}%)`;
    }
  };

  if (prefersReducedMotion()) {
    render(0);
  } else if (progress) {
    createEffect(() => render(progress() * 360));
  } else {
    const t0 = now();
    cancel = schedule((t) => {
      render((((t - t0) / 1000 / period) % 1) * 360);
      return true;
    });
  }

  onCleanup(() => cancel?.());

  return {
    stop: () => {
      cancel?.();
      cancel = null;
    },
  };
}

export interface TextScrambleOptions {
  /** Text to reveal. Defaults to the element's current text. */
  text?: string;
  /** Glyph pool the letters scramble through. */
  charset?: string;
  /** Stagger in ms between characters starting. Default 28. */
  stagger?: number;
  /** How long in ms each character scrambles before locking in. Default 500. */
  duration?: number;
  /** Milliseconds between glyph swaps. Default 50. */
  frameRate?: number;
  /** Start as soon as the element is available. Default true. */
  autostart?: boolean;
  /** Called when every character has locked in. */
  onComplete?: () => void;
}

export interface TextScrambleResult {
  /** Start the decode from the beginning. */
  start: () => void;
  /** Run the decode again. */
  replay: () => void;
  /** Stop mid-decode. */
  stop: () => void;
  /** True while glyphs are still resolving. */
  scrambling: Accessor<boolean>;
}

/**
 * A decoder-ring text reveal: every character cycles through random glyphs
 * and locks into its final letter left to right, like a combination lock
 * finding its code. Spaces resolve instantly.
 *
 * Under reduced motion (or on the server) the full text appears instantly.
 */
export function createTextScramble(
  ref: MaybeElement,
  options: TextScrambleOptions = {},
): TextScrambleResult {
  const {
    text: textOpt,
    charset = "!<>-_\\/[]{}=+*^?#",
    stagger = 28,
    duration = 500,
    frameRate = 50,
    autostart = true,
    onComplete,
  } = options;

  if (typeof window === "undefined") {
    const no = () => false;
    return {
      start: () => {},
      replay: () => {},
      stop: () => {},
      scrambling: no,
    };
  }

  const [scrambling, setScrambling] = createSignal(false);
  let chars: HTMLElement[] | null = null;
  let full = textOpt ?? "";
  let cancel: (() => void) | null = null;
  let lastSwap = 0;

  const ensureSplit = () => {
    const el = ref();
    if (!el || chars) return;
    if (!textOpt) full = el.textContent ?? "";
    chars = splitChars(el);
  };

  const pick = (): string => charset[(Math.random() * charset.length) | 0];

  const start = () => {
    ensureSplit();
    if (!chars) return;
    if (prefersReducedMotion()) {
      chars.forEach((c, i) => {
        c.textContent = full[i] === " " ? "\u00A0" : full[i];
      });
      setScrambling(false);
      onComplete?.();
      return;
    }
    cancel?.();
    const t0 = now();
    lastSwap = 0;
    setScrambling(true);
    cancel = schedule((t) => {
      let done = true;
      if (t - lastSwap >= frameRate) {
        lastSwap = t;
        for (let i = 0; i < chars!.length; i++) {
          if (full[i] === " ") continue;
          const startAt = t0 + i * stagger;
          if (t < startAt) {
            done = false;
            continue;
          }
          if (t >= startAt + duration) {
            chars![i].textContent = full[i];
          } else {
            done = false;
            chars![i].textContent = pick();
          }
        }
      } else {
        for (let i = 0; i < chars!.length; i++) {
          if (full[i] === " ") continue;
          if (t < t0 + i * stagger + duration) {
            done = false;
            break;
          }
        }
      }
      if (done) {
        chars!.forEach((c, i) => {
          c.textContent = full[i] === " " ? "\u00A0" : full[i];
        });
        setScrambling(false);
        cancel = null;
        onComplete?.();
        return false;
      }
      return true;
    });
  };

  const stop = () => {
    cancel?.();
    cancel = null;
    setScrambling(false);
  };

  if (autostart) {
    createEffect(() => {
      if (ref()) start();
    });
  }
  onCleanup(() => cancel?.());

  return { start, replay: start, stop, scrambling };
}

export interface TextWaveOptions {
  /** Wave height in px. Default 9. */
  amplitude?: number;
  /** Characters per full wave. Default 7. */
  wavelength?: number;
  /** Seconds per wave cycle. Default 1.8. */
  period?: number;
  /** Tilt each character with the wave slope. Default true. */
  tilt?: boolean;
  /** 0..1 signal driving the phase (e.g. scroll). Defaults to time. */
  progress?: Accessor<number>;
}

/**
 * A traveling sine wave across the text: each character bobs up and down
 * (and tilts with the slope) as the wave passes through. Drive it with
 * time for an ambient shimmer or with scroll progress for a wave that
 * moves as you scroll. Under reduced motion the text sits still.
 */
export function createTextWave(
  ref: MaybeElement,
  options: TextWaveOptions = {},
): { stop: () => void } {
  const {
    amplitude = 9,
    wavelength = 7,
    period = 1.8,
    tilt = true,
    progress,
  } = options;

  if (typeof window === "undefined") return { stop: () => {} };
  const el = ref();
  if (!el) return { stop: () => {} };
  const chars = splitChars(el);
  if (chars.length === 0) return { stop: () => {} };

  let cancel: (() => void) | null = null;

  const render = (phase: number) => {
    for (let i = 0; i < chars.length; i++) {
      const p = 2 * Math.PI * (phase - i / wavelength);
      const y = amplitude * Math.sin(p);
      const r = tilt ? amplitude * 0.9 * Math.cos(p) : 0;
      chars[i].style.transform =
        `translateY(${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
    }
  };

  if (prefersReducedMotion()) {
    // Static: no wave.
  } else if (progress) {
    createEffect(() => render(progress()));
  } else {
    const t0 = now();
    cancel = schedule((t) => {
      render((t - t0) / 1000 / period);
      return true;
    });
  }

  onCleanup(() => cancel?.());

  return {
    stop: () => {
      cancel?.();
      cancel = null;
    },
  };
}
