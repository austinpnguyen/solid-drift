import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createHaptic,
  createHapticBeat,
  hapticBeatPresets,
  hapticPatterns,
  type HapticBeatControls,
} from "./haptic.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubVibrate() {
  const calls: Array<number | number[]> = [];
  vi.stubGlobal("navigator", {
    vibrate: (pattern: number | number[]) => {
      calls.push(pattern);
      return true;
    },
  });
  vi.stubGlobal("window", {});
  return calls;
}

/** Manual-drive the shared engine clock. */
function stubClock() {
  let cb: (() => void) | null = null;
  // Return 0 so the engine's module-level rafId stays falsy and every
  // schedule() re-arms the (stubbed) frame loop.
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    cb = fn;
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    cb = null;
  });
  let t = 10000;
  const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => t);
  return {
    advance: (ms: number) => {
      t += ms;
      cb?.();
    },
    restore: () => nowSpy.mockRestore(),
  };
}

describe("createHaptic", () => {
  it("fires the named presets with the right patterns", () => {
    const calls = stubVibrate();
    const dispose = createRoot((d) => {
      const haptic = createHaptic();
      expect(haptic.supported()).toBe(true);
      haptic.light();
      haptic.medium();
      haptic.heavy();
      haptic.success();
      haptic.warning();
      haptic.error();
      haptic.vibrate(hapticPatterns.doubleTap);
      return d;
    });
    expect(calls).toEqual([
      10,
      20,
      30,
      [10, 40, 25],
      [30, 50, 30],
      [50, 50, 50, 50, 80],
      [15, 50, 15],
    ]);
    dispose();
  });

  it("is a no-op without vibration support", () => {
    vi.stubGlobal("navigator", {}); // no vibrate
    vi.stubGlobal("window", {});
    const dispose = createRoot((d) => {
      const haptic = createHaptic();
      expect(haptic.supported()).toBe(false);
      expect(() => {
        haptic.light();
        haptic.morse("...");
      }).not.toThrow();
      return d;
    });
    dispose();
  });

  it("respects a static enabled flag", () => {
    const calls = stubVibrate();
    const dispose = createRoot((d) => {
      const haptic = createHaptic({ enabled: false });
      expect(haptic.supported()).toBe(false);
      haptic.heavy();
      expect(calls).toEqual([]);
      return d;
    });
    dispose();
  });

  it("respects a reactive enabled signal", () => {
    const calls = stubVibrate();
    const dispose = createRoot((d) => {
      const [on, setOn] = createSignal(true);
      const haptic = createHaptic({ enabled: on });
      haptic.light();
      expect(calls).toEqual([10]);
      setOn(false);
      haptic.light();
      expect(calls).toEqual([10]); // suppressed
      expect(haptic.supported()).toBe(false);
      return d;
    });
    dispose();
  });

  it("encodes morse code with dots, dashes, and gaps", () => {
    const calls = stubVibrate();
    const dispose = createRoot((d) => {
      const haptic = createHaptic();
      haptic.morse("...", 60);
      expect(calls[0]).toEqual([60, 60, 60, 60, 60]);
      haptic.morse(".-", 50);
      expect(calls[1]).toEqual([50, 50, 150]);
      haptic.morse(". .", 60); // letter gap: 3-unit pause
      expect(calls[2]).toEqual([60, 180, 60]);
      haptic.morse("./.", 60); // word gap: 7-unit pause
      expect(calls[3]).toEqual([60, 420, 60]);
      const before = calls.length;
      haptic.morse("", 60);
      expect(calls.length).toBe(before); // nothing to vibrate
      return d;
    });
    dispose();
  });

  it("is SSR-safe: no-ops without a navigator", () => {
    // No globals stubbed: server path.
    const dispose = createRoot((d) => {
      const haptic = createHaptic();
      expect(haptic.supported()).toBe(false);
      expect(() => {
        haptic.vibrate(10);
        haptic.heavy();
        haptic.morse("...");
      }).not.toThrow();
      return d;
    });
    dispose();
  });
});

describe("createHapticBeat", () => {
  function setup(
    options: Parameters<typeof createHapticBeat>[1] = {},
  ): {
    calls: Array<number | number[]>;
    seen: number[];
    beat: HapticBeatControls;
    clock: ReturnType<typeof stubClock>;
    dispose: () => void;
  } {
    const calls = stubVibrate();
    const clock = stubClock();
    const seen: number[] = [];
    let beat!: HapticBeatControls;
    const dispose = createRoot((d) => {
      const haptic = createHaptic();
      beat = createHapticBeat(haptic, {
        bpm: 600, // 16th note = 25ms
        pattern: "x...............",
        ...options,
        onStep: (s) => seen.push(s),
      });
      return d;
    });
    return { calls, seen, beat, clock, dispose };
  }

  it("plays the 16 steps in order, then loops", () => {
    const { calls, seen, beat, clock, dispose } = setup();
    beat.start();
    expect(beat.playing()).toBe(true);
    expect(beat.step()).toBe(0);
    expect(calls).toEqual([12]); // downbeat fires immediately

    for (let i = 0; i < 16; i++) clock.advance(25);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]);
    expect(calls).toEqual([12, 12]); // only the hits vibrate
    expect(beat.step()).toBe(0);
    clock.restore();
    dispose();
  });

  it("accents hit harder than normal steps", () => {
    const { calls, beat, clock, dispose } = setup({
      pattern: "X...x...........",
    });
    beat.start();
    expect(calls).toEqual([30]); // accent on step 0
    clock.advance(100); // steps 1-4: step 4 is a normal hit
    expect(calls).toEqual([30, 12]);
    clock.restore();
    dispose();
  });

  it("stop halts the sequencer and start is idempotent", () => {
    const { calls, beat, clock, dispose } = setup();
    beat.start();
    beat.start(); // second start is ignored
    expect(calls).toEqual([12]);
    beat.stop();
    expect(beat.playing()).toBe(false);
    expect(beat.step()).toBe(-1);
    clock.advance(200);
    expect(calls).toEqual([12]); // nothing more fired
    beat.toggle();
    expect(beat.playing()).toBe(true);
    beat.toggle();
    expect(beat.playing()).toBe(false);
    clock.restore();
    dispose();
  });

  it("setBpm changes the tempo live", () => {
    const { seen, beat, clock, dispose } = setup();
    beat.start();
    beat.setBpm(1200); // 16th note = 12.5ms from here on
    clock.advance(25); // clears the step scheduled under the old tempo
    expect(seen).toEqual([0, 1]);
    clock.advance(13); // new tempo: next step lands after ~12.5ms
    expect(seen).toEqual([0, 1, 2]);
    beat.setBpm(0); // clamped, never zero
    expect(beat.bpm()).toBe(1);
    clock.restore();
    dispose();
  });

  it("releases the clock on unmount", () => {
    const { calls, clock, dispose } = setup();
    const before = calls.length;
    dispose(); // never started: nothing scheduled, nothing leaked
    clock.advance(500);
    expect(calls.length).toBe(before);
    clock.restore();
  });

  it("supports autostart", () => {
    const { beat, clock, dispose } = setup({ autostart: true });
    expect(beat.playing()).toBe(true);
    expect(beat.step()).toBe(0);
    clock.restore();
    dispose();
  });

  it("is SSR-safe: start is a no-op without a window", () => {
    // No window stubbed: server path.
    const dispose = createRoot((d) => {
      const haptic = createHaptic();
      const beat = createHapticBeat(haptic, { autostart: true });
      expect(beat.playing()).toBe(false);
      expect(() => beat.start()).not.toThrow();
      return d;
    });
    dispose();
  });

  it("ships 16-char presets", () => {
    for (const pattern of Object.values(hapticBeatPresets)) {
      expect(pattern).toHaveLength(16);
    }
  });
});
