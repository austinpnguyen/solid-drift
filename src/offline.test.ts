import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createOfflineQueue,
  type OfflineQueueControls,
} from "./offline.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const flushMicrotasks = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

const setup = (
  options: Partial<Parameters<typeof createOfflineQueue>[0]> = {},
): {
  q: OfflineQueueControls<string>;
  send: ReturnType<typeof vi.fn>;
  setOnline: (value: boolean) => void;
  dispose: () => void;
} => {
  const [online, setOnline] = createSignal(true);
  const send = vi.fn(async () => undefined);
  let q!: OfflineQueueControls<string>;
  const dispose = createRoot((d) => {
    q = createOfflineQueue<string>({ send, online, ...options });
    return d;
  });
  return { q, send, setOnline, dispose };
};

describe("createOfflineQueue", () => {
  it("sends immediately when online", async () => {
    const { q, send, dispose } = setup();
    await flushMicrotasks();
    const id = q.enqueue("hello");
    expect(typeof id).toBe("string");
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("hello");
    expect(q.pending()).toBe(0);
    expect(q.status()).toBe("online");
    dispose();
  });

  it("queues while offline and replays on reconnect", async () => {
    const { q, send, setOnline, dispose } = setup();
    setOnline(false);
    await flushMicrotasks();
    expect(q.status()).toBe("offline");
    q.enqueue("a");
    q.enqueue("b");
    await flushMicrotasks();
    expect(send).not.toHaveBeenCalled();
    expect(q.pending()).toBe(2);

    setOnline(true);
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBe("a");
    expect(send.mock.calls[1][0]).toBe("b");
    expect(q.pending()).toBe(0);
    dispose();
  });

  it("retries with backoff and parks the mutation as dead", async () => {
    const onDead = vi.fn();
    const onDrain = vi.fn();
    const { q, send, dispose } = setup({
      maxAttempts: 2,
      retryDelayMs: 1000,
      onDead,
      onDrain,
    });
    send.mockRejectedValue(new Error("boom"));
    q.enqueue("x");
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(1);
    expect(q.pending()).toBe(1);
    expect(q.queue()[0].attempts).toBe(1);
    expect(q.error()).toBeInstanceOf(Error);

    // Backoff: 1000ms after the first failure.
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(q.pending()).toBe(0);
    expect(q.dead()).toHaveLength(1);
    expect(q.dead()[0].attempts).toBe(2);
    expect(onDead).toHaveBeenCalledTimes(1);
    expect(onDrain).not.toHaveBeenCalled();
    dispose();
  });

  it("recovers when a retry succeeds", async () => {
    const onDrain = vi.fn();
    const { q, send, dispose } = setup({
      maxAttempts: 3,
      retryDelayMs: 500,
      onDrain,
    });
    send
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValueOnce(undefined);
    q.enqueue("x");
    await flushMicrotasks();
    expect(q.pending()).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(2);
    expect(q.pending()).toBe(0);
    expect(onDrain).toHaveBeenCalled();
    dispose();
  });

  it("retryDead re-enqueues a dead mutation", async () => {
    const { q, send, dispose } = setup({ maxAttempts: 1 });
    send.mockRejectedValue(new Error("boom"));
    q.enqueue("x");
    await flushMicrotasks();
    expect(q.dead()).toHaveLength(1);
    const id = q.dead()[0].id;

    send.mockResolvedValue(undefined);
    q.retryDead(id);
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(2);
    expect(q.dead()).toHaveLength(0);
    expect(q.pending()).toBe(0);
    dispose();
  });

  it("remove and clear drop queued mutations", async () => {
    const { q, setOnline, dispose } = setup();
    setOnline(false);
    await flushMicrotasks();
    const idA = q.enqueue("a");
    q.enqueue("b");
    q.remove(idA);
    expect(q.pending()).toBe(1);
    expect(q.queue()[0].payload).toBe("b");
    q.remove("missing");
    expect(q.pending()).toBe(1);
    q.clear();
    expect(q.pending()).toBe(0);
    dispose();
  });

  it("drops the oldest mutations past capacity", async () => {
    const { q, send, setOnline, dispose } = setup({ capacity: 2 });
    setOnline(false);
    await flushMicrotasks();
    q.enqueue("a");
    q.enqueue("b");
    q.enqueue("c");
    expect(q.pending()).toBe(2);
    expect(q.queue().map((m) => m.payload)).toEqual(["b", "c"]);
    expect(send).not.toHaveBeenCalled();
    dispose();
  });

  it("persists the queue to localStorage and restores it", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    const first = setup({ storageKey: "test:outbox" });
    first.setOnline(false);
    await flushMicrotasks();
    first.q.enqueue("saved");
    await flushMicrotasks();
    expect(store.get("test:outbox")).toContain("saved");
    first.dispose();

    const second = setup({ storageKey: "test:outbox" });
    expect(second.q.pending()).toBe(1);
    expect(second.q.queue()[0].payload).toBe("saved");
    second.dispose();
  });

  it("follows the internal online/offline listener by default", async () => {
    const listeners = new Map<string, Set<() => void>>();
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, fn: () => void) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: () => void) => {
        listeners.get(type)?.delete(fn);
      }),
    });
    const send = vi.fn(async () => undefined);
    let q!: OfflineQueueControls<string>;
    const dispose = createRoot((d) => {
      q = createOfflineQueue<string>({ send });
      return d;
    });
    await flushMicrotasks();
    const fire = (type: string): void => {
      listeners.get(type)?.forEach((fn) => fn());
    };
    fire("offline");
    await flushMicrotasks();
    expect(q.status()).toBe("offline");
    q.enqueue("held");
    await flushMicrotasks();
    expect(send).not.toHaveBeenCalled();
    fire("online");
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("is SSR-safe: no window means no crash", async () => {
    const send = vi.fn(async () => undefined);
    let q!: OfflineQueueControls<string>;
    const dispose = createRoot((d) => {
      q = createOfflineQueue<string>({ send, storageKey: "x" });
      return d;
    });
    expect(() => q.enqueue("a")).not.toThrow();
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(1);
    expect(() => q.clear()).not.toThrow();
    dispose();
  });

  it("keeps mutations enqueued while a send is pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: string[] = [];
    let calls = 0;
    const send = vi.fn(async (payload: string) => {
      calls += 1;
      if (calls === 1) await gate;
      sent.push(payload);
    });
    const [online] = createSignal(true);
    let q!: OfflineQueueControls<string>;
    const dispose = createRoot((d) => {
      q = createOfflineQueue<string>({ send, online });
      return d;
    });

    q.enqueue("a");
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(1);
    // Enqueue while send("a") is still in flight: the flush must not drop it.
    q.enqueue("b");
    release();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(sent).toEqual(["a", "b"]);
    expect(q.pending()).toBe(0);
    expect(q.queue()).toEqual([]);
    dispose();
  });
});
