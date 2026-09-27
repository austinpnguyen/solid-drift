import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createKineticType,
  createScenePlayer,
  createCamera,
  createColorShift,
  createTransition,
  createBeat,
} from "./motion.js";

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

  return {
    async run(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}

/** Minimal fake DOM element: just enough for createKineticType's splitter. */
function fakeElement(text: string) {
  type FakeSpan = {
    textContent: string;
    style: Record<string, string>;
    setAttribute: () => void;
  };
  const spans: FakeSpan[] = [];
  // Real textContent reflects appended children, so replay() re-splits
  // the same text instead of seeing an empty string.
  const children: Array<{ textContent: string }> = [{ textContent: text }];
  const el = {
    get textContent(): string | null {
      return children.map((c) => c.textContent).join("");
    },
    set textContent(_v: string | null) {
      children.length = 0;
      spans.length = 0;
    },
    spans,
    setAttribute: () => {},
    appendChild: (c: { textContent: string }) => {
      children.push(c);
      return c;
    },
    ownerDocument: {
      createElement: () => {
        const s: FakeSpan = {
          textContent: "",
          style: {},
          setAttribute: () => {},
        };
        spans.push(s);
        return s;
      },
      createTextNode: (t: string) => ({ textContent: t }),
    },
  };
  return el;
}

describe("createCamera", () => {
  it("interpolates pan and zoom between keyframes", () => {
    stubBrowser();
    const [p, setP] = createSignal(0);
    let cam!: ReturnType<typeof createCamera>;
    createRoot(() => {
      cam = createCamera(
        [
          { at: 0, x: 0, y: 0, scale: 1 },
          { at: 1, x: 200, y: -100, scale: 2 },
        ],
        { progress: p },
      );
    });
    expect(cam()).toBe("translate3d(0px, 0px, 0) scale(1)");
    setP(0.5);
    expect(cam()).toBe("translate3d(100px, -50px, 0) scale(1.5)");
    setP(1);
    expect(cam()).toBe("translate3d(200px, -100px, 0) scale(2)");
  });

  it("clamps progress outside the keyframe range", () => {
    stubBrowser();
    const [p, setP] = createSignal(0);
    let cam!: ReturnType<typeof createCamera>;
    createRoot(() => {
      cam = createCamera(
        [
          { at: 0.2, x: 10, scale: 1.5 },
          { at: 0.8, x: 50, scale: 2 },
        ],
        { progress: p },
      );
    });
    setP(-1);
    expect(cam()).toBe("translate3d(10px, 0px, 0) scale(1.5)");
    setP(2);
    expect(cam()).toBe("translate3d(50px, 0px, 0) scale(2)");
  });

  it("sorts keyframes by `at` and defaults missing channels", () => {
    stubBrowser();
    const [p, setP] = createSignal(0);
    let cam!: ReturnType<typeof createCamera>;
    createRoot(() => {
      cam = createCamera(
        [
          { at: 1, scale: 3 }, // x/y omitted: default 0
          { at: 0 }, // everything omitted: 0, 0, 1
        ],
        { progress: p },
      );
    });
    expect(cam()).toBe("translate3d(0px, 0px, 0) scale(1)");
    setP(0.5);
    expect(cam()).toBe("translate3d(0px, 0px, 0) scale(2)");
  });

  it("respects per-segment easing", () => {
    stubBrowser();
    const [p, setP] = createSignal(0);
    let cam!: ReturnType<typeof createCamera>;
    createRoot(() => {
      cam = createCamera(
        [
          { at: 0, x: 0 },
          { at: 1, x: 100, easing: "easeInQuad" }, // 0.5^2 = 0.25
        ],
        { progress: p },
      );
    });
    setP(0.5);
    expect(cam()).toBe("translate3d(25px, 0px, 0) scale(1)");
  });

  it("throws on empty keyframes", () => {
    stubBrowser();
    const [p] = createSignal(0);
    expect(() => createCamera([], { progress: p })).toThrow();
  });

  it("holds the final keyframe under reduced motion", () => {
    stubBrowser({ reduced: true });
    const [p, setP] = createSignal(0);
    let cam!: ReturnType<typeof createCamera>;
    createRoot(() => {
      cam = createCamera(
        [
          { at: 0, x: 0, scale: 1 },
          { at: 1, x: 200, scale: 2 },
        ],
        { progress: p },
      );
    });
    setP(0.25);
    expect(cam()).toBe("translate3d(200px, 0px, 0) scale(2)");
  });

  it("works with a single keyframe", () => {
    stubBrowser();
    const [p, setP] = createSignal(0);
    let cam!: ReturnType<typeof createCamera>;
    createRoot(() => {
      cam = createCamera([{ at: 0, x: 5, y: 6, scale: 1.5 }], {
        progress: p,
      });
    });
    setP(0.9);
    expect(cam()).toBe("translate3d(5px, 6px, 0) scale(1.5)");
  });
});

describe("createColorShift", () => {
  it("travels from the first to the final stop while playing", async () => {
    const t = stubBrowser();
    let shift!: ReturnType<typeof createColorShift>;
    createRoot(() => {
      shift = createColorShift(
        [
          { at: 0, color: "#000000" },
          { at: 1, color: "#ffffff" },
        ],
        { duration: 100 },
      );
    });
    expect(shift.color()).toBe("#000000");
    const done = shift.play();
    expect(shift.status()).toBe("running");
    await t.run(3); // ~50ms: somewhere mid-shift
    const mid = shift.color();
    expect(mid).not.toBe("#000000");
    expect(mid).not.toBe("#ffffff");
    await t.run(10);
    await done;
    expect(shift.color()).toBe("#ffffff");
    expect(shift.status()).toBe("done");
  });

  it("replay restarts from the first stop", async () => {
    const t = stubBrowser();
    let shift!: ReturnType<typeof createColorShift>;
    createRoot(() => {
      shift = createColorShift(
        [
          { at: 0, color: "#ff0000" },
          { at: 1, color: "#0000ff" },
        ],
        { duration: 100 },
      );
    });
    const first = shift.play();
    await t.run(10);
    await first;
    expect(shift.color()).toBe("#0000ff");
    const second = shift.replay();
    expect(shift.color()).toBe("#ff0000");
    await t.run(10);
    await second;
    expect(shift.color()).toBe("#0000ff");
  });

  it("stop() resolves the play promise", async () => {
    const t = stubBrowser();
    let shift!: ReturnType<typeof createColorShift>;
    createRoot(() => {
      shift = createColorShift([{ at: 0, color: "#000" }, { at: 1, color: "#fff" }], {
        duration: 1000,
      });
    });
    let resolved = false;
    const done = shift.play().then(() => {
      resolved = true;
    });
    await t.run(2);
    shift.stop();
    await done;
    expect(resolved).toBe(true);
    expect(shift.status()).toBe("idle");
  });

  it("jumps to the final stop under reduced motion", async () => {
    stubBrowser({ reduced: true });
    let shift!: ReturnType<typeof createColorShift>;
    createRoot(() => {
      shift = createColorShift(
        [
          { at: 0, color: "#000000" },
          { at: 1, color: "#ffffff" },
        ],
        { duration: 100 },
      );
    });
    await shift.play();
    expect(shift.color()).toBe("#ffffff");
    expect(shift.status()).toBe("done");
  });

  it("honors the format option", async () => {
    const t = stubBrowser();
    let shift!: ReturnType<typeof createColorShift>;
    createRoot(() => {
      shift = createColorShift(
        [
          { at: 0, color: "#000000" },
          { at: 1, color: "#ffffff" },
        ],
        { duration: 100, format: "rgb" },
      );
    });
    const done = shift.play();
    await t.run(10);
    await done;
    expect(shift.color()).toBe("rgb(255, 255, 255)");
  });

  it("throws on empty stops or unparseable colors", () => {
    stubBrowser();
    expect(() => createColorShift([])).toThrow();
    expect(() =>
      createColorShift([
        { at: 0, color: "#000000" },
        { at: 1, color: "not-a-color" },
      ]),
    ).toThrow();
  });
});

describe("createTransition", () => {
  it("fades: outgoing visible at rest, incoming takes over when played", async () => {
    const t = stubBrowser();
    let cut!: ReturnType<typeof createTransition>;
    createRoot(() => {
      cut = createTransition({ type: "fade", duration: 100 });
    });
    expect(cut.outgoing().opacity).toBe("1");
    expect(cut.incoming().opacity).toBe("0");
    const done = cut.play();
    expect(cut.status()).toBe("running");
    await t.run(10);
    await done;
    expect(cut.outgoing().opacity).toBe("0");
    expect(cut.incoming().opacity).toBe("1");
    expect(cut.status()).toBe("done");
  });

  it("cut swaps instantly", async () => {
    stubBrowser();
    let cut!: ReturnType<typeof createTransition>;
    createRoot(() => {
      cut = createTransition({ type: "cut" });
    });
    await cut.play();
    expect(cut.outgoing().opacity).toBe("0");
    expect(cut.incoming().opacity).toBe("1");
    expect(cut.status()).toBe("done");
  });

  it("slide moves the layers in opposite directions", async () => {
    const t = stubBrowser();
    let slide!: ReturnType<typeof createTransition>;
    createRoot(() => {
      slide = createTransition({
        type: "slide",
        direction: "left",
        duration: 100,
      });
    });
    expect(slide.outgoing().transform).toBe("translateX(0%)");
    expect(slide.incoming().transform).toBe("translateX(100%)");
    const done = slide.play();
    await t.run(10);
    await done;
    expect(slide.outgoing().transform).toBe("translateX(-100%)");
    expect(slide.incoming().transform).toBe("translateX(0%)");
  });

  it("wipe reveals the incoming scene with a clip-path", async () => {
    const t = stubBrowser();
    let wipe!: ReturnType<typeof createTransition>;
    createRoot(() => {
      wipe = createTransition({
        type: "wipe",
        direction: "left",
        duration: 100,
      });
    });
    expect(wipe.incoming().clipPath).toBe("inset(0 100% 0 0)");
    expect(wipe.outgoing().opacity).toBe("1");
    const done = wipe.play();
    await t.run(10);
    await done;
    expect(wipe.incoming().clipPath).toBe("none");
  });

  it("wipe supports all four directions", () => {
    stubBrowser();
    const dirs = ["left", "right", "up", "down"] as const;
    const expected = [
      "inset(0 100% 0 0)",
      "inset(0 0 0 100%)",
      "inset(0 0 100% 0)",
      "inset(100% 0 0 0)",
    ];
    dirs.forEach((direction, i) => {
      let wipe!: ReturnType<typeof createTransition>;
      createRoot(() => {
        wipe = createTransition({ type: "wipe", direction });
      });
      expect(wipe.incoming().clipPath).toBe(expected[i]);
    });
  });

  it("replay runs the handoff again", async () => {
    const t = stubBrowser();
    let cut!: ReturnType<typeof createTransition>;
    createRoot(() => {
      cut = createTransition({ type: "fade", duration: 100 });
    });
    const first = cut.play();
    await t.run(10);
    await first;
    expect(cut.incoming().opacity).toBe("1");
    const done = cut.replay();
    expect(cut.status()).toBe("running");
    await t.run(10);
    await done;
    expect(cut.incoming().opacity).toBe("1");
    expect(cut.status()).toBe("done");
  });

  it("degrades to a cut under reduced motion", async () => {
    stubBrowser({ reduced: true });
    let cut!: ReturnType<typeof createTransition>;
    createRoot(() => {
      cut = createTransition({ type: "fade", duration: 100 });
    });
    await cut.play();
    expect(cut.outgoing().opacity).toBe("0");
    expect(cut.incoming().opacity).toBe("1");
    expect(cut.status()).toBe("done");
  });
});

describe("createScenePlayer", () => {
  it("steps through scenes in order and resolves after the last", async () => {
    const t = stubBrowser();
    const log: string[] = [];
    let player!: ReturnType<typeof createScenePlayer>;
    createRoot(() => {
      player = createScenePlayer([
        {
          duration: 100,
          onEnter: (i) => log.push(`enter${i}`),
          onExit: (i) => log.push(`exit${i}`),
        },
        {
          duration: 100,
          onEnter: (i) => log.push(`enter${i}`),
          onExit: (i) => log.push(`exit${i}`),
        },
        { duration: 100, onEnter: (i) => log.push(`enter${i}`) },
      ]);
    });
    expect(player.scene()).toBe(-1);
    const done = player.play();
    expect(player.status()).toBe("running");
    expect(player.scene()).toBe(0);
    await t.run(8); // ~134ms: scene 0 done, scene 1 active
    expect(player.scene()).toBe(1);
    await t.run(20); // well past the end
    await done;
    expect(player.scene()).toBe(2);
    expect(player.status()).toBe("done");
    expect(log).toEqual([
      "enter0",
      "exit0",
      "enter1",
      "exit1",
      "enter2",
    ]);
  });

  it("resolves immediately with no scenes", async () => {
    stubBrowser();
    let player!: ReturnType<typeof createScenePlayer>;
    createRoot(() => {
      player = createScenePlayer([]);
    });
    await player.play();
    expect(player.status()).toBe("done");
    expect(player.scene()).toBe(-1);
  });

  it("stop() resets to before the first scene", async () => {
    const t = stubBrowser();
    const log: string[] = [];
    let player!: ReturnType<typeof createScenePlayer>;
    createRoot(() => {
      player = createScenePlayer([
        {
          duration: 1000,
          onEnter: (i) => log.push(`enter${i}`),
          onExit: (i) => log.push(`exit${i}`),
        },
      ]);
    });
    let resolved = false;
    const done = player.play().then(() => {
      resolved = true;
    });
    await t.run(2);
    player.stop();
    await done;
    expect(resolved).toBe(true);
    expect(player.scene()).toBe(-1);
    expect(player.status()).toBe("idle");
    expect(log).toEqual(["enter0", "exit0"]);
  });

  it("pause() freezes the clock and play() resumes", async () => {
    const t = stubBrowser();
    let player!: ReturnType<typeof createScenePlayer>;
    createRoot(() => {
      player = createScenePlayer([
        { duration: 200 },
        { duration: 200 },
      ]);
    });
    let resolved = false;
    const done = player.play().then(() => {
      resolved = true;
    });
    await t.run(6); // ~100ms into scene 0
    player.pause();
    await done; // pause resolves the pending play promise
    expect(resolved).toBe(true);
    expect(player.status()).toBe("paused");
    expect(player.scene()).toBe(0);
    await t.run(10); // clock frozen: still scene 0
    expect(player.scene()).toBe(0);
    const done2 = player.play();
    await t.run(30);
    await done2;
    expect(player.scene()).toBe(1);
    expect(player.status()).toBe("done");
  });

  it("replay() restarts from the first scene", async () => {
    const t = stubBrowser();
    const log: string[] = [];
    let player!: ReturnType<typeof createScenePlayer>;
    createRoot(() => {
      player = createScenePlayer([
        { duration: 100, onEnter: () => log.push("enter0") },
        { duration: 100, onEnter: () => log.push("enter1") },
      ]);
    });
    const first = player.play();
    await t.run(20);
    await first;
    expect(player.status()).toBe("done");
    const second = player.play();
    expect(player.scene()).toBe(0);
    await t.run(20);
    await second;
    expect(log).toEqual(["enter0", "enter1", "enter0", "enter1"]);
  });

  it("next/prev/goTo jump between scenes", async () => {
    const t = stubBrowser();
    let player!: ReturnType<typeof createScenePlayer>;
    createRoot(() => {
      player = createScenePlayer([
        { duration: 10000 },
        { duration: 10000 },
        { duration: 10000 },
      ]);
    });
    const done = player.play();
    await t.run(2);
    expect(player.scene()).toBe(0);
    player.next();
    expect(player.scene()).toBe(1);
    player.next();
    expect(player.scene()).toBe(2);
    player.next(); // clamped at the last scene
    expect(player.scene()).toBe(2);
    player.prev();
    expect(player.scene()).toBe(1);
    player.goTo(0);
    expect(player.scene()).toBe(0);
    player.goTo(99); // clamped
    expect(player.scene()).toBe(2);
    player.stop();
    await done;
  });

  it("jumps to the final scene under reduced motion", async () => {
    stubBrowser({ reduced: true });
    const log: string[] = [];
    let player!: ReturnType<typeof createScenePlayer>;
    createRoot(() => {
      player = createScenePlayer([
        { duration: 1000, onEnter: (i) => log.push(`enter${i}`) },
        { duration: 1000, onEnter: (i) => log.push(`enter${i}`) },
      ]);
    });
    await player.play();
    expect(player.scene()).toBe(1);
    expect(player.status()).toBe("done");
    expect(log).toEqual(["enter1"]);
  });
});

describe("createBeat", () => {
  it("ticks beats and bars at the configured tempo", async () => {
    const t = stubBrowser();
    let beat!: ReturnType<typeof createBeat>;
    createRoot(() => {
      beat = createBeat({ bpm: 120, beatsPerBar: 4 });
    });
    expect(beat.status()).toBe("idle");
    beat.start();
    expect(beat.status()).toBe("running");
    await t.run(30); // ~500ms: one beat at 120 BPM
    expect(beat.beat()).toBe(1);
    expect(beat.bar()).toBe(0);
    await t.run(92); // ~1534ms more: past beat 4, into bar 1
    expect(beat.beat()).toBe(4);
    expect(beat.bar()).toBe(1);
    beat.stop();
    expect(beat.status()).toBe("idle");
  });

  it("fires onBeat callbacks and supports unsubscribe", async () => {
    const t = stubBrowser();
    let beat!: ReturnType<typeof createBeat>;
    const hits: number[] = [];
    createRoot(() => {
      beat = createBeat({ bpm: 120 });
    });
    const off = beat.onBeat((b) => hits.push(b));
    beat.start();
    await t.run(62); // ~1035ms: beats 0, 1, 2
    expect(hits).toEqual([0, 1, 2]);
    off();
    await t.run(31); // ~518ms: beat 3 would fire, but unsubscribed
    expect(hits).toEqual([0, 1, 2]);
    beat.stop();
  });

  it("start() is idempotent", async () => {
    const t = stubBrowser();
    let beat!: ReturnType<typeof createBeat>;
    createRoot(() => {
      beat = createBeat({ bpm: 600 }); // 100ms per beat
    });
    beat.start();
    await t.run(6); // ~100ms: beat 1
    beat.start(); // no-op: must not reset the clock
    await t.run(6);
    expect(beat.beat()).toBe(2);
    beat.stop();
  });

  it("exposes phase within the current beat", async () => {
    const t = stubBrowser();
    let beat!: ReturnType<typeof createBeat>;
    createRoot(() => {
      beat = createBeat({ bpm: 600 }); // 100ms per beat
    });
    beat.start();
    await t.run(3); // ~50ms: halfway through beat 0
    expect(beat.phase()).toBeCloseTo(0.5, 1);
    beat.stop();
  });
});

describe("createKineticType", () => {
  it("splits characters and settles them to their final state", async () => {
    const t = stubBrowser();
    const el = fakeElement("Hi");
    let kinetic!: ReturnType<typeof createKineticType>;
    createRoot(() => {
      kinetic = createKineticType(() => el as unknown as Element, {
        duration: 100,
        stagger: 20,
      });
    });
    expect(el.spans).toHaveLength(0);
    const done = kinetic.play();
    expect(kinetic.status()).toBe("running");
    expect(el.spans).toHaveLength(2);
    await t.run(20);
    await done;
    expect(kinetic.status()).toBe("done");
    for (const s of el.spans) {
      expect(s.style.opacity).toBe("1");
      expect(s.style.transform).toBe(
        "translateY(0px) scale(1) rotate(0deg)",
      );
      expect(s.style.filter).toBe("none");
    }
  });

  it("supports word units with the custom `from` state", async () => {
    const t = stubBrowser();
    const el = fakeElement("go big");
    let kinetic!: ReturnType<typeof createKineticType>;
    createRoot(() => {
      kinetic = createKineticType(() => el as unknown as Element, {
        unit: "words",
        duration: 100,
        stagger: 20,
        from: { y: 40, blur: 12, scale: 0.5, opacity: 0.2, rotate: 10 },
      });
    });
    const done = kinetic.play();
    await t.run(1);
    // Mid-flight the first word carries the custom from-state influence.
    expect(Number(el.spans[0].style.opacity)).toBeLessThan(1);
    await t.run(20);
    await done;
    expect(el.spans).toHaveLength(2);
    expect(el.spans[0].style.opacity).toBe("1");
  });

  it("replay restarts the reveal", async () => {
    const t = stubBrowser();
    const el = fakeElement("AB");
    let kinetic!: ReturnType<typeof createKineticType>;
    createRoot(() => {
      kinetic = createKineticType(() => el as unknown as Element, {
        duration: 100,
        stagger: 20,
      });
    });
    const first = kinetic.play();
    await t.run(20);
    await first;
    expect(kinetic.status()).toBe("done");
    const second = kinetic.replay();
    expect(kinetic.status()).toBe("running");
    await t.run(20);
    await second;
    expect(kinetic.status()).toBe("done");
  });

  it("stop() halts the reveal", async () => {
    const t = stubBrowser();
    const el = fakeElement("ABCD");
    let kinetic!: ReturnType<typeof createKineticType>;
    createRoot(() => {
      kinetic = createKineticType(() => el as unknown as Element, {
        duration: 1000,
        stagger: 100,
      });
    });
    let resolved = false;
    const done = kinetic.play().then(() => {
      resolved = true;
    });
    await t.run(2);
    kinetic.stop();
    await done;
    expect(resolved).toBe(true);
    expect(kinetic.status()).toBe("idle");
  });

  it("resolves immediately when the ref is null or the text is empty", async () => {
    stubBrowser();
    let kinetic!: ReturnType<typeof createKineticType>;
    createRoot(() => {
      kinetic = createKineticType(() => null);
    });
    await kinetic.play();
    expect(kinetic.status()).toBe("done");

    const empty = fakeElement("");
    createRoot(() => {
      kinetic = createKineticType(() => empty as unknown as Element);
    });
    await kinetic.play();
    expect(kinetic.status()).toBe("done");
  });

  it("jumps to the final state under reduced motion", async () => {
    stubBrowser({ reduced: true });
    const el = fakeElement("Hi");
    let kinetic!: ReturnType<typeof createKineticType>;
    createRoot(() => {
      kinetic = createKineticType(() => el as unknown as Element, {
        duration: 1000,
        stagger: 100,
      });
    });
    await kinetic.play();
    expect(kinetic.status()).toBe("done");
    for (const s of el.spans) {
      expect(s.style.opacity).toBe("1");
    }
  });
});
