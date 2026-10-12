import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { animate } from "./animate.js";
import { createTween } from "./tween.js";
import {
  killTweensOf,
  activeOverwriteIds,
  registerTween,
} from "./overwrite.js";

describe("overwrite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("overwrite auto kills the previous tween with the same id", async () => {
    const onInterrupt1 = vi.fn();
    const onComplete1 = vi.fn();
    const onComplete2 = vi.fn();

    const c1 = animate(0, 100, {
      id: "x",
      overwrite: "auto",
      duration: 10000,
      onInterrupt: onInterrupt1,
      onComplete: onComplete1,
    });
    expect(activeOverwriteIds()).toBe(1);

    const c2 = animate(0, 200, {
      id: "x",
      overwrite: "auto",
      duration: 10000,
      onComplete: onComplete2,
    });

    expect(onInterrupt1).toHaveBeenCalledTimes(1);
    expect(onComplete1).not.toHaveBeenCalled();
    // The first tween's finished promise resolves (it was stopped).
    await c1.finished;
    expect(activeOverwriteIds()).toBe(1);

    c2.stop();
    await c2.finished;
    expect(activeOverwriteIds()).toBe(0);
  });

  it("overwrite none keeps both tweens alive", () => {
    const onInterrupt = vi.fn();
    const c1 = animate(0, 100, {
      id: "y",
      duration: 10000,
      onInterrupt,
    });
    const c2 = animate(0, 200, {
      id: "y",
      duration: 10000,
    });
    expect(onInterrupt).not.toHaveBeenCalled();
    expect(activeOverwriteIds()).toBe(1);
    c1.stop();
    c2.stop();
    expect(activeOverwriteIds()).toBe(0);
  });

  it("killTweensOf kills by id and fires onInterrupt", async () => {
    const onInterrupt = vi.fn();
    const onComplete = vi.fn();
    const c = animate(0, 100, {
      id: "z",
      duration: 10000,
      onInterrupt,
      onComplete,
    });
    expect(activeOverwriteIds()).toBe(1);
    killTweensOf("z");
    expect(onInterrupt).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    await c.finished;
    expect(activeOverwriteIds()).toBe(0);
  });

  it("killTweensOf on unknown id is a no-op", () => {
    expect(() => killTweensOf("missing")).not.toThrow();
  });

  it("tweens without id are not tracked", () => {
    const c = animate(0, 100, { duration: 10000 });
    expect(activeOverwriteIds()).toBe(0);
    c.stop();
  });

  it("a throwing onInterrupt does not break the new tween", () => {
    const c1 = animate(0, 100, {
      id: "boom",
      overwrite: "auto",
      duration: 10000,
      onInterrupt: () => {
        throw new Error("boom");
      },
    });
    expect(() =>
      animate(0, 200, { id: "boom", overwrite: "auto", duration: 10000 }),
    ).not.toThrow();
    c1.stop();
    killTweensOf("boom");
  });

  it("registerTween overwrite kills previous entries", () => {
    const kill1 = vi.fn();
    const interrupt1 = vi.fn();
    const unregister1 = registerTween(
      "r",
      { kill: kill1, onInterrupt: interrupt1 },
      "none",
    );
    const kill2 = vi.fn();
    registerTween("r", { kill: kill2 }, "auto");
    expect(kill1).toHaveBeenCalledTimes(1);
    expect(interrupt1).toHaveBeenCalledTimes(1);
    expect(kill2).not.toHaveBeenCalled();
    unregister1();
    killTweensOf("r");
  });

  it("createTween overwrite fires onInterrupt exactly once", async () => {
    const onInterrupt1 = vi.fn();
    createRoot(() => {
      const [t1, setT1] = createSignal(0);
      createTween(t1, {
        id: "ct",
        overwrite: "auto",
        duration: 10000,
        onInterrupt: onInterrupt1,
      });
      setT1(100); // start the first tween so it registers
      const [t2, setT2] = createSignal(0);
      createTween(t2, {
        id: "ct",
        overwrite: "auto",
        duration: 10000,
      });
      setT2(200); // start the second tween, overwriting the first
    });
    await Promise.resolve(); // flush effects
    await Promise.resolve();
    expect(onInterrupt1).toHaveBeenCalledTimes(1);
    killTweensOf("ct");
  });

  it("createTween killTweensOf fires onInterrupt exactly once", async () => {
    const onInterrupt = vi.fn();
    createRoot(() => {
      const [t, setT] = createSignal(0);
      createTween(t, {
        id: "ct2",
        overwrite: "auto",
        duration: 10000,
        onInterrupt,
      });
      setT(100); // start the tween so it registers
    });
    await Promise.resolve(); // flush effects
    await Promise.resolve();
    killTweensOf("ct2");
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });
});
