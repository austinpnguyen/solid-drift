import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Accessor } from "solid-js";
import { isLowPowerMode, useLowPowerMode } from "./power.js";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DATA_QUERY = "(prefers-reduced-data: reduce)";

let motionMatches = false;
let dataMatches = false;
const mqListeners = new Map<string, Array<() => void>>();
const removed: string[] = [];
const navStub: Record<string, unknown> = {};

function fire(query: string) {
  (mqListeners.get(query) ?? []).forEach((cb) => cb());
}

beforeEach(() => {
  motionMatches = false;
  dataMatches = false;
  mqListeners.clear();
  removed.length = 0;
  for (const k of Object.keys(navStub)) delete navStub[k];
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({
      get matches() {
        return q === MOTION_QUERY
          ? motionMatches
          : q === DATA_QUERY
            ? dataMatches
            : false;
      },
      addEventListener: (_t: string, cb: () => void) => {
        const arr = mqListeners.get(q) ?? [];
        arr.push(cb);
        mqListeners.set(q, arr);
      },
      removeEventListener: (_t: string, _cb: () => void) => {
        removed.push(q);
      },
    }),
  });
  vi.stubGlobal("navigator", navStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isLowPowerMode", () => {
  it("is false when nothing signals low power", () => {
    navStub.hardwareConcurrency = 8;
    expect(isLowPowerMode()).toBe(false);
  });

  it("is true when reduced motion is preferred", () => {
    motionMatches = true;
    expect(isLowPowerMode()).toBe(true);
  });

  it("is true when reduced data is preferred", () => {
    dataMatches = true;
    expect(isLowPowerMode()).toBe(true);
  });

  it("is true on low-memory devices", () => {
    navStub.deviceMemory = 2;
    navStub.hardwareConcurrency = 8;
    expect(isLowPowerMode()).toBe(true);
  });

  it("is true on few-core devices", () => {
    navStub.hardwareConcurrency = 2;
    expect(isLowPowerMode()).toBe(true);
  });

  it("is false on capable devices", () => {
    navStub.deviceMemory = 8;
    navStub.hardwareConcurrency = 8;
    expect(isLowPowerMode()).toBe(false);
  });

  it("respects custom thresholds", () => {
    navStub.deviceMemory = 8;
    navStub.hardwareConcurrency = 16;
    expect(isLowPowerMode({ maxDeviceMemory: 8 })).toBe(true);
    expect(isLowPowerMode({ maxDeviceMemory: 7 })).toBe(false);
    expect(isLowPowerMode({ maxHardwareConcurrency: 16 })).toBe(true);
  });

  it("is false on the server", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", {});
    expect(isLowPowerMode()).toBe(false);
  });
});

describe("useLowPowerMode", () => {
  it("starts false and reacts to media query changes", () => {
    let low!: Accessor<boolean>;
    const dispose = createRoot((d) => {
      low = useLowPowerMode();
      return d;
    });
    expect(low()).toBe(false);

    motionMatches = true;
    fire(MOTION_QUERY);
    expect(low()).toBe(true);

    motionMatches = false;
    fire(MOTION_QUERY);
    expect(low()).toBe(false);

    dataMatches = true;
    fire(DATA_QUERY);
    expect(low()).toBe(true);
    dispose();
  });

  it("starts true on a low-end device", () => {
    navStub.deviceMemory = 3;
    let low!: Accessor<boolean>;
    const dispose = createRoot((d) => {
      low = useLowPowerMode();
      return d;
    });
    expect(low()).toBe(true);
    dispose();
  });

  it("removes both media listeners on dispose", () => {
    const dispose = createRoot((d) => {
      useLowPowerMode();
      return d;
    });
    dispose();
    expect(removed).toContain(MOTION_QUERY);
    expect(removed).toContain(DATA_QUERY);
  });

  it("is false on the server", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", {});
    let low!: Accessor<boolean>;
    createRoot((d) => {
      low = useLowPowerMode();
      return d;
    });
    expect(low()).toBe(false);
  });
});
