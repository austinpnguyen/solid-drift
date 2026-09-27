import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";

/* ------------------------------------------------------------------ */
/* createOfflineQueue                                                   */
/* ------------------------------------------------------------------ */

/** Connection and flush state of the queue. */
export type OfflineQueueStatus = "online" | "offline" | "flushing";

/** One mutation waiting to be sent. */
export interface QueuedMutation<T = unknown> {
  /** Unique id, returned by `enqueue`. */
  id: string;
  payload: T;
  /** Send attempts so far. */
  attempts: number;
  /** `Date.now()` when enqueued. */
  enqueuedAt: number;
  /** Last send error, if any. */
  lastError?: unknown;
}

export interface OfflineQueueOptions<T = unknown> {
  /**
   * Sends one mutation. Throw or return a rejected promise on
   * failure; the mutation stays queued and is retried.
   */
  send: (payload: T, mutation: QueuedMutation<T>) => Promise<void> | void;
  /**
   * Online state accessor. Defaults to an internal listener on the
   * window `online`/`offline` events seeded from `navigator.onLine`
   * (assumes online on the server).
   */
  online?: Accessor<boolean>;
  /**
   * Send attempts per mutation before it is parked in `dead`.
   * Default 5.
   */
  maxAttempts?: number;
  /** Base delay for retry backoff, doubled per attempt. Default 1000. */
  retryDelayMs?: number;
  /**
   * localStorage key persisting the queue across reloads. Payloads
   * must be JSON-serializable when this is set. Default null
   * (memory only).
   */
  storageKey?: string | null;
  /**
   * Maximum queued mutations; the oldest are dropped past this.
   * Default 100.
   */
  capacity?: number;
  /** Fires when a flush sends mutations and empties the queue. */
  onDrain?: () => void;
  /** Fires when a mutation exhausts its attempts and is parked. */
  onDead?: (mutation: QueuedMutation<T>) => void;
}

export interface OfflineQueueControls<T = unknown> {
  /** Queued mutations, oldest first. */
  queue: Accessor<QueuedMutation<T>[]>;
  /** Mutations that exhausted their attempts. */
  dead: Accessor<QueuedMutation<T>[]>;
  /** Number of mutations waiting. */
  pending: Accessor<number>;
  /** Current status. */
  status: Accessor<OfflineQueueStatus>;
  /** Last send error, if any. */
  error: Accessor<unknown>;
  /**
   * Enqueue a mutation. Sends immediately when online, otherwise
   * waits for reconnect. Returns the mutation id.
   */
  enqueue: (payload: T) => string;
  /** Send everything queued now, in order. */
  flush: () => Promise<void>;
  /** Remove a queued mutation by id. */
  remove: (id: string) => void;
  /** Move a dead mutation back to the queue with attempts reset. */
  retryDead: (id: string) => void;
  /** Clear the whole queue. */
  clear: () => void;
}

let idCounter = 0;

const makeId = (): string =>
  `${Date.now().toString(36)}-${(idCounter += 1)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

/**
 * Offline-first mutation queue. `enqueue()` a like, a chat message,
 * or an order while offline and it waits; on reconnect the queue
 * replays in order with exponential backoff, and anything that keeps
 * failing lands in `dead` for the UI to surface instead of
 * disappearing silently.
 *
 * SSR-safe: no browser APIs are touched on the server (online is
 * assumed, persistence disabled). Payloads must be JSON-serializable
 * when `storageKey` persistence is enabled.
 *
 * ```ts
 * const outbox = createOfflineQueue({
 *   send: (payload) => fetch("/api/messages", {
 *     method: "POST",
 *     body: JSON.stringify(payload),
 *   }).then((r) => {
 *     if (!r.ok) throw new Error(`HTTP ${r.status}`);
 *   }),
 *   storageKey: "my-app:outbox",
 * });
 * outbox.enqueue({ text: "hello" }); // sends now, or when back online
 * ```
 */
export function createOfflineQueue<T = unknown>(
  options: OfflineQueueOptions<T>,
): OfflineQueueControls<T> {
  const {
    send,
    online: onlineProp,
    maxAttempts = 5,
    retryDelayMs = 1000,
    storageKey = null,
    capacity = 100,
    onDrain,
    onDead,
  } = options;

  const isClient = typeof window !== "undefined";
  const [internalOnline, setInternalOnline] = createSignal(
    !isClient ||
      (typeof navigator !== "undefined" ? navigator.onLine !== false : true),
  );

  if (!onlineProp && isClient) {
    const goOnline = (): void => {
      setInternalOnline(true);
    };
    const goOffline = (): void => {
      setInternalOnline(false);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    onCleanup(() => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    });
  }

  const isOnline = (): boolean =>
    onlineProp ? onlineProp() : internalOnline();

  const loadPersisted = (): QueuedMutation<T>[] => {
    if (!storageKey || !isClient) return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return (parsed as Array<Partial<QueuedMutation<T>>>)
        .filter(
          (m): m is QueuedMutation<T> =>
            !!m && typeof m.id === "string" && "payload" in m,
        )
        .map((m) => ({
          id: m.id,
          payload: m.payload as T,
          attempts: typeof m.attempts === "number" ? m.attempts : 0,
          enqueuedAt: typeof m.enqueuedAt === "number" ? m.enqueuedAt : Date.now(),
        }));
    } catch {
      return [];
    }
  };

  const [queue, setQueue] =
    createSignal<QueuedMutation<T>[]>(loadPersisted());
  const [dead, setDead] = createSignal<QueuedMutation<T>[]>([]);
  const [status, setStatus] = createSignal<OfflineQueueStatus>(
    isOnline() ? "online" : "offline",
  );
  const [error, setError] = createSignal<unknown>(undefined);

  let flushing = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const persist = (): void => {
    if (!storageKey || !isClient) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(queue()));
    } catch {
      // Storage full or unavailable: the in-memory queue still works.
    }
  };

  const clearRetryTimer = (): void => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const scheduleRetry = (attempts: number): void => {
    clearRetryTimer();
    const delay = Math.max(0, retryDelayMs) * 2 ** Math.max(0, attempts - 1);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void flush();
    }, delay);
  };

  const flush = async (): Promise<void> => {
    if (flushing || !isOnline()) return;
    flushing = true;
    clearRetryTimer();
    setStatus("flushing");
    try {
      let sent = 0;
      for (;;) {
        // Read the head fresh on every iteration: a mutation enqueued while
        // a send() is pending joins this flush instead of being dropped.
        const mutation = queue()[0];
        if (!mutation) break;
        try {
          await send(mutation.payload, mutation);
          sent += 1;
          // Remove by id through an updater, never by overwriting the queue
          // from a stale snapshot taken before send() was awaited.
          setQueue((q) => {
            const at = q.findIndex((m) => m.id === mutation.id);
            return at < 0 ? q : [...q.slice(0, at), ...q.slice(at + 1)];
          });
          persist();
        } catch (err) {
          const attempts = mutation.attempts + 1;
          setError(err);
          if (attempts >= Math.max(1, maxAttempts)) {
            setQueue((q) => q.filter((m) => m.id !== mutation.id));
            const deadOne: QueuedMutation<T> = {
              ...mutation,
              attempts,
              lastError: err,
            };
            setDead((d) => [...d, deadOne]);
            persist();
            onDead?.(deadOne);
          } else {
            setQueue((q) =>
              q.map((m) =>
                m.id === mutation.id ? { ...m, attempts, lastError: err } : m,
              ),
            );
            persist();
            scheduleRetry(attempts);
            break;
          }
        }
      }
      if (queue().length === 0 && sent > 0) onDrain?.();
      setStatus(isOnline() ? "online" : "offline");
    } finally {
      flushing = false;
    }
  };

  const enqueue = (payload: T): string => {
    const mutation: QueuedMutation<T> = {
      id: makeId(),
      payload,
      attempts: 0,
      enqueuedAt: Date.now(),
    };
    setQueue((q) => {
      const next = [...q, mutation];
      return next.length > Math.max(1, capacity)
        ? next.slice(next.length - Math.max(1, capacity))
        : next;
    });
    persist();
    if (isOnline()) void flush();
    return mutation.id;
  };

  createEffect(() => {
    const online = isOnline();
    if (!flushing) setStatus(online ? "online" : "offline");
    if (online) void flush();
  });

  onCleanup(() => {
    clearRetryTimer();
  });

  return {
    queue,
    dead,
    pending: () => queue().length,
    status,
    error,
    enqueue,
    flush,
    remove: (id: string) => {
      setQueue((q) => q.filter((m) => m.id !== id));
      persist();
    },
    retryDead: (id: string) => {
      const found = dead().find((m) => m.id === id);
      if (!found) return;
      setDead((d) => d.filter((m) => m.id !== id));
      setQueue((q) => [
        ...q,
        { ...found, attempts: 0, lastError: undefined },
      ]);
      persist();
      if (isOnline()) void flush();
    },
    clear: () => {
      clearRetryTimer();
      setQueue([]);
      persist();
    },
  };
}
