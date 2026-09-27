import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createToast, type ToastControls } from "./toast.js";

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

function setupQueue(options?: Parameters<typeof createToast>[0]): {
  controls: ToastControls;
  dispose: () => void;
} {
  let controls!: ToastControls;
  const dispose = createRoot((d) => {
    controls = createToast(options);
    return d;
  });
  return { controls, dispose };
}

describe("createToast", () => {
  it("pushes a toast that transitions entering -> visible", () => {
    const b = stubBrowser();
    const { controls, dispose } = setupQueue();
    const id = controls.toast("Hello");
    expect(typeof id).toBe("number");
    expect(controls.toasts()).toHaveLength(1);
    expect(controls.toasts()[0].state).toBe("entering");
    expect(controls.toasts()[0].title).toBe("Hello");
    b.frames(20); // ~334ms > enterMs 250
    expect(controls.toasts()[0].state).toBe("visible");
    dispose();
  });

  it("auto-dismisses after the duration with a leave transition", () => {
    const b = stubBrowser();
    const { controls, dispose } = setupQueue({
      duration: 1000,
      enterMs: 250,
      leaveMs: 200,
    });
    controls.toast("Bye soon");
    b.frames(20); // visible at ~334ms
    expect(controls.toasts()[0].state).toBe("visible");
    b.frames(50); // ~1169ms: past the 1000ms deadline
    expect(controls.toasts()[0].state).toBe("leaving");
    b.frames(20); // past leaving + 200ms
    expect(controls.toasts()).toHaveLength(0);
    dispose();
  });

  it("keeps sticky toasts (duration 0) until dismissed", () => {
    const b = stubBrowser();
    const { controls, dispose } = setupQueue();
    const id = controls.toast("Sticky", { duration: 0 });
    b.frames(200); // ~3.3s, far past the default duration
    expect(controls.toasts()).toHaveLength(1);
    expect(controls.toasts()[0].state).toBe("visible");
    controls.dismiss(id);
    b.frames(20);
    expect(controls.toasts()).toHaveLength(0);
    dispose();
  });

  it("dismiss moves one toast to leaving without touching others", () => {
    const b = stubBrowser();
    const { controls, dispose } = setupQueue();
    const a = controls.toast("A", { duration: 0 });
    const bb = controls.toast("B", { duration: 0 });
    controls.dismiss(a);
    expect(controls.toasts().find((t) => t.id === a)?.state).toBe("leaving");
    expect(controls.toasts().find((t) => t.id === bb)?.state).toBe("entering");
    b.frames(20);
    expect(controls.toasts().map((t) => t.id)).toEqual([bb]);
    dispose();
  });

  it("clear dismisses every toast", () => {
    const b = stubBrowser();
    const { controls, dispose } = setupQueue();
    controls.toast("A", { duration: 0 });
    controls.toast("B", { duration: 0 });
    controls.clear();
    expect(
      controls.toasts().every((t) => t.state === "leaving"),
    ).toBe(true);
    b.frames(20);
    expect(controls.toasts()).toHaveLength(0);
    dispose();
  });

  it("dismisses the oldest toast when max is exceeded", () => {
    const b = stubBrowser();
    const { controls, dispose } = setupQueue({ max: 2 });
    controls.toast("A", { duration: 0 });
    controls.toast("B", { duration: 0 });
    controls.toast("C", { duration: 0 });
    const titles = controls.toasts();
    expect(titles).toHaveLength(3);
    expect(titles[0].title).toBe("A");
    expect(titles[0].state).toBe("leaving");
    b.frames(20);
    expect(controls.toasts().map((t) => t.title)).toEqual(["B", "C"]);
    dispose();
  });

  it("kind shortcuts set the kind and ids increase", () => {
    stubBrowser();
    const { controls, dispose } = setupQueue();
    const a = controls.success("Paid");
    const b2 = controls.error("Failed");
    const c = controls.warning("Careful", { duration: 0 });
    const d = controls.info("Note", { duration: 0 });
    expect(b2).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b2);
    expect(d).toBeGreaterThan(c);
    const kinds = controls.toasts().map((t) => t.kind);
    expect(kinds).toEqual(["success", "error", "warning", "info"]);
    dispose();
  });

  it("passes description through and allows per-toast duration", () => {
    const b = stubBrowser();
    const { controls, dispose } = setupQueue({ duration: 60000 });
    controls.toast("Tx sent", {
      description: "0.5 SOL to alice.sol",
      duration: 500,
    });
    expect(controls.toasts()[0].description).toBe("0.5 SOL to alice.sol");
    b.frames(20);
    expect(controls.toasts()[0].state).toBe("visible");
    b.frames(15); // ~585ms: past the 500ms deadline, inside the leave window
    expect(controls.toasts()[0].state).toBe("leaving");
    b.frames(10); // ~752ms: past deadline + 200ms leave
    expect(controls.toasts()).toHaveLength(0);
    dispose();
  });

  it("dismissing an unknown id is a no-op", () => {
    stubBrowser();
    const { controls, dispose } = setupQueue();
    controls.toast("A", { duration: 0 });
    expect(() => controls.dismiss(999)).not.toThrow();
    expect(controls.toasts()).toHaveLength(1);
    dispose();
  });

  it("transitions instantly under reduced motion", () => {
    const b = stubBrowser({ reduced: true });
    const { controls, dispose } = setupQueue();
    controls.toast("Fast", { duration: 0 });
    b.frames(1);
    expect(controls.toasts()[0].state).toBe("visible");
    const id = controls.toasts()[0].id;
    controls.dismiss(id);
    b.frames(1);
    expect(controls.toasts()).toHaveLength(0);
    dispose();
  });

  it("starts visible on the server", () => {
    // No window stubbed: SSR path.
    const { controls } = setupQueue();
    controls.toast("SSR toast");
    expect(controls.toasts()[0].state).toBe("visible");
  });
});
