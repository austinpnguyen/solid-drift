/**
 * Devtools overlay for solid-drift.
 *
 * A small floating panel that shows live animation stats: the number of
 * animations currently running on the shared engine, the measured FPS,
 * and slow-motion buttons (0.25x / 0.5x / 1x) for inspecting motion.
 *
 * This module lives on its own subpath (`solid-drift/devtools`) and is
 * never imported by the library root. If you never import it, it is never
 * in your bundle. The component additionally renders nothing in
 * production builds, so even an unconditional import is harmless:
 *
 * ```tsx
 * import { DriftDevtools } from "solid-drift/devtools";
 *
 * // Shows the overlay in dev, renders nothing in production.
 * <DriftDevtools />;
 * ```
 */

import {
  createEffect,
  createSignal,
  onCleanup,
  type Component,
} from "solid-js";
import {
  getActiveTaskCount,
  getTimeScale,
  setTimeScale,
} from "./engine.js";

export interface DriftDevtoolsOptions {
  /**
   * Corner of the viewport for the overlay. Defaults to "bottom-right".
   */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /**
   * Show even in production builds. Defaults to false, meaning the
   * overlay only appears when `import.meta.env.DEV` is true.
   */
  forceShow?: boolean;
}

const SLOW_MO_STEPS = [0.25, 0.5, 1] as const;

function isDev(): boolean {
  try {
    return (
      typeof import.meta !== "undefined" &&
      (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true
    );
  } catch {
    return false;
  }
}

function cornerStyle(
  position: DriftDevtoolsOptions["position"],
): string {
  switch (position ?? "bottom-right") {
    case "top-left":
      return "top:12px;left:12px";
    case "top-right":
      return "top:12px;right:12px";
    case "bottom-left":
      return "bottom:12px;left:12px";
    default:
      return "bottom:12px;right:12px";
  }
}

/**
 * Floating devtools overlay: live animation count, FPS, slow-motion.
 * Renders nothing unless dev mode is on (or `forceShow` is set).
 * SSR-safe: all DOM work happens inside effects, which never run on the server.
 */
export const DriftDevtools: Component<DriftDevtoolsOptions> = (props) => {
  const [running, setRunning] = createSignal(0);
  const [fps, setFps] = createSignal(0);
  const [scale, setScale] = createSignal(getTimeScale());

  const visible = (): boolean =>
    props.forceShow === true || isDev();

  createEffect(() => {
    if (!visible()) return;
    if (typeof document === "undefined") return;

    const host = document.createElement("div");
    host.setAttribute("data-drift-devtools", "");
    host.style.cssText = `position:fixed;z-index:2147483647;${cornerStyle(props.position)};font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;color:#e8e8e8;background:rgba(17,17,20,0.92);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px 10px;user-select:none;pointer-events:auto;`;

    const title = document.createElement("div");
    title.textContent = "solid-drift devtools";
    title.style.cssText =
      "font-weight:700;margin-bottom:4px;letter-spacing:0.04em;text-transform:uppercase;font-size:10px;opacity:0.7;";
    host.appendChild(title);

    const stats = document.createElement("div");
    host.appendChild(stats);

    const row = document.createElement("div");
    row.style.cssText = "margin-top:6px;display:flex;gap:4px;";
    const buttons: HTMLButtonElement[] = [];
    for (const s of SLOW_MO_STEPS) {
      const btn = document.createElement("button");
      btn.textContent = `${s}x`;
      btn.style.cssText =
        "font:inherit;color:#e8e8e8;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);border-radius:4px;padding:2px 8px;cursor:pointer;";
      btn.addEventListener("click", () => {
        setTimeScale(s);
        setScale(getTimeScale());
      });
      btn.dataset.scale = String(s);
      buttons.push(btn);
      row.appendChild(btn);
    }
    host.appendChild(row);

    const paint = (): void => {
      stats.textContent = `running: ${running()}  fps: ${fps()}`;
      for (const btn of buttons) {
        const active = Number(btn.dataset.scale) === scale();
        btn.style.background = active
          ? "rgba(120,180,255,0.35)"
          : "rgba(255,255,255,0.08)";
      }
    };

    // Re-paint whenever a stat changes. Reading the signals here makes
    // this effect re-run on every update.
    createEffect(() => {
      running();
      fps();
      scale();
      paint();
    });

    document.body.appendChild(host);
    onCleanup(() => host.remove());
  });

  createEffect(() => {
    if (!visible()) return;
    if (typeof requestAnimationFrame === "undefined") return;

    let raf = 0;
    let frames = 0;
    let windowStart = 0;

    const measure = (t: number) => {
      if (windowStart === 0) windowStart = t;
      frames += 1;
      const elapsed = t - windowStart;
      if (elapsed >= 500) {
        setFps(Math.round((frames / elapsed) * 1000));
        frames = 0;
        windowStart = t;
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);

    // The task count only changes when animations start or stop, so a
    // 250ms poll is plenty and cheaper than per-frame reads.
    const pollTimer =
      typeof window !== "undefined"
        ? window.setInterval(() => setRunning(getActiveTaskCount()), 250)
        : 0;
    setRunning(getActiveTaskCount());

    onCleanup(() => {
      if (raf) cancelAnimationFrame(raf);
      if (pollTimer) window.clearInterval(pollTimer);
    });
  });

  // The overlay is built with plain DOM APIs inside effects, so the
  // component itself renders nothing into the SolidJS tree.
  return null;
};
