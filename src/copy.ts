import { createSignal, onCleanup } from "solid-js";

export interface CopyOptions {
  /** Milliseconds before `copied` flips back to false. Default 2000. */
  resetDelay?: number;
  /** Skip the execCommand fallback and require the async Clipboard API. Default false. */
  noFallback?: boolean;
}

export interface CopyControls {
  /** True briefly after a successful copy (for "Copied!" feedback). */
  copied: () => boolean;
  error: () => Error | null;
  copy: (text: string) => Promise<void>;
  reset: () => void;
}

function legacyCopy(text: string): void {
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (!doc || typeof doc.execCommand !== "function") {
    throw new Error("Clipboard API is not supported.");
  }
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  doc.body.appendChild(area);
  area.select();
  const ok = doc.execCommand("copy");
  doc.body.removeChild(area);
  if (!ok) throw new Error("Copy command failed.");
}

/**
 * createCopy
 *
 * Copy-to-clipboard with a `copied` flag for transient feedback. Uses the
 * async Clipboard API with an `execCommand` fallback for older browsers.
 *
 * ```tsx
 * const clipboard = createCopy();
 * <button onClick={() => clipboard.copy(link())}>
 *   {clipboard.copied() ? "Copied!" : "Copy link"}
 * </button>
 * ```
 */
export function createCopy(options: CopyOptions = {}): CopyControls {
  const { resetDelay = 2000, noFallback = false } = options;
  const [copied, setCopied] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const markCopied = (): void => {
    setCopied(true);
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (resetDelay > 0) {
      timer = setTimeout(() => {
        timer = null;
        setCopied(false);
      }, resetDelay);
    }
  };

  const copy = async (text: string): Promise<void> => {
    setError(null);
    const nav = (globalThis as unknown as { navigator?: Navigator }).navigator;
    try {
      const writeText = (nav as unknown as {
        clipboard?: { writeText?: (text: string) => Promise<void> };
      })?.clipboard?.writeText;
      if (typeof writeText === "function") {
        await writeText.call(nav?.clipboard, text);
        markCopied();
        return;
      }
      if (!noFallback) {
        legacyCopy(text);
        markCopied();
        return;
      }
      throw new Error("Clipboard API is not supported.");
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  };

  const reset = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    setCopied(false);
  };

  onCleanup(reset);

  return { copied, error, copy, reset };
}
