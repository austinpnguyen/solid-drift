import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import {
  createSlotMachine,
  createRedPacket,
  createConfetti,
  createEmojiBurst,
  createScratch,
  type SlotMachineControls,
  type SlotMachineOptions,
  type RedPacketOptions,
} from "./fun.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test.
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];

function stubBrowser(opts: { reduced?: boolean } = {}) {
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });

  return {
    frames(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
      }
    },
  };
}

const SYMBOLS = ["A", "B", "C", "D", "E"];

function setupMachine(
  options?: Omit<SlotMachineOptions<string>, "symbols">,
): { machine: SlotMachineControls<string>; dispose: () => void } {
  let machine!: SlotMachineControls<string>;
  const dispose = createRoot((d) => {
    machine = createSlotMachine({ symbols: SYMBOLS, ...options });
    return d;
  });
  return { machine, dispose };
}

describe("createSlotMachine", () => {
  it("throws when symbols has fewer than 2 entries", () => {
    expect(() => createSlotMachine({ symbols: ["A"] })).toThrow();
  });

  it("starts idle with the initial symbols", () => {
    stubBrowser();
    const { machine, dispose } = setupMachine();
    expect(machine.status()).toBe("idle");
    expect(machine.values()).toEqual(["A", "B", "C"]);
    dispose();
  });

  it("spins and lands exactly on the rigged symbols", () => {
    const b = stubBrowser();
    const done: string[][] = [];
    const { machine, dispose } = setupMachine({
      duration: 600,
      stagger: 300,
      onDone: (r) => done.push(r),
    });
    machine.spin(["B", "C", "A"]);
    expect(machine.status()).toBe("spinning");
    b.frames(100); // 1670ms > 600 + 2*300 = 1200ms
    expect(machine.status()).toBe("done");
    expect(machine.values()).toEqual(["B", "C", "A"]);
    expect(machine.result()).toEqual(["B", "C", "A"]);
    expect(done).toEqual([["B", "C", "A"]]);
    dispose();
  });

  it("stops reels left to right with stagger", () => {
    const b = stubBrowser();
    const { machine, dispose } = setupMachine({
      duration: 600,
      stagger: 600,
    });
    machine.spin(["B", "C", "A"]);
    b.frames(40); // 668ms: reel 0 (600ms) landed, reel 2 (1800ms) still spinning
    expect(machine.status()).toBe("spinning");
    expect(machine.values()[0]).toBe("B");
    const first = machine.values()[0];
    b.frames(10);
    expect(machine.values()[0]).toBe(first); // reel 0 stays put
    b.frames(80); // past 1800ms
    expect(machine.status()).toBe("done");
    expect(machine.values()).toEqual(["B", "C", "A"]);
    dispose();
  });

  it("fires onTick as reels pass symbols", () => {
    const b = stubBrowser();
    const ticks: Array<[number, string]> = [];
    const { machine, dispose } = setupMachine({
      duration: 600,
      stagger: 0,
      onTick: (reel, symbol) => ticks.push([reel, symbol]),
    });
    machine.spin(["A", "A", "A"]);
    b.frames(60);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every(([reel, s]) => reel >= 0 && SYMBOLS.includes(s))).toBe(
      true,
    );
    dispose();
  });

  it("randomizes the landing when none is given", () => {
    const b = stubBrowser();
    const { machine, dispose } = setupMachine({
      duration: 300,
      stagger: 100,
    });
    machine.spin();
    b.frames(60); // 1002ms > 300 + 2*100 = 500ms
    expect(machine.status()).toBe("done");
    expect(machine.values()).toHaveLength(3);
    expect(
      machine.values().every((s) => SYMBOLS.includes(s)),
    ).toBe(true);
    dispose();
  });

  it("a second spin retargets from the current position", () => {
    const b = stubBrowser();
    const { machine, dispose } = setupMachine({
      duration: 600,
      stagger: 300,
    });
    machine.spin(["B", "C", "A"]);
    b.frames(10);
    machine.spin(["E", "D", "C"]);
    b.frames(100);
    expect(machine.status()).toBe("done");
    expect(machine.values()).toEqual(["E", "D", "C"]);
    dispose();
  });

  it("stop() halts at the current symbols", () => {
    const b = stubBrowser();
    const { machine, dispose } = setupMachine({
      duration: 2000,
      stagger: 500,
    });
    machine.spin(["B", "C", "A"]);
    b.frames(10);
    machine.stop();
    expect(machine.status()).toBe("done");
    const stopped = machine.values();
    expect(machine.result()).toEqual(stopped);
    b.frames(30);
    expect(machine.values()).toEqual(stopped); // stays put
    dispose();
  });

  it("reset() returns to idle with the initial symbols", () => {
    const b = stubBrowser();
    const { machine, dispose } = setupMachine({
      duration: 600,
      stagger: 0,
    });
    machine.spin(["B", "C", "A"]);
    b.frames(60);
    expect(machine.status()).toBe("done");
    machine.reset();
    expect(machine.status()).toBe("idle");
    expect(machine.values()).toEqual(["A", "B", "C"]);
    dispose();
  });

  it("jumps straight to the result under reduced motion", () => {
    stubBrowser({ reduced: true });
    const done: string[][] = [];
    const { machine, dispose } = setupMachine({ onDone: (r) => done.push(r) });
    machine.spin(["B", "C", "A"]);
    expect(machine.status()).toBe("done");
    expect(machine.values()).toEqual(["B", "C", "A"]);
    expect(done).toEqual([["B", "C", "A"]]);
    dispose();
  });

  it("spin() jumps straight to the result on the server", () => {
    // No window stubbed: SSR path.
    const { machine } = setupMachine();
    machine.spin(["B", "C", "A"]);
    expect(machine.status()).toBe("done");
    expect(machine.values()).toEqual(["B", "C", "A"]);
  });
});

describe("createRedPacket", () => {
  function setupPacket(options?: RedPacketOptions) {
    let packet!: ReturnType<typeof createRedPacket>;
    const dispose = createRoot((d) => {
      packet = createRedPacket(options);
      return d;
    });
    return { packet, dispose };
  }

  it("starts sealed with no coins and zero revealed", () => {
    stubBrowser();
    const { packet, dispose } = setupPacket();
    expect(packet.status()).toBe("sealed");
    expect(packet.coins()).toHaveLength(0);
    expect(packet.revealed()).toBe(0);
    dispose();
  });

  it("runs the full ceremony: opening -> bursting -> revealed", () => {
    const b = stubBrowser();
    const revealed: number[] = [];
    const { packet, dispose } = setupPacket({
      coins: 8,
      amount: 100,
      openDuration: 100,
      burstDuration: 400,
      revealDuration: 200,
      onReveal: (a) => revealed.push(a),
    });
    packet.open();
    expect(packet.status()).toBe("opening");

    b.frames(10); // 167ms > 100ms open
    expect(packet.status()).toBe("bursting");
    expect(packet.coins()).toHaveLength(8);
    const coin = packet.coins()[0];
    expect(coin.size).toBeGreaterThanOrEqual(24);
    expect(coin.opacity).toBe(1);

    b.frames(30); // 668ms > 100 + 400ms burst
    expect(packet.status()).toBe("revealed");
    expect(packet.coins()).toHaveLength(0);
    expect(revealed).toEqual([100]);

    b.frames(20); // let the count-up finish (200ms)
    expect(packet.revealed()).toBeCloseTo(100, 5);
    dispose();
  });

  it("coins fall under gravity", () => {
    const b = stubBrowser();
    const { packet, dispose } = setupPacket({
      coins: 4,
      openDuration: 50,
      burstDuration: 2000,
    });
    packet.open();
    b.frames(10); // bursting
    const y1 = packet.coins()[0].y;
    // 60 frames (~1s of flight): gravity dominates any random launch
    // velocity, so the coin must be lower (larger y) than before.
    b.frames(60);
    const y2 = packet.coins()[0].y;
    // Launched upward (negative vy), gravity pulls down: y grows over time.
    expect(y2).toBeGreaterThan(y1);
    dispose();
  });

  it("coin shares split the total amount", () => {
    const b = stubBrowser();
    const { packet, dispose } = setupPacket({
      coins: 10,
      amount: 88,
      openDuration: 50,
      burstDuration: 2000,
    });
    packet.open();
    b.frames(10);
    const total = packet.coins().reduce((a, c) => a + c.amount, 0);
    expect(total).toBeCloseTo(88, 8);
    dispose();
  });

  it("ignores open() when not sealed", () => {
    const b = stubBrowser();
    let opens = 0;
    const { packet, dispose } = setupPacket({
      openDuration: 50,
      burstDuration: 200,
      onOpen: () => opens++,
    });
    packet.open();
    packet.open(); // already opening: ignored
    expect(opens).toBe(1);
    b.frames(30);
    expect(packet.status()).toBe("revealed");
    packet.open(); // revealed: ignored
    expect(opens).toBe(1);
    dispose();
  });

  it("reset() returns to sealed", () => {
    const b = stubBrowser();
    const { packet, dispose } = setupPacket({
      openDuration: 50,
      burstDuration: 200,
    });
    packet.open();
    b.frames(30);
    expect(packet.status()).toBe("revealed");
    packet.reset();
    expect(packet.status()).toBe("sealed");
    expect(packet.coins()).toHaveLength(0);
    // Can be opened again.
    packet.open();
    expect(packet.status()).toBe("opening");
    dispose();
  });

  it("opens instantly under reduced motion", () => {
    stubBrowser({ reduced: true });
    const revealed: number[] = [];
    const { packet, dispose } = setupPacket({
      amount: 88,
      onReveal: (a) => revealed.push(a),
    });
    packet.open();
    expect(packet.status()).toBe("revealed");
    expect(packet.coins()).toHaveLength(0);
    expect(packet.revealed()).toBe(88);
    expect(revealed).toEqual([88]);
    dispose();
  });

  it("open() jumps to revealed on the server", () => {
    // No window stubbed: SSR path.
    const { packet } = setupPacket({ amount: 88 });
    packet.open();
    expect(packet.status()).toBe("revealed");
    expect(packet.revealed()).toBe(88);
  });
});

/* Canvas fakes for the particle and scratch tests. */

function makeCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
  };
}

interface CanvasFake {
  el: unknown;
  ctx: ReturnType<typeof makeCtx>;
  fire: (type: string, event?: Record<string, unknown>) => void;
}

function makeCanvas(w = 300, h = 150): CanvasFake {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const ctx = makeCtx();
  const el = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: w,
      height: h,
      right: w,
      bottom: h,
    }),
    setPointerCapture: vi.fn(),
    addEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    }),
  };
  return {
    el: el as unknown as HTMLCanvasElement,
    ctx,
    fire: (type: string, event: Record<string, unknown> = {}) => {
      listeners.get(type)?.forEach((fn) => fn(event));
    },
  };
}

/** Alpha-channel data with the first `frac` of sampled pixels erased. */
function alphaData(w: number, h: number, frac: number) {
  const step = 6;
  let total = 0;
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) total++;
  const data = new Uint8ClampedArray(w * h * 4);
  let i = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const o = (y * w + x) * 4;
      data[o] = 200;
      data[o + 1] = 200;
      data[o + 2] = 200;
      data[o + 3] = i / total < frac ? 0 : 255;
      i++;
    }
  }
  return { data };
}

describe("createConfetti", () => {
  it("burst() spawns particles that fall, fade, and complete", () => {
    const b = stubBrowser();
    const { el, ctx } = makeCanvas();
    const onDone = vi.fn();
    let controls!: ReturnType<typeof createConfetti>;
    const dispose = createRoot((d) => {
      controls = createConfetti(() => el as HTMLCanvasElement, {
        count: 20,
        lifetime: 300,
        onDone,
      });
      return d;
    });
    expect(controls.active()).toBe(false);
    controls.burst();
    expect(controls.active()).toBe(true);
    b.frames(3);
    // Particles were drawn (rects and/or circles).
    expect(ctx.fillRect.mock.calls.length + ctx.arc.mock.calls.length).toBeGreaterThan(0);
    b.frames(40); // past the longest possible life (300 * 1.3)
    expect(controls.active()).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("burst() from a custom origin and clear() stops everything", () => {
    const b = stubBrowser();
    const { el } = makeCanvas();
    let controls!: ReturnType<typeof createConfetti>;
    const dispose = createRoot((d) => {
      controls = createConfetti(() => el as HTMLCanvasElement, {
        count: 30,
        lifetime: 5000,
      });
      return d;
    });
    controls.burst({ x: 0.2, y: 0.8 });
    b.frames(2);
    expect(controls.active()).toBe(true);
    controls.clear();
    expect(controls.active()).toBe(false);
    dispose();
  });

  it("reduced motion skips the particles but still calls onDone", () => {
    stubBrowser({ reduced: true });
    const { el, ctx } = makeCanvas();
    const onDone = vi.fn();
    let controls!: ReturnType<typeof createConfetti>;
    const dispose = createRoot((d) => {
      controls = createConfetti(() => el as HTMLCanvasElement, { onDone });
      return d;
    });
    controls.burst();
    expect(controls.active()).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    dispose();
  });

  it("is SSR-safe: burst() is a no-op", () => {
    // No window stubbed: server path.
    let controls!: ReturnType<typeof createConfetti>;
    const dispose = createRoot((d) => {
      controls = createConfetti(() => null);
      return d;
    });
    controls.burst();
    expect(controls.active()).toBe(false);
    dispose();
  });
});

describe("createEmojiBurst", () => {
  it("burst() draws emoji glyphs that complete", () => {
    const b = stubBrowser();
    const { el, ctx } = makeCanvas();
    const onDone = vi.fn();
    let controls!: ReturnType<typeof createEmojiBurst>;
    const dispose = createRoot((d) => {
      controls = createEmojiBurst(() => el as HTMLCanvasElement, {
        emoji: ["\u{1F4A5}"],
        count: 6,
        lifetime: 300,
        onDone,
      });
      return d;
    });
    controls.burst();
    b.frames(3);
    expect(ctx.fillText).toHaveBeenCalledWith("\u{1F4A5}", 0, 0);
    b.frames(40);
    expect(controls.active()).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("reduced motion skips the particles but still calls onDone", () => {
    stubBrowser({ reduced: true });
    const { el } = makeCanvas();
    const onDone = vi.fn();
    let controls!: ReturnType<typeof createEmojiBurst>;
    const dispose = createRoot((d) => {
      controls = createEmojiBurst(() => el as HTMLCanvasElement, { onDone });
      return d;
    });
    controls.burst();
    expect(controls.active()).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    dispose();
  });
});

describe("createScratch", () => {
  it("paints the foil cover on bind", async () => {
    stubBrowser();
    const { el, ctx } = makeCanvas();
    let controls!: ReturnType<typeof createScratch>;
    const dispose = createRoot((d) => {
      controls = createScratch(() => el as HTMLCanvasElement);
      return d;
    });
    await new Promise((r) => setTimeout(r, 0)); // let the bind effect run
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(controls.cleared()).toBe(0);
    expect(controls.done()).toBe(false);
    dispose();
  });

  it("scratching erases and completes past the threshold", async () => {
    const b = stubBrowser();
    const { el, ctx, fire } = makeCanvas(300, 150);
    let erasedFrac = 0;
    ctx.getImageData.mockImplementation(() => alphaData(300, 150, erasedFrac));
    const onComplete = vi.fn();
    let controls!: ReturnType<typeof createScratch>;
    const dispose = createRoot((d) => {
      controls = createScratch(() => el as HTMLCanvasElement, {
        threshold: 0.5,
        onComplete,
      });
      return d;
    });
    await new Promise((r) => setTimeout(r, 0));
    fire("pointerdown", { clientX: 150, clientY: 75, pointerId: 1, isPrimary: true });
    // Erasing punches destination-out holes.
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    // Nothing erased yet in the pixel data.
    expect(controls.cleared()).toBe(0);
    // Simulate heavy scratching, then move to trigger the throttled sample.
    erasedFrac = 0.9;
    b.frames(10);
    fire("pointermove", { clientX: 160, clientY: 80 });
    expect(controls.cleared()).toBeCloseTo(0.9, 1);
    expect(controls.done()).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Further scratching does not re-fire onComplete.
    fire("pointermove", { clientX: 170, clientY: 85 });
    expect(onComplete).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("reset() repaints the cover and clears progress", async () => {
    const b = stubBrowser();
    const { el, ctx, fire } = makeCanvas(300, 150);
    let erasedFrac = 0;
    ctx.getImageData.mockImplementation(() => alphaData(300, 150, erasedFrac));
    let controls!: ReturnType<typeof createScratch>;
    const dispose = createRoot((d) => {
      controls = createScratch(() => el as HTMLCanvasElement, {
        threshold: 0.5,
      });
      return d;
    });
    await new Promise((r) => setTimeout(r, 0));
    const paints = ctx.fillRect.mock.calls.length;
    fire("pointerdown", { clientX: 150, clientY: 75, pointerId: 1, isPrimary: true });
    erasedFrac = 0.9;
    b.frames(10);
    fire("pointermove", { clientX: 160, clientY: 80 });
    expect(controls.done()).toBe(true);
    controls.reset();
    expect(controls.cleared()).toBe(0);
    expect(controls.done()).toBe(false);
    expect(ctx.fillRect.mock.calls.length).toBeGreaterThan(paints);
    dispose();
  });

  it("supports a custom cover painter", async () => {
    stubBrowser();
    const { el } = makeCanvas();
    const paint = vi.fn();
    let controls!: ReturnType<typeof createScratch>;
    const dispose = createRoot((d) => {
      controls = createScratch(() => el as HTMLCanvasElement, { paint });
      return d;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.calls[0][1]).toBe(300);
    expect(paint.mock.calls[0][2]).toBe(150);
    expect(controls.done()).toBe(false);
    dispose();
  });

  it("is SSR-safe: cleared stays 0", () => {
    // No window stubbed: server path.
    let controls!: ReturnType<typeof createScratch>;
    const dispose = createRoot((d) => {
      controls = createScratch(() => null);
      return d;
    });
    expect(controls.cleared()).toBe(0);
    expect(controls.done()).toBe(false);
    controls.reset();
    dispose();
  });
});
