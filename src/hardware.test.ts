import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createBattery,
  createNetwork,
  createWakeLock,
  createContactPick,
  createOTP,
  createShare,
  createNFC,
  createTorch,
  createGyro,
  createShake,
  createScanline,
} from "./hardware";

/* Helpers to fake browser globals in node. */

const stubGlobals = (partial: Record<string, unknown>): void => {
  const listeners = new Map<string, Set<(e: Event) => void>>();
  const addEventListener = (type: string, fn: (e: Event) => void) => {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(fn);
  };
  const removeEventListener = (type: string, fn: (e: Event) => void) => {
    listeners.get(type)?.delete(fn);
  };
  const __fire = (type: string, event: Event) => {
    listeners.get(type)?.forEach((fn) => fn(event));
  };
  vi.stubGlobal("window", {
    addEventListener,
    removeEventListener,
    __fire,
    ...partial,
  });
  vi.stubGlobal("addEventListener", addEventListener);
  vi.stubGlobal("removeEventListener", removeEventListener);
  for (const [key, value] of Object.entries(partial)) {
    vi.stubGlobal(key, value);
  }
  (globalThis as Record<string, unknown>).__fireGlobal = __fire;
};

const fireGlobal = (type: string, event: Event): void => {
  (
    (globalThis as Record<string, unknown>).__fireGlobal as (
      type: string,
      event: Event,
    ) => void
  )(type, event);
};

const stubRaf = (): { advance: (ms: number) => void } => {
  let cb: ((t: number) => void) | null = null;
  vi.stubGlobal("requestAnimationFrame", (fn: (t: number) => void) => {
    cb = fn;
    return 1;
  });
  return {
    advance: (ms: number) => {
      // The shared engine clock reads performance.now(), not the rAF stamp.
      vi.advanceTimersByTime(ms);
      const fn = cb;
      cb = null;
      fn?.(performance.now());
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* Fake BatteryManager. */

class FakeBattery extends EventTarget {
  charging = false;
  level = 0.42;
  chargingTime = 3600;
  dischargingTime = 7200;
}

describe("createBattery", () => {
  it("is unsupported on the server", () => {
    const b = createBattery();
    expect(b.supported).toBe(false);
    expect(b.charging()).toBe(false);
    expect(b.level()).toBe(1);
  });

  it("reads the manager and follows levelchange", async () => {
    const battery = new FakeBattery();
    stubGlobals({
      navigator: { getBattery: async () => battery },
    });
    const b = createBattery();
    expect(b.supported).toBe(true);
    await vi.runAllTimersAsync();
    expect(b.level()).toBe(0.42);
    expect(b.charging()).toBe(false);
    battery.level = 0.9;
    battery.charging = true;
    battery.dispatchEvent(new Event("levelchange"));
    battery.dispatchEvent(new Event("chargingchange"));
    expect(b.level()).toBe(0.9);
    expect(b.charging()).toBe(true);
    expect(b.chargingTime()).toBe(3600);
  });

  it("reports errors when getBattery rejects", async () => {
    stubGlobals({
      navigator: { getBattery: async () => { throw new Error("denied"); } },
    });
    const b = createBattery();
    await vi.runAllTimersAsync();
    expect(b.error()?.message).toBe("denied");
  });
});

describe("createNetwork", () => {
  it("tracks online/offline and connection info", () => {
    const connListeners = new Map<string, Set<() => void>>();
    const connection = {
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      saveData: false,
      addEventListener: (t: string, fn: () => void) => {
        let s = connListeners.get(t);
        if (!s) {
          s = new Set();
          connListeners.set(t, s);
        }
        s.add(fn);
      },
      removeEventListener: (t: string, fn: () => void) => {
        connListeners.get(t)?.delete(fn);
      },
    };
    stubGlobals({ navigator: { onLine: true, connection } });
    const n = createNetwork();
    expect(n.online()).toBe(true);
    expect(n.effectiveType()).toBe("4g");
    expect(n.downlink()).toBe(10);
    expect(n.rtt()).toBe(50);
    expect(n.saveData()).toBe(false);
    expect(n.supported).toBe(true);

    fireGlobal("offline", new Event("offline"));
    expect(n.online()).toBe(false);
    fireGlobal("online", new Event("online"));
    expect(n.online()).toBe(true);

    connection.effectiveType = "3g";
    connListeners.get("change")?.forEach((fn) => fn());
    expect(n.effectiveType()).toBe("3g");
  });

  it("works without the connection API", () => {
    stubGlobals({ navigator: { onLine: false } });
    const n = createNetwork();
    expect(n.supported).toBe(false);
    expect(n.online()).toBe(false);
    expect(n.effectiveType()).toBeUndefined();
  });
});

describe("createWakeLock", () => {
  it("requests and releases the lock", async () => {
    let released = false;
    const sentinel = { release: async () => { released = true; } };
    stubGlobals({
      navigator: { wakeLock: { request: async () => sentinel } },
      document: { hidden: false },
    });
    const w = createWakeLock();
    expect(w.supported).toBe(true);
    await w.request();
    expect(w.active()).toBe(true);
    await w.release();
    expect(w.active()).toBe(false);
    expect(released).toBe(true);
  });

  it("is unsupported on the server", async () => {
    const w = createWakeLock();
    expect(w.supported).toBe(false);
    await expect(w.request()).rejects.toThrow("not supported");
  });
});

describe("createContactPick", () => {
  it("picks and normalizes contacts", async () => {
    stubGlobals({
      navigator: {
        contacts: {
          select: async () => [
            { name: ["Ada"], tel: ["+1"], email: [] },
            { name: [], tel: [], email: ["b@x.com"] },
          ],
        },
      },
    });
    const c = createContactPick();
    expect(c.supported).toBe(true);
    const picked = await c.pick({ multiple: true });
    expect(picked).toHaveLength(2);
    expect(picked[0]).toEqual({ name: ["Ada"], tel: ["+1"], email: [] });
    expect(c.contacts()).toHaveLength(2);
  });

  it("returns an empty array on cancel", async () => {
    stubGlobals({
      navigator: { contacts: { select: async () => [] } },
    });
    const c = createContactPick();
    expect(await c.pick()).toEqual([]);
  });

  it("throws when unsupported", async () => {
    const c = createContactPick();
    await expect(c.pick()).rejects.toThrow("not supported");
  });
});

describe("createOTP", () => {
  it("resolves with the SMS code", async () => {
    stubGlobals({
      navigator: { credentials: { get: async () => ({ code: "482516" }) } },
    });
    const o = createOTP();
    expect(o.supported).toBe(true);
    const code = await o.wait();
    expect(code).toBe("482516");
    expect(o.code()).toBe("482516");
  });

  it("aborting wait resolves null", async () => {
    let signal: AbortSignal | null = null;
    stubGlobals({
      navigator: {
        credentials: {
          get: (opts: { signal: AbortSignal }) =>
            new Promise((_res, rej) => {
              signal = opts.signal;
              opts.signal.addEventListener("abort", () =>
                rej(new DOMException("aborted", "AbortError")),
              );
            }),
        },
      },
    });
    const o = createOTP();
    const pending = o.wait();
    o.abort();
    expect(signal!.aborted).toBe(true);
    await expect(pending).resolves.toBeNull();
  });
});

describe("createShare", () => {
  it("shares through the native sheet", async () => {
    let shared: unknown = null;
    stubGlobals({
      navigator: {
        share: async (data: unknown) => { shared = data; },
        canShare: () => true,
      },
    });
    const s = createShare();
    expect(s.supported).toBe(true);
    expect(s.canShare({ title: "t" })).toBe(true);
    await s.share({ title: "t", text: "hi", url: "https://x.com" });
    expect(shared).toEqual({ title: "t", text: "hi", url: "https://x.com" });
  });

  it("treats user dismissal as a non-error", async () => {
    stubGlobals({
      navigator: {
        share: async () => { throw new DOMException("dismissed", "AbortError"); },
      },
    });
    const s = createShare();
    await s.share({ title: "t" });
    expect(s.error()).toBeNull();
  });

  it("throws when unsupported", async () => {
    const s = createShare();
    expect(s.supported).toBe(false);
    await expect(s.share({ title: "t" })).rejects.toThrow("not supported");
  });
});

describe("createNFC", () => {
  const encodeTextRecord = (text: string): DataView => {
    const lang = new TextEncoder().encode("en");
    const body = new TextEncoder().encode(text);
    const bytes = new Uint8Array(1 + lang.length + body.length);
    bytes[0] = lang.length;
    bytes.set(lang, 1);
    bytes.set(body, 1 + lang.length);
    return new DataView(bytes.buffer);
  };

  it("scans and decodes a text record", async () => {
    let instance: { onreading: ((e: unknown) => void) | null } | null = null;
    class FakeNDEFReader {
      onreading: ((e: unknown) => void) | null = null;
      onreadingerror: (() => void) | null = null;
      async scan() {
        instance = this;
      }
      async write() {}
    }
    stubGlobals({ NDEFReader: FakeNDEFReader });
    const nfc = createNFC();
    expect(nfc.supported).toBe(true);
    await nfc.scan();
    expect(nfc.scanning()).toBe(true);
    instance!.onreading!({
      message: {
        records: [{ recordType: "text", data: encodeTextRecord("hello tag") }],
      },
      serialNumber: "04:ab",
    });
    expect(nfc.message()?.records[0]?.text).toBe("hello tag");
    expect(nfc.message()?.serialNumber).toBe("04:ab");
  });

  it("writes a string", async () => {
    let written: unknown = null;
    class FakeNDEFReader {
      onreading: null = null;
      onreadingerror: null = null;
      async scan() {}
      async write(content: unknown) {
        written = content;
      }
    }
    stubGlobals({ NDEFReader: FakeNDEFReader });
    const nfc = createNFC();
    await nfc.write("hello");
    expect(written).toBe("hello");
  });

  it("is unsupported on the server", async () => {
    const nfc = createNFC();
    expect(nfc.supported).toBe(false);
    await expect(nfc.scan()).rejects.toThrow("not supported");
  });
});

describe("createTorch", () => {
  const fakeTrack = (torchCapable: boolean) => {
    const seen: unknown[] = [];
    return {
      track: {
        getCapabilities: () => (torchCapable ? { torch: true } : {}),
        applyConstraints: async (c: unknown) => {
          seen.push(c);
        },
      } as unknown as MediaStreamTrack,
      seen,
    };
  };

  it("toggles the flashlight on a capable track", async () => {
    const { track, seen } = fakeTrack(true);
    const t = createTorch();
    t.attach(track);
    expect(t.supported()).toBe(true);
    await t.set(true);
    expect(t.on()).toBe(true);
    expect(seen[0]).toEqual({ advanced: [{ torch: true }] });
    await t.toggle();
    expect(t.on()).toBe(false);
    expect(seen[1]).toEqual({ advanced: [{ torch: false }] });
  });

  it("reports unsupported without the torch capability", async () => {
    const { track } = fakeTrack(false);
    const t = createTorch();
    t.attach(track);
    expect(t.supported()).toBe(false);
  });

  it("accepts a MediaStream", async () => {
    const { track, seen } = fakeTrack(true);
    const t = createTorch();
    t.attach({ getVideoTracks: () => [track] } as unknown as MediaStream);
    await t.set(true);
    expect(seen).toHaveLength(1);
  });

  it("throws without an attached track", async () => {
    const t = createTorch();
    await expect(t.set(true)).rejects.toThrow("attach");
  });
});

describe("createGyro", () => {
  it("follows deviceorientation events", async () => {
    stubGlobals({ DeviceOrientationEvent: class {} });
    const g = createGyro();
    expect(g.supported).toBe(true);
    expect(g.needsPermission).toBe(false);
    await g.start();
    expect(g.listening()).toBe(true);
    fireGlobal(
      "deviceorientation",
      { alpha: 10, beta: 20, gamma: 30, absolute: true } as unknown as Event,
    );
    expect(g.alpha()).toBe(10);
    expect(g.beta()).toBe(20);
    expect(g.gamma()).toBe(30);
    expect(g.absolute()).toBe(true);
    g.stop();
    expect(g.listening()).toBe(false);
  });

  it("requests iOS permission", async () => {
    let asked = false;
    class FakeOrientation {}
    (FakeOrientation as unknown as Record<string, unknown>).requestPermission =
      async () => {
        asked = true;
        return "granted";
      };
    stubGlobals({ DeviceOrientationEvent: FakeOrientation });
    const g = createGyro();
    expect(g.needsPermission).toBe(true);
    expect(await g.requestPermission()).toBe("granted");
    expect(asked).toBe(true);
  });
});

describe("createShake", () => {
  it("counts a shake on a strong motion delta", async () => {
    stubGlobals({ DeviceMotionEvent: class {} });
    let onShakeCalls = 0;
    const s = createShake({ threshold: 5, cooldown: 1000, onShake: () => { onShakeCalls++; } });
    await s.start();
    expect(s.listening()).toBe(true);
    const motion = (x: number, y: number, z: number) =>
      fireGlobal(
        "devicemotion",
        { accelerationIncludingGravity: { x, y, z } } as unknown as Event,
      );
    motion(0, 0, 9.8);
    vi.advanceTimersByTime(100);
    motion(12, 4, 2);
    expect(s.shakes()).toBe(1);
    expect(onShakeCalls).toBe(1);
    // Within cooldown: ignored.
    vi.advanceTimersByTime(100);
    motion(-12, -4, 18);
    expect(s.shakes()).toBe(1);
    s.stop();
    expect(s.listening()).toBe(false);
  });
});

describe("createScanline", () => {
  it("sweeps the line back and forth on the shared clock", () => {
    const raf = stubRaf();
    const s = createScanline({ duration: 1000, direction: "alternate" });
    s.start();
    expect(s.running()).toBe(true);
    const seen: number[] = [];
    raf.advance(0);
    seen.push(s.progress());
    for (let i = 0; i < 6; i++) {
      raf.advance(125);
      seen.push(s.progress());
    }
    s.stop();
    raf.advance(0); // flush the engine so the next test re-schedules cleanly
    expect(s.running()).toBe(false);
    // Alternate ping-pong: rises toward 1, then falls back.
    const max = Math.max(...seen);
    expect(max).toBeGreaterThan(0.5);
    expect(seen[seen.length - 1]!).toBeLessThan(max);
  });

  it("advances progress over time", () => {
    const raf = stubRaf();
    const s = createScanline({ duration: 1000, direction: "down" });
    s.start();
    raf.advance(0);
    expect(s.progress()).toBe(0);
    raf.advance(250);
    expect(s.progress()).toBeCloseTo(0.25, 2);
    raf.advance(250);
    expect(s.progress()).toBeCloseTo(0.5, 2);
    s.stop();
    raf.advance(0); // flush the engine so the next test re-schedules cleanly
  });

  it("freezes mid-frame under reduced motion", () => {
    stubRaf();
    stubGlobals({});
    (globalThis.window as unknown as Record<string, unknown>).matchMedia = () => ({
      matches: true,
    });
    const s = createScanline({ duration: 1000 });
    s.start();
    expect(s.progress()).toBe(0.5);
    expect(s.running()).toBe(true);
    s.stop();
  });
});
