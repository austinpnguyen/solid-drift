import { createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import { now, schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";

export type ToastKind = "info" | "success" | "warning" | "error";

/** Lifecycle state of a toast. Bind it to your enter/exit animation. */
export type ToastState = "entering" | "visible" | "leaving";

export interface Toast {
  /** Unique id, returned by the push helpers. */
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  state: ToastState;
  /** Millisecond timestamp when the toast entered the queue. */
  createdAt: number;
}

export interface ToastOptions {
  /** Visual kind. Default "info" (or the shortcut you called). */
  kind?: ToastKind;
  description?: string;
  /** Auto-dismiss after this many ms. Default 4000. 0 means sticky. */
  duration?: number;
}

export interface ToastQueueOptions {
  /** Max toasts in the queue; older ones are dismissed first. Default 5. */
  max?: number;
  /** Enter transition time in ms. Default 250. */
  enterMs?: number;
  /** Leave transition time in ms. Default 200. */
  leaveMs?: number;
  /** Default auto-dismiss time in ms. Default 4000. */
  duration?: number;
}

export interface ToastControls {
  /** Reactive list of toasts, oldest first. */
  toasts: Accessor<Toast[]>;
  /** Push a toast. Returns its id. */
  toast: (title: string, options?: ToastOptions) => number;
  info: (title: string, options?: ToastOptions) => number;
  success: (title: string, options?: ToastOptions) => number;
  warning: (title: string, options?: ToastOptions) => number;
  error: (title: string, options?: ToastOptions) => number;
  /** Start the leave transition for one toast. */
  dismiss: (id: number) => void;
  /** Dismiss every toast. */
  clear: () => void;
}

interface ToastTimers {
  enteredAt: number;
  /** 0 means sticky: never auto-dismisses. */
  deadline: number;
  leavingAt: number;
}

/**
 * A signal-native toast queue with choreographed lifecycle.
 *
 * The primitive owns timing and state; you own the rendering. Each toast
 * moves through `entering` -> `visible` -> `leaving` -> removed on the
 * shared animation clock, so you can bind `state` to CSS classes or drift
 * values for enter/exit motion without any timers of your own.
 *
 * SSR-safe: toasts pushed on the server start `visible`. Under reduced
 * motion the enter and leave transitions are instant, but auto-dismiss
 * timing still applies.
 *
 * ```tsx
 * import { createToast } from "solid-drift"
 *
 * const { toasts, success, dismiss } = createToast()
 * success("Payment sent", { description: "0.5 SOL to alice.sol" })
 *
 * <For each={toasts()}>
 *   {(t) => (
 *     <div
 *       class="toast"
 *       classList={{
 *         "toast-enter": t.state === "entering",
 *         "toast-leave": t.state === "leaving",
 *       }}
 *     >
 *       <strong>{t.title}</strong>
 *       {t.description && <p>{t.description}</p>}
 *       <button onClick={() => dismiss(t.id)}>Dismiss</button>
 *     </div>
 *   )}
 * </For>
 * ```
 */
export function createToast(
  options: ToastQueueOptions = {},
): ToastControls {
  const {
    max = 5,
    enterMs = 250,
    leaveMs = 200,
    duration: defaultDuration = 4000,
  } = options;

  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const timers = new Map<number, ToastTimers>();
  let nextId = 1;
  let cancelDriver: (() => void) | null = null;

  const tick = (t: number): boolean => {
    const list = untrack(toasts);
    if (list.length === 0) {
      cancelDriver = null;
      return false;
    }
    const em = prefersReducedMotion() ? 0 : enterMs;
    const lm = prefersReducedMotion() ? 0 : leaveMs;
    const out: Toast[] = [];
    for (const toast of list) {
      const meta = timers.get(toast.id);
      if (!meta) continue;
      if (toast.state === "entering" && t - meta.enteredAt >= em) {
        out.push({ ...toast, state: "visible" });
      } else if (
        toast.state === "visible" &&
        meta.deadline > 0 &&
        t >= meta.deadline
      ) {
        meta.leavingAt = t;
        out.push({ ...toast, state: "leaving" });
      } else if (toast.state === "leaving" && t - meta.leavingAt >= lm) {
        timers.delete(toast.id);
      } else {
        out.push(toast);
      }
    }
    const changed =
      out.length !== list.length ||
      out.some((toast, i) => toast !== list[i]);
    if (changed) setToasts(out);
    const busy = out.some((toast) => {
      const meta = timers.get(toast.id);
      return (
        toast.state === "entering" ||
        toast.state === "leaving" ||
        (toast.state === "visible" && !!meta && meta.deadline > 0)
      );
    });
    if (!busy) {
      cancelDriver = null;
      return false;
    }
    return true;
  };

  const ensureDriver = (): void => {
    if (!cancelDriver && typeof window !== "undefined") {
      cancelDriver = schedule(tick);
    }
  };

  const push = (
    kind: ToastKind,
    title: string,
    opts: ToastOptions = {},
  ): number => {
    const id = nextId++;
    const t = now();
    const duration = opts.duration ?? defaultDuration;
    const toast: Toast = {
      id,
      kind: opts.kind ?? kind,
      title,
      description: opts.description,
      state: typeof window === "undefined" ? "visible" : "entering",
      createdAt: t,
    };
    timers.set(id, {
      enteredAt: t,
      deadline: duration > 0 ? t + duration : 0,
      leavingAt: 0,
    });
    setToasts((prev) => {
      const next = [...prev, toast];
      if (next.length > max) {
        const excess = next.length - max;
        return next.map((item, i) => {
          if (i < excess && item.state !== "leaving") {
            const meta = timers.get(item.id);
            if (meta) meta.leavingAt = now();
            return { ...item, state: "leaving" as const };
          }
          return item;
        });
      }
      return next;
    });
    ensureDriver();
    return id;
  };

  const dismiss = (id: number): void => {
    const meta = timers.get(id);
    if (!meta) return;
    meta.leavingAt = now();
    setToasts((prev) =>
      prev.map((toast) =>
        toast.id === id && toast.state !== "leaving"
          ? { ...toast, state: "leaving" as const }
          : toast,
      ),
    );
    ensureDriver();
  };

  const clear = (): void => {
    const t = now();
    setToasts((prev) =>
      prev.map((toast) => {
        if (toast.state === "leaving") return toast;
        const meta = timers.get(toast.id);
        if (meta) meta.leavingAt = t;
        return { ...toast, state: "leaving" as const };
      }),
    );
    ensureDriver();
  };

  onCleanup(() => {
    cancelDriver?.();
    cancelDriver = null;
  });

  return {
    toasts,
    toast: (title, opts) => push("info", title, opts),
    info: (title, opts) => push("info", title, opts),
    success: (title, opts) => push("success", title, opts),
    warning: (title, opts) => push("warning", title, opts),
    error: (title, opts) => push("error", title, opts),
    dismiss,
    clear,
  };
}
