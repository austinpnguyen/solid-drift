import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import { resolveEasing, type Easing, type EasingName } from "./easing.js";
import { prefersReducedMotion } from "./reduced-motion.js";

/**
 * Pixel-to-sharp image reveal, the classic NFT mint ceremony.
 *
 * An image renders into a canvas fully pixelated, then resolves to
 * sharp in discrete chunky steps. Owns the canvas drawing: give it
 * an image and a canvas, call `play()` when the art should reveal.
 *
 * ```tsx
 * let img!: HTMLImageElement
 * let cvs!: HTMLCanvasElement
 * const reveal = createDepixelate(() => img, () => cvs, { duration: 1800 })
 * <img ref={img} src={artUrl} style={{ display: "none" }} />
 * <canvas ref={cvs} />
 * <button onClick={() => reveal.play()}>Reveal</button>
 * ```
 *
 * The pixelated teaser frame paints itself as soon as the image
 * loads, so the pre-reveal state needs no manual setup. Call `play()`
 * after the image has loaded; if the image or canvas is missing,
 * `play()` resolves immediately as revealed.
 *
 * SSR-safe: `status()` starts `"revealed"` and `play()` resolves
 * immediately. Reduced-motion safe: `play()` and `complete()` jump
 * straight to sharp.
 */
export type DepixelateStatus = "idle" | "revealing" | "revealed";

export interface DepixelateOptions {
  /**
   * Discrete pixelation steps from blocky to sharp. Default 10.
   * More steps make a smoother, longer-feeling resolve.
   */
  levels?: number;
  /** Full reveal duration in ms. Default 1600. */
  duration?: number;
  /** Easing for the reveal progress. Default "easeInOutCubic". */
  easing?: Easing | EasingName;
  /** Called when the reveal reaches sharp. */
  onComplete?: () => void;
}

export interface DepixelateControls {
  /** Current pixel block size in px. 1 (or 0) means fully sharp. */
  pixelSize: Accessor<number>;
  /** Reveal progress 0..1. */
  progress: Accessor<number>;
  status: Accessor<DepixelateStatus>;
  /** Start (or restart) the reveal. Resolves when sharp or stopped. */
  play: () => Promise<void>;
  /** Jump straight to sharp. */
  complete: () => void;
  /** Back to the fully pixelated teaser frame. */
  reset: () => void;
  /** Stop the reveal where it is. */
  stop: () => void;
}

export function createDepixelate(
  image: () => HTMLImageElement | null | undefined,
  canvas: () => HTMLCanvasElement | null | undefined,
  options: DepixelateOptions = {},
): DepixelateControls {
  const server = typeof window === "undefined";
  const {
    levels = 10,
    duration = 1600,
    easing: easingOpt = "easeInOutCubic",
    onComplete,
  } = options;
  const easing = resolveEasing(easingOpt);
  const steps = Math.max(1, Math.round(levels));

  const [pixelSize, setPixelSize] = createSignal(1);
  const [progress, setProgress] = createSignal(0);
  const [status, setStatus] = createSignal<DepixelateStatus>(
    server ? "revealed" : "idle",
  );

  let off: HTMLCanvasElement | null = null;
  const scratch = (): HTMLCanvasElement | null => {
    if (off || typeof document === "undefined") return off;
    off = document.createElement("canvas");
    return off;
  };

  /** Largest block size: chunky enough to hide the art, small enough to hint at it. */
  const startBlock = (img: HTMLImageElement): number =>
    Math.max(8, Math.floor(Math.min(img.naturalWidth, img.naturalHeight) / 12));

  const blockFor = (step: number, start: number): number => {
    if (step >= steps - 1) return 1;
    const t = 1 - step / Math.max(1, steps - 1);
    return Math.max(2, Math.round(start * t * t));
  };

  const draw = (block: number): void => {
    const img = image();
    const cvs = canvas();
    if (!img || !cvs) return;
    if (!img.complete || img.naturalWidth === 0) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (cvs.width !== w || cvs.height !== h) {
      cvs.width = w;
      cvs.height = h;
    }
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    if (block <= 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return;
    }
    const buf = scratch();
    if (!buf) return;
    const sw = Math.max(1, Math.round(w / block));
    const sh = Math.max(1, Math.round(h / block));
    buf.width = sw;
    buf.height = sh;
    const bctx = buf.getContext("2d");
    if (!bctx) return;
    bctx.imageSmoothingEnabled = true;
    bctx.drawImage(img, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(buf, 0, 0, sw, sh, 0, 0, w, h);
  };

  const paintTeaser = (): void => {
    const img = image();
    if (!img) return;
    const block = startBlock(img);
    draw(block);
    setPixelSize(block);
    setProgress(0);
  };

  const paintSharp = (): void => {
    draw(1);
    setPixelSize(1);
    setProgress(1);
  };

  // Paint the teaser frame as soon as the image is ready, so the
  // pre-reveal state works with no manual setup. Under reduced motion
  // the teaser is the sharp art, since the reveal itself is skipped.
  if (!server) {
    createEffect(() => {
      const img = image();
      if (!img || !img.complete || img.naturalWidth === 0) return;
      if (!canvas()) return;
      if (status() !== "idle") return;
      if (prefersReducedMotion()) {
        paintSharp();
      } else {
        paintTeaser();
      }
    });
  }

  let cancelTask: (() => void) | null = null;
  let finish: (() => void) | null = null;

  // Creation-time owner: cancel any in-flight reveal on unmount so a
  // disposed component never keeps drawing into a dead canvas.
  if (!server) {
    onCleanup(() => {
      cancelTask?.();
      cancelTask = null;
      finish?.();
      finish = null;
    });
  }

  const settle = (final: DepixelateStatus): void => {
    cancelTask?.();
    cancelTask = null;
    setStatus(final);
    finish?.();
    finish = null;
  };

  const play = (): Promise<void> => {
    cancelTask?.();
    cancelTask = null;
    finish?.();
    finish = null;
    if (server) {
      setStatus("revealed");
      return Promise.resolve();
    }
    const img = image();
    const cvs = canvas();
    if (!img || !cvs || !img.complete || img.naturalWidth === 0) {
      setStatus("revealed");
      return Promise.resolve();
    }
    if (prefersReducedMotion() || duration <= 0) {
      paintSharp();
      setStatus("revealed");
      onComplete?.();
      return Promise.resolve();
    }
    const start = startBlock(img);
    paintTeaser();
    setStatus("revealing");
    const t0 = now();
    let resolvePromise!: () => void;
    const done = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    finish = resolvePromise;
    cancelTask = schedule((t): boolean => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = easing(p);
      const step = Math.min(steps - 1, Math.floor(eased * steps));
      const block = blockFor(step, start);
      draw(block);
      setPixelSize(block);
      setProgress(eased);
      if (p >= 1) {
        paintSharp();
        settle("revealed");
        onComplete?.();
        return false;
      }
      return true;
    });
    return done;
  };

  const stop = (): void => {
    if (status() === "revealing") {
      settle("idle");
    }
  };

  const complete = (): void => {
    cancelTask?.();
    cancelTask = null;
    finish?.();
    finish = null;
    paintSharp();
    setStatus("revealed");
    onComplete?.();
  };

  const reset = (): void => {
    cancelTask?.();
    cancelTask = null;
    finish?.();
    finish = null;
    paintTeaser();
    setStatus("idle");
  };

  return { pixelSize, progress, status, play, complete, reset, stop };
}
