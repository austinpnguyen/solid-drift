import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import {
  createBottomSheet,
  type BottomSheetControls,
} from "./sheet.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type ListenerMap = Map<string, Set<(e: never) => void>>;

function on(map: ListenerMap) {
  return (t: string, fn: (e: never) => void) => {
    let s = map.get(t);
    if (!s) {
      s = new Set();
      map.set(t, s);
    }
    s.add(fn);
  };
}

function off(map: ListenerMap) {
  return (t: string, fn: (e: never) => void) => {
    map.get(t)?.delete(fn);
  };
}

function fire(map: ListenerMap, name: string, event: unknown) {
  map.get(name)?.forEach((fn) => (fn as (e: unknown) => void)(event));
}

interface SheetEnv {
  handle: { addEventListener: unknown; removeEventListener: unknown };
  sheet: { offsetHeight: number };
  down: (y: number) => void;
  move: (y: number) => void;
  up: () => void;
  advance: (ms: number) => void;
  settle: (bs: BottomSheetControls) => void;
  restore: () => void;
}

/** Fake window, clock, handle, and sheet element. */
function stubSheetEnv(
  sheetHeight = 800,
  reducedMotion = false,
): SheetEnv {
  const winListeners: ListenerMap = new Map();
  const elListeners: ListenerMap = new Map();
  const handle = {
    addEventListener: on(elListeners),
    removeEventListener: off(elListeners),
  };
  const sheet = { offsetHeight: sheetHeight };
  vi.stubGlobal("window", {
    addEventListener: on(winListeners),
    removeEventListener: off(winListeners),
    matchMedia: () => ({
      matches: reducedMotion,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  let cb: (() => void) | null = null;
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    cb = fn;
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    cb = null;
  });
  let t = 5000;
  const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => t);
  const advance = (ms: number): void => {
    t += ms;
    cb?.();
  };
  return {
    handle,
    sheet,
    down: (y: number) =>
      fire(elListeners, "pointerdown", { isPrimary: true, clientX: 0, clientY: y }),
    move: (y: number) =>
      fire(winListeners, "pointermove", { isPrimary: true, clientX: 0, clientY: y }),
    up: () => fire(winListeners, "pointerup", {}),
    advance,
    settle: (bs: BottomSheetControls) => {
      for (let i = 0; i < 300 && bs.status() !== "idle"; i++) advance(16);
    },
    restore: () => nowSpy.mockRestore(),
  };
}

function openAt(
  env: SheetEnv,
  make: () => BottomSheetControls,
): { bs: BottomSheetControls; dispose: () => void } {
  let bs!: BottomSheetControls;
  const dispose = createRoot((d) => {
    bs = make();
    return d;
  });
  return { bs, dispose };
}

describe("createBottomSheet", () => {
  it("starts dismissed and parks below the screen", async () => {
    const env = stubSheetEnv();
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
      }),
    );
    await sleep(0); // let the bind effects run
    expect(bs.open()).toBe(false);
    expect(bs.snapIndex()).toBe(-1);
    expect(bs.y()).toBe(800);
    env.restore();
    dispose();
  });

  it("openSheet animates to the fullest snap by default", async () => {
    const env = stubSheetEnv();
    const changes: boolean[] = [];
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
        snapPoints: [0.5, 1],
        onOpenChange: (open) => changes.push(open),
      }),
    );
    await sleep(0);
    bs.openSheet();
    env.settle(bs);
    expect(bs.open()).toBe(true);
    expect(bs.snapIndex()).toBe(1);
    expect(bs.y()).toBeCloseTo(0, 0);
    expect(changes).toEqual([true]);
    env.restore();
    dispose();
  });

  it("openSheet(0) opens at the lower snap", async () => {
    const env = stubSheetEnv();
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
        snapPoints: [0.5, 1],
      }),
    );
    await sleep(0);
    bs.openSheet(0);
    env.settle(bs);
    expect(bs.snapIndex()).toBe(0);
    expect(bs.y()).toBeCloseTo(400, 0);
    env.restore();
    dispose();
  });

  it("dragging up snaps to the fuller point on release", async () => {
    const env = stubSheetEnv();
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
        snapPoints: [0.5, 1],
      }),
    );
    await sleep(0);
    bs.openSheet(0);
    env.settle(bs);
    expect(bs.y()).toBeCloseTo(400, 0);

    env.down(500);
    env.advance(200);
    env.move(200); // drag 300px up: sheet at y=100
    await sleep(0); // let the 1:1 tracking effect run
    expect(bs.status()).toBe("dragging");
    expect(bs.y()).toBeCloseTo(100, 0);
    env.advance(10);
    env.up(); // upward flick: snaps to full
    env.settle(bs);
    expect(bs.snapIndex()).toBe(1);
    expect(bs.y()).toBeCloseTo(0, 0);
    env.restore();
    dispose();
  });

  it("dragging down past the middle dismisses on release", async () => {
    const env = stubSheetEnv();
    const changes: boolean[] = [];
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
        snapPoints: [0.5, 1],
        onOpenChange: (open) => changes.push(open),
      }),
    );
    await sleep(0);
    bs.openSheet(0);
    env.settle(bs);

    env.down(500);
    env.advance(500);
    env.move(750); // slow drag 250px down: sheet at y=650
    await sleep(0);
    expect(bs.y()).toBeCloseTo(650, 0);
    env.advance(10);
    env.up();
    env.settle(bs);
    expect(bs.open()).toBe(false);
    expect(bs.snapIndex()).toBe(-1);
    expect(bs.y()).toBeCloseTo(800, 0);
    expect(changes).toEqual([true, false]);
    env.restore();
    dispose();
  });

  it("a fast downward flick dismisses from above the middle", async () => {
    const env = stubSheetEnv();
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
        snapPoints: [0.5, 1],
      }),
    );
    await sleep(0);
    bs.openSheet(1);
    env.settle(bs);
    expect(bs.y()).toBeCloseTo(0, 0);

    env.down(500);
    env.advance(20);
    env.move(545); // 45px in 20ms: ~2250 px/s downward
    await sleep(0);
    env.advance(10);
    env.up();
    env.settle(bs);
    expect(bs.open()).toBe(false);
    expect(bs.y()).toBeCloseTo(800, 0);
    env.restore();
    dispose();
  });

  it("rubber-bands past the fully-open top while dragging", async () => {
    const env = stubSheetEnv();
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
        snapPoints: [0.5, 1],
      }),
    );
    await sleep(0);
    bs.openSheet(1);
    env.settle(bs);

    env.down(500);
    env.move(200); // 300px above the top: resisted to -90
    await sleep(0);
    expect(bs.y()).toBeCloseTo(-90, 0);
    env.advance(300);
    env.up();
    env.settle(bs);
    expect(bs.y()).toBeCloseTo(0, 0); // released back to full
    env.restore();
    dispose();
  });

  it("close() dismisses and snapTo() reopens", async () => {
    const env = stubSheetEnv();
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
      }),
    );
    await sleep(0);
    bs.openSheet();
    env.settle(bs);
    bs.close();
    env.settle(bs);
    expect(bs.open()).toBe(false);
    expect(bs.y()).toBeCloseTo(800, 0);
    bs.snapTo(0);
    env.settle(bs);
    expect(bs.open()).toBe(true);
    expect(bs.snapIndex()).toBe(0);
    env.restore();
    dispose();
  });

  it("dismissible: false keeps the sheet at the lowest snap", async () => {
    const env = stubSheetEnv();
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
        snapPoints: [0.5, 1],
        dismissible: false,
      }),
    );
    await sleep(0);
    bs.openSheet(0);
    env.settle(bs);

    env.down(500);
    env.advance(500);
    env.move(750);
    await sleep(0);
    env.advance(10);
    env.up();
    env.settle(bs);
    expect(bs.open()).toBe(true);
    expect(bs.snapIndex()).toBe(0);
    expect(bs.y()).toBeCloseTo(400, 0);
    env.restore();
    dispose();
  });

  it("reduced motion jumps to snap targets", async () => {
    const env = stubSheetEnv(800, true);
    const { bs, dispose } = openAt(env, () =>
      createBottomSheet(() => env.handle as unknown as Element, {
        measureRef: () => env.sheet as unknown as Element,
      }),
    );
    await sleep(0);
    bs.openSheet();
    expect(bs.y()).toBe(0); // no animation frames needed
    bs.close();
    expect(bs.y()).toBe(800);
    env.restore();
    dispose();
  });

  it("is SSR-safe", () => {
    // No globals stubbed: server path.
    const dispose = createRoot((d) => {
      const bs = createBottomSheet(() => null);
      expect(bs.open()).toBe(false);
      expect(bs.snapIndex()).toBe(-1);
      expect(bs.y()).toBe(0);
      expect(() => {
        bs.openSheet();
        bs.snapTo(0);
        bs.close();
      }).not.toThrow();
      return d;
    });
    dispose();
  });
});
