import { createSignal } from "solid-js";

export interface OptimisticControls<T, U> {
  /** Server truth plus every in-flight optimistic update, in commit order. */
  value: () => T;
  /** Replace the server truth (for example after a refetch). */
  setBase: (next: T | ((prev: T) => T)) => void;
  /** True while at least one commit is in flight. */
  pending: () => boolean;
  /** Number of commits currently in flight. */
  pendingCount: () => number;
  /** Last commit failure, cleared when the next commit starts. */
  error: () => Error | null;
  /**
   * Apply `update` immediately, then run `task`. On success the update is
   * promoted into the base truth (so the value stays stable while the
   * server catches up); on failure it is rolled back, `error()` is set,
   * and the error is rethrown so callers can react (toast, retry).
   */
  commit: (update: U, task: (update: U) => Promise<unknown>) => Promise<void>;
  /** Drop every in-flight optimistic update without running their tasks. */
  reset: () => void;
}

/**
 * createOptimistic
 *
 * Optimistic updates with rollback, in the spirit of React's `useOptimistic`.
 * The UI reflects `update` the moment `commit()` is called; if the backing
 * task (a transaction, a POST, a stream send) fails, that update is rolled
 * back and the error surfaces on `error()`.
 *
 * Write `apply` idempotently (upsert by id rather than blind append) when
 * the server truth delivered through `setBase` may already include an
 * optimistic update.
 *
 * ```ts
 * const feed = createOptimistic<Bid[], Bid>([], (bids, bid) =>
 *   bids.some((b) => b.id === bid.id) ? bids : [...bids, bid],
 * );
 *
 * await feed.commit(bid, (b) => sendBidTx(b)).catch(() => {
 *   // already rolled back; show a toast from feed.error()
 * });
 * ```
 */
export function createOptimistic<T, U>(
  initial: T,
  apply: (state: T, update: U) => T,
): OptimisticControls<T, U> {
  const [base, setBaseSignal] = createSignal<T>(initial);
  const [queue, setQueue] = createSignal<Array<{ id: number; update: U }>>([]);
  const [error, setError] = createSignal<Error | null>(null);
  let nextId = 0;

  const value = (): T => {
    const truth = base();
    const pending = queue();
    if (pending.length === 0) return truth;
    return pending.reduce<T>(
      (state, entry) => apply(state, entry.update),
      truth,
    );
  };

  const setBase = (next: T | ((prev: T) => T)): void => {
    if (typeof next === "function") {
      setBaseSignal(next as (prev: T) => T);
    } else {
      setBaseSignal(() => next);
    }
  };

  const commit = async (
    update: U,
    task: (update: U) => Promise<unknown>,
  ): Promise<void> => {
    const id = nextId++;
    setError(null);
    setQueue((q) => [...q, { id, update }]);
    try {
      await task(update);
      // Promote the confirmed update into the base truth so the value
      // stays stable while the server truth catches up via setBase.
      setBaseSignal((prev) => apply(prev, update));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setQueue((q) => q.filter((entry) => entry.id !== id));
    }
  };

  const reset = (): void => {
    setQueue([]);
    setError(null);
  };

  return {
    value,
    setBase,
    pending: () => queue().length > 0,
    pendingCount: () => queue().length,
    error,
    commit,
    reset,
  };
}
