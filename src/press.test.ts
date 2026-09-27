import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "solid-js";
import {
  createHover,
  createPress,
  type HoverControls,
  type PressControls,
} from "./press.js";

interface ElStub {
  el: {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  fire: (type: string, event?: unknown) => void;
}

const makeEl = (): ElStub => {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    el: {
      addEventListener: vi.fn((type: string, fn: (event: unknown) => void) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
      }),
      removeEventListener: vi.fn(
        (type: string, fn: (event: unknown) => void) => {
          listeners.get(type)?.delete(fn);
        },
      ),
    },
    fire(type: string, event: unknown = {}) {
      listeners.get(type)?.forEach((fn) => fn(event));
    },
  };
};

const asElement = (stub: ElStub): Element => stub.el as unknown as Element;

beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createPress", () => {
  const owned = (
    stub: ElStub,
    onChange?: (pressed: boolean) => void,
  ): { p: PressControls; dispose: () => void } => {
    let p!: PressControls;
    const dispose = createRoot((d) => {
      p = createPress(() => asElement(stub), { onChange });
      return d;
    });
    return { p, dispose };
  };

  it("tracks pointer down and up", () => {
    const stub = makeEl();
    const { p, dispose } = owned(stub);
    expect(p.pressed()).toBe(false);
    stub.fire("pointerdown");
    expect(p.pressed()).toBe(true);
    stub.fire("pointerup");
    expect(p.pressed()).toBe(false);
    dispose();
  });

  it("releases on pointerleave and pointercancel", () => {
    const stub = makeEl();
    const { p, dispose } = owned(stub);
    stub.fire("pointerdown");
    stub.fire("pointerleave");
    expect(p.pressed()).toBe(false);
    stub.fire("pointerdown");
    stub.fire("pointercancel");
    expect(p.pressed()).toBe(false);
    dispose();
  });

  it("supports Enter and Space keys", () => {
    const stub = makeEl();
    const { p, dispose } = owned(stub);
    stub.fire("keydown", { key: "Enter", repeat: false });
    expect(p.pressed()).toBe(true);
    stub.fire("keyup", { key: "Enter" });
    expect(p.pressed()).toBe(false);
    stub.fire("keydown", { key: " ", repeat: false });
    expect(p.pressed()).toBe(true);
    stub.fire("keyup", { key: " " });
    expect(p.pressed()).toBe(false);
    dispose();
  });

  it("fires onChange only on change", () => {
    const onChange = vi.fn();
    const stub = makeEl();
    const { dispose } = owned(stub, onChange);
    stub.fire("pointerdown");
    stub.fire("pointerdown");
    stub.fire("pointerup");
    stub.fire("pointerup");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, false);
    dispose();
  });

  it("removes its listeners on dispose", () => {
    const stub = makeEl();
    const { p, dispose } = owned(stub);
    dispose();
    expect(stub.el.removeEventListener).toHaveBeenCalled();
    stub.fire("pointerdown");
    expect(p.pressed()).toBe(false);
  });
});

describe("createHover", () => {
  const owned = (
    stub: ElStub,
    onChange?: (hovering: boolean) => void,
  ): { h: HoverControls; dispose: () => void } => {
    let h!: HoverControls;
    const dispose = createRoot((d) => {
      h = createHover(() => asElement(stub), { onChange });
      return d;
    });
    return { h, dispose };
  };

  it("tracks pointer enter and leave", () => {
    const stub = makeEl();
    const { h, dispose } = owned(stub);
    expect(h.hovering()).toBe(false);
    stub.fire("pointerenter");
    expect(h.hovering()).toBe(true);
    stub.fire("pointerleave");
    expect(h.hovering()).toBe(false);
    dispose();
  });

  it("treats focus like hover for keyboard users", () => {
    const onChange = vi.fn();
    const stub = makeEl();
    const { h, dispose } = owned(stub, onChange);
    stub.fire("focus");
    expect(h.hovering()).toBe(true);
    stub.fire("blur");
    expect(h.hovering()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("removes its listeners on dispose", () => {
    const stub = makeEl();
    const { h, dispose } = owned(stub);
    dispose();
    expect(stub.el.removeEventListener).toHaveBeenCalled();
    stub.fire("pointerenter");
    expect(h.hovering()).toBe(false);
  });
});
