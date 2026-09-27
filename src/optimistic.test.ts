import { describe, expect, it, vi } from "vitest";
import { createOptimistic } from "./optimistic";

const append = (list: string[], item: string): string[] => [...list, item];
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("createOptimistic", () => {
  it("starts from the initial value with nothing pending", () => {
    const o = createOptimistic<string[], string>(["a"], append);
    expect(o.value()).toEqual(["a"]);
    expect(o.pending()).toBe(false);
    expect(o.pendingCount()).toBe(0);
    expect(o.error()).toBeNull();
  });

  it("applies the update immediately while the task runs", async () => {
    const o = createOptimistic<string[], string>([], append);
    const gate = deferred<void>();
    const done = o.commit("x", () => gate.promise);
    expect(o.value()).toEqual(["x"]);
    expect(o.pending()).toBe(true);
    expect(o.pendingCount()).toBe(1);
    gate.resolve();
    await done;
    expect(o.value()).toEqual(["x"]);
    expect(o.pending()).toBe(false);
  });

  it("rolls back on failure, sets error, and rethrows", async () => {
    const o = createOptimistic<string[], string>(["a"], append);
    const failure = new Error("tx reverted");
    await expect(
      o.commit("x", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(o.value()).toEqual(["a"]);
    expect(o.pending()).toBe(false);
    expect(o.error()).toBe(failure);
  });

  it("clears the error when the next commit starts", async () => {
    const o = createOptimistic<string[], string>([], append);
    await expect(
      o.commit("x", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(o.error()).not.toBeNull();
    const gate = deferred<void>();
    const done = o.commit("y", () => gate.promise);
    expect(o.error()).toBeNull();
    gate.resolve();
    await done;
  });

  it("rolls back only the failed update when several are in flight", async () => {
    const o = createOptimistic<string[], string>([], append);
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const p1 = o.commit("a", () => gates[0]!.promise);
    const p2 = o.commit("b", () => gates[1]!.promise);
    const p3 = o.commit("c", () => gates[2]!.promise);
    expect(o.pendingCount()).toBe(3);
    expect(o.value()).toEqual(["a", "b", "c"]);
    gates[1]!.reject(new Error("b failed"));
    await expect(p2).rejects.toThrow("b failed");
    expect(o.value()).toEqual(["a", "c"]);
    expect(o.pendingCount()).toBe(2);
    gates[0]!.resolve();
    gates[2]!.resolve();
    await p1;
    await p3;
    expect(o.value()).toEqual(["a", "c"]);
    expect(o.pending()).toBe(false);
  });

  it("setBase replaces the truth with optimistic updates on top", () => {
    const o = createOptimistic<string[], string>(["a"], append);
    const gate = deferred<void>();
    const done = o.commit("b", () => gate.promise);
    o.setBase(["a", "server"]);
    expect(o.value()).toEqual(["a", "server", "b"]);
    o.setBase((prev) => [...prev, "more"]);
    expect(o.value()).toEqual(["a", "server", "more", "b"]);
    gate.resolve();
    return done;
  });

  it("reset drops in-flight updates and the error", async () => {
    const o = createOptimistic<string[], string>(["a"], append);
    const gate = deferred<void>();
    const done = o.commit("b", () => gate.promise);
    // Attach a no-op catch so the orphaned task cannot reject unhandled.
    void done.catch(() => {});
    o.reset();
    expect(o.value()).toEqual(["a"]);
    expect(o.pending()).toBe(false);
    gate.reject(new Error("late failure"));
    await vi.waitFor(() => expect(o.error()).toBeNull());
  });

  it("wraps non-Error rejections", async () => {
    const o = createOptimistic<string[], string>([], append);
    await expect(
      o.commit("x", async () => {
        throw "string failure";
      }),
    ).rejects.toThrow("string failure");
    expect(o.error()).toBeInstanceOf(Error);
    expect(o.value()).toEqual([]);
  });
});
