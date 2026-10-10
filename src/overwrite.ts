/**
 * Overwrite management: kill in-flight tweens when a new one takes over.
 *
 * Hover spam and rapid retriggers are the number one source of animation
 * bugs in production. With `overwrite: "auto"`, starting a new tween kills
 * any active tween registered under the same id, so only the latest one
 * ever drives the value.
 */

export type OverwriteMode = "auto" | "none";

interface Entry {
  kill: () => void;
  onInterrupt?: () => void;
}

const registry = new Map<string, Set<Entry>>();

function getSet(id: string): Set<Entry> {
  let set = registry.get(id);
  if (!set) {
    set = new Set();
    registry.set(id, set);
  }
  return set;
}

/**
 * Register an active tween under an id. Returns an unregister function.
 * When `overwrite` is "auto", all other entries under the same id are
 * killed first (their `onInterrupt` runs, not `onComplete`).
 */
export function registerTween(
  id: string,
  entry: Entry,
  overwrite: OverwriteMode,
): () => void {
  if (overwrite === "auto") {
    const set = registry.get(id);
    if (set) {
      for (const other of [...set]) {
        set.delete(other);
        try {
          other.kill();
        } catch {
          // A throwing kill must not break the new tween.
        }
        try {
          other.onInterrupt?.();
        } catch {
          // A throwing onInterrupt must not break the new tween.
        }
      }
    }
  }
  const set = getSet(id);
  set.add(entry);
  return () => {
    set.delete(entry);
    if (set.size === 0) registry.delete(id);
  };
}

/**
 * Kill every active tween registered under `id`. Killed tweens get
 * `onInterrupt`, not `onComplete`.
 */
export function killTweensOf(id: string): void {
  const set = registry.get(id);
  if (!set) return;
  for (const entry of [...set]) {
    set.delete(entry);
    try {
      entry.kill();
    } catch {
      // ignore
    }
    try {
      entry.onInterrupt?.();
    } catch {
      // ignore
    }
  }
  registry.delete(id);
}

/** Number of ids with active tweens. Useful for tests. */
export function activeOverwriteIds(): number {
  return registry.size;
}
