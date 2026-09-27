import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import {
  createSlotMachine,
  createRedPacket,
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
    b.frames(30); // 668ms of flight
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
