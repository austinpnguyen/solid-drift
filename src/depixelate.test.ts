import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createDepixelate } from "./depixelate.js";

afterEach(() => {
  vi.unstubAllGlobals();
  // Do NOT clear rafQueue or reset fakeTime here: the animation engine
  // remembers a pending rAF id across tests, and clearing the queue
  // would strand it so later animations never run.
});

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test.
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];

function stubBrowser(opts: { reduced?: boolean } = {}) {
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: (t: number) => void): number => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  // The engine hooks visibility on first schedule(); the primitive
  // uses document.createElement for its scratch canvas.
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => makeCanvasEl(),
  });
  return {
    frames(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        const q = rafQueue.splice(0);
        q.forEach((cb) => cb(fakeTime));
      }
    },
    async run(n: number, step = 16.7) {
      this.frames(n, step);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

function makeCtx() {
  return {
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
}

function makeCanvasEl() {
  const ctx = makeCtx();
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    __ctx: ctx,
  };
}

function makeImageEl() {
  return {
    complete: true,
    naturalWidth: 120,
    naturalHeight: 80,
  };
}

describe("createDepixelate", () => {
  it("paints the pixelated teaser frame when the image is ready", async () => {
    stubBrowser();
    const img = makeImageEl();
    const cvs = makeCanvasEl();
    let controls!: ReturnType<typeof createDepixelate>;
    const dispose = createRoot((d) => {
      controls = createDepixelate(
        () => img as unknown as HTMLImageElement,
        () => cvs as unknown as HTMLCanvasElement,
      );
      return d;
    });
    await new Promise((r) => setTimeout(r, 0)); // let the paint effect run
    expect(controls.status()).toBe("idle");
    expect(controls.pixelSize()).toBeGreaterThan(1);
    // 120x80 image: startBlock = max(8, floor(80/12)) = 8.
    expect(controls.pixelSize()).toBe(8);
    expect(cvs.__ctx.drawImage).toHaveBeenCalled();
    dispose();
  });

  it("reveals from blocky to sharp over the duration", async () => {
    const b = stubBrowser();
    const img = makeImageEl();
    const cvs = makeCanvasEl();
    const onComplete = vi.fn();
    let controls!: ReturnType<typeof createDepixelate>;
    const dispose = createRoot((d) => {
      controls = createDepixelate(
        () => img as unknown as HTMLImageElement,
        () => cvs as unknown as HTMLCanvasElement,
        { duration: 160, levels: 4, onComplete },
      );
      return d;
    });
    await new Promise((r) => setTimeout(r, 0));
    const seen: number[] = [];
    const p = controls.play();
    // Poll pixelSize through the reveal.
    for (let i = 0; i < 12; i++) {
      b.frames(1);
      seen.push(controls.pixelSize());
    }
    await p;
    expect(controls.status()).toBe("revealed");
    expect(controls.pixelSize()).toBe(1);
    expect(controls.progress()).toBeCloseTo(1, 3);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Block sizes shrink monotonically through the reveal.
    const distinct = [...new Set(seen)];
    const sorted = [...distinct].sort((a, b2) => b2 - a);
    expect(distinct).toEqual(sorted);
    expect(distinct[0]).toBeGreaterThan(1);
    expect(distinct[distinct.length - 1]).toBe(1);
    dispose();
  });

  it("stop() halts the reveal and resolves the play promise", async () => {
    const b = stubBrowser();
    const img = makeImageEl();
    const cvs = makeCanvasEl();
    let controls!: ReturnType<typeof createDepixelate>;
    const dispose = createRoot((d) => {
      controls = createDepixelate(
        () => img as unknown as HTMLImageElement,
        () => cvs as unknown as HTMLCanvasElement,
        { duration: 10000 },
      );
      return d;
    });
    await new Promise((r) => setTimeout(r, 0));
    let resolved = false;
    const p = controls.play().then(() => {
      resolved = true;
    });
    b.frames(5);
    expect(controls.status()).toBe("revealing");
    controls.stop();
    await p;
    expect(resolved).toBe(true);
    expect(controls.status()).toBe("idle");
    expect(controls.pixelSize()).toBeGreaterThan(1); // stopped mid-reveal
    dispose();
  });

  it("reset() returns to the pixelated teaser", async () => {
    const b = stubBrowser();
    const img = makeImageEl();
    const cvs = makeCanvasEl();
    let controls!: ReturnType<typeof createDepixelate>;
    const dispose = createRoot((d) => {
      controls = createDepixelate(
        () => img as unknown as HTMLImageElement,
        () => cvs as unknown as HTMLCanvasElement,
        { duration: 160 },
      );
      return d;
    });
    await new Promise((r) => setTimeout(r, 0));
    const p = controls.play();
    b.frames(20); // past the 160ms duration
    await p;
    expect(controls.status()).toBe("revealed");
    controls.reset();
    expect(controls.status()).toBe("idle");
    expect(controls.pixelSize()).toBe(8);
    expect(controls.progress()).toBe(0);
    dispose();
  });

  it("complete() jumps straight to sharp", async () => {
    stubBrowser();
    const img = makeImageEl();
    const cvs = makeCanvasEl();
    const onComplete = vi.fn();
    let controls!: ReturnType<typeof createDepixelate>;
    const dispose = createRoot((d) => {
      controls = createDepixelate(
        () => img as unknown as HTMLImageElement,
        () => cvs as unknown as HTMLCanvasElement,
        { duration: 10000, onComplete },
      );
      return d;
    });
    await new Promise((r) => setTimeout(r, 0));
    controls.complete();
    expect(controls.status()).toBe("revealed");
    expect(controls.pixelSize()).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("play() resolves immediately as revealed when the image is missing", async () => {
    stubBrowser();
    let controls!: ReturnType<typeof createDepixelate>;
    const dispose = createRoot((d) => {
      controls = createDepixelate(
        () => null,
        () => null,
      );
      return d;
    });
    await controls.play();
    expect(controls.status()).toBe("revealed");
    dispose();
  });

  it("reduced motion jumps straight to sharp", async () => {
    stubBrowser({ reduced: true });
    const img = makeImageEl();
    const cvs = makeCanvasEl();
    const onComplete = vi.fn();
    let controls!: ReturnType<typeof createDepixelate>;
    const dispose = createRoot((d) => {
      controls = createDepixelate(
        () => img as unknown as HTMLImageElement,
        () => cvs as unknown as HTMLCanvasElement,
        { duration: 10000, onComplete },
      );
      return d;
    });
    await new Promise((r) => setTimeout(r, 0));
    await controls.play();
    expect(controls.status()).toBe("revealed");
    expect(controls.pixelSize()).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("is SSR-safe: revealed with resolving play()", async () => {
    let controls!: ReturnType<typeof createDepixelate>;
    const dispose = createRoot((d) => {
      controls = createDepixelate(() => null, () => null);
      return d;
    });
    // No window/document stubbed: server path.
    expect(controls.status()).toBe("revealed");
    await controls.play();
    expect(controls.status()).toBe("revealed");
    dispose();
  });
});
