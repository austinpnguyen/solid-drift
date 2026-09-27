import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "solid-js";
import {
  createTracker,
  useConsent,
  createFunnel,
  type TrackEvent,
} from "./analytics.js";

function setup<T>(fn: () => T): { result: T; dispose: () => void } {
  let result!: T;
  let dispose!: () => void;
  createRoot((d) => {
    result = fn();
    dispose = d;
  });
  return { result, dispose };
}

afterEach(() => {
  vi.useRealTimers();
});

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/* ----------------------------- createTracker ----------------------------- */

describe("createTracker", () => {
  it("batches events to the sink on the batch window", async () => {
    vi.useFakeTimers();
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 1000 }),
    );
    tracker.track("click", { id: "a" });
    tracker.track("click", { id: "b" });
    expect(sink).not.toHaveBeenCalled();
    expect(tracker.queue()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink).toHaveBeenCalledTimes(1);
    const events = sink.mock.calls[0][0] as TrackEvent[];
    expect(events.map((e) => e.name)).toEqual(["click", "click"]);
    expect(events[0].props).toEqual({ id: "a" });
    expect(typeof events[0].timestamp).toBe("number");
    expect(tracker.queue()).toHaveLength(0);
    dispose();
  });

  it("flushes immediately when batchMs is 0", async () => {
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 0 }),
    );
    tracker.track("click");
    await Promise.resolve();
    expect(sink).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("flushes early when batchSize is reached", async () => {
    vi.useFakeTimers();
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 60000, batchSize: 2 }),
    );
    tracker.track("a");
    tracker.track("b");
    await vi.advanceTimersByTimeAsync(0);
    expect(sink).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("manual flush sends the queue", async () => {
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 60000 }),
    );
    tracker.track("a");
    await tracker.flush();
    expect(sink).toHaveBeenCalledTimes(1);
    await tracker.flush();
    expect(sink).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("holds events while consent is false and flushes on grant", async () => {
    vi.useFakeTimers();
    const sink = vi.fn();
    let granted = false;
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 1000, consent: () => granted }),
    );
    tracker.track("a");
    await vi.advanceTimersByTimeAsync(2000);
    expect(sink).not.toHaveBeenCalled();
    expect(tracker.queue()).toHaveLength(1);
    granted = true;
    await tracker.flush();
    expect(sink).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("drops events when disabled", async () => {
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 0 }),
    );
    tracker.setEnabled(false);
    tracker.track("a");
    await Promise.resolve();
    expect(sink).not.toHaveBeenCalled();
    expect(tracker.queue()).toHaveLength(0);
    dispose();
  });

  it("strips blocked props", async () => {
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 0, blockProps: ["email"] }),
    );
    tracker.track("signup", { email: "a@b.c", plan: "pro" });
    await Promise.resolve();
    const events = sink.mock.calls[0][0] as TrackEvent[];
    expect(events[0].props).toEqual({ plan: "pro" });
    dispose();
  });

  it("sampleRate 0 drops everything", async () => {
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 0, sampleRate: 0 }),
    );
    tracker.track("a");
    await Promise.resolve();
    expect(sink).not.toHaveBeenCalled();
    dispose();
  });

  it("identify attaches the user id to later events", async () => {
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 0 }),
    );
    tracker.identify("u1", { plan: "pro" });
    tracker.track("click");
    await Promise.resolve();
    const calls = sink.mock.calls.map((c) => c[0][0] as TrackEvent);
    expect(calls[0].name).toBe("$identify");
    expect(calls[0].userId).toBe("u1");
    expect(calls[1].userId).toBe("u1");
    dispose();
  });

  it("page tracks a $page event", async () => {
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 0 }),
    );
    tracker.page("pricing");
    await Promise.resolve();
    const event = sink.mock.calls[0][0][0] as TrackEvent;
    expect(event.name).toBe("$page");
    expect(event.props.page).toBe("pricing");
    dispose();
  });

  it("reset clears the queue and identity", async () => {
    vi.useFakeTimers();
    const sink = vi.fn();
    const { result: tracker, dispose } = setup(() =>
      createTracker({ sink, batchMs: 60000 }),
    );
    tracker.identify("u1");
    tracker.track("a");
    tracker.reset();
    expect(tracker.queue()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(sink).not.toHaveBeenCalled();
    dispose();
  });
});

/* ------------------------------- useConsent ------------------------------- */

describe("useConsent", () => {
  it("starts unknown and toggles", () => {
    const { result: consent, dispose } = setup(() => useConsent());
    expect(consent.consent()).toBe("unknown");
    expect(consent.granted()).toBe(false);
    consent.grant();
    expect(consent.consent()).toBe("granted");
    expect(consent.granted()).toBe(true);
    consent.deny();
    expect(consent.consent()).toBe("denied");
    expect(consent.granted()).toBe(false);
    consent.reset();
    expect(consent.consent()).toBe("unknown");
    dispose();
  });

  it("persists the choice when a storageKey is given", () => {
    const storage = new MemoryStorage();
    const first = setup(() =>
      useConsent({
        storageKey: "consent",
        storage: storage as unknown as Storage,
      }),
    );
    first.result.grant();
    first.dispose();

    const second = setup(() =>
      useConsent({
        storageKey: "consent",
        storage: storage as unknown as Storage,
      }),
    );
    expect(second.result.consent()).toBe("granted");
    second.result.reset();
    expect(storage.getItem("consent")).toBeNull();
    second.dispose();
  });

  it("gates a tracker end to end", async () => {
    const sink = vi.fn();
    const storage = new MemoryStorage();
    const { result: consent, dispose: disposeConsent } = setup(() =>
      useConsent({
        storageKey: "consent",
        storage: storage as unknown as Storage,
      }),
    );
    const { result: tracker, dispose: disposeTracker } = setup(() =>
      createTracker({ sink, batchMs: 0, consent: consent.granted }),
    );
    tracker.track("a");
    await Promise.resolve();
    expect(sink).not.toHaveBeenCalled();
    consent.grant();
    // The tracker's consent effect flushes held events on grant.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(sink).toHaveBeenCalledTimes(1);
    disposeTracker();
    disposeConsent();
  });
});

/* ------------------------------ createFunnel ------------------------------ */

describe("createFunnel", () => {
  const funnelOptions = (track: (name: string, props?: Record<string, unknown>) => void, now: () => number) => ({
    name: "checkout",
    steps: ["cart", "details", "payment", "done"],
    tracker: { track },
    now,
  });

  it("walks steps and completes", () => {
    const track = vi.fn();
    let t = 1000;
    const { result: funnel, dispose } = setup(() =>
      createFunnel(funnelOptions(track, () => t)),
    );
    expect(funnel.step()).toBe(-1);
    funnel.enter();
    expect(funnel.step()).toBe(0);
    expect(funnel.current()).toBe("cart");
    expect(funnel.completed()).toBe(false);

    funnel.advance();
    expect(funnel.current()).toBe("details");
    funnel.advance("done");
    expect(funnel.step()).toBe(3);
    expect(funnel.completed()).toBe(true);

    const names = track.mock.calls.map((c) => c[0]);
    expect(names).toEqual([
      "funnel_enter",
      "funnel_step",
      "funnel_step",
      "funnel_complete",
    ]);
    const completeProps = track.mock.calls[3][1] as Record<string, unknown>;
    expect(completeProps.funnel).toBe("checkout");
    expect(completeProps.steps).toBe(4);
    dispose();
  });

  it("abandons and reports the last step", () => {
    const track = vi.fn();
    const { result: funnel, dispose } = setup(() =>
      createFunnel(funnelOptions(track, () => 1000)),
    );
    funnel.enter();
    funnel.advance();
    funnel.abandon();
    const abandonCall = track.mock.calls.find((c) => c[0] === "funnel_abandon");
    expect(abandonCall?.[1]).toMatchObject({
      funnel: "checkout",
      step: "details",
      reason: "abandoned",
    });
    expect(funnel.step()).toBe(-1);
    dispose();
  });

  it("auto-abandons when the window expires", () => {
    const track = vi.fn();
    let t = 0;
    const { result: funnel, dispose } = setup(() =>
      createFunnel({ ...funnelOptions(track, () => t), windowMs: 1000 }),
    );
    funnel.enter();
    t = 5000;
    funnel.advance();
    const abandonCall = track.mock.calls.find((c) => c[0] === "funnel_abandon");
    expect(abandonCall?.[1]).toMatchObject({ reason: "expired" });
    expect(funnel.step()).toBe(-1);
    dispose();
  });

  it("ignores backward and unknown steps", () => {
    const track = vi.fn();
    const { result: funnel, dispose } = setup(() =>
      createFunnel(funnelOptions(track, () => 1000)),
    );
    funnel.advance();
    expect(funnel.step()).toBe(-1);
    funnel.enter();
    funnel.advance("cart");
    expect(funnel.step()).toBe(0);
    funnel.advance("nope");
    expect(funnel.step()).toBe(0);
    funnel.advance(2);
    expect(funnel.current()).toBe("payment");
    dispose();
  });

  it("records history", () => {
    const track = vi.fn();
    let t = 1000;
    const { result: funnel, dispose } = setup(() =>
      createFunnel(funnelOptions(track, () => t)),
    );
    funnel.enter();
    t = 2000;
    funnel.advance();
    expect(funnel.history()).toEqual([
      { step: "cart", at: 1000 },
      { step: "details", at: 2000 },
    ]);
    dispose();
  });
});
