import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import {
  createSlotMachine,
  type SlotMachineControls,
  type SlotMachineOptions,
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
