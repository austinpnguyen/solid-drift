import { createSignal, onCleanup } from "solid-js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { schedule } from "./engine.js";

const g = globalThis as unknown as Record<string, unknown>;

function isClient(): boolean {
  return typeof globalThis.window !== "undefined";
}

function getNavigator(): Navigator | undefined {
  return g["navigator"] as Navigator | undefined;
}

/** Attach a listener to the global scope (window in browsers). No-op on the server. */
function onGlobalEvent(type: string, fn: (event: Event) => void): () => void {
  const add = g["addEventListener"] as
    | ((type: string, fn: (event: Event) => void) => void)
    | undefined;
  const remove = g["removeEventListener"] as
    | ((type: string, fn: (event: Event) => void) => void)
    | undefined;
  if (!isClient() || typeof add !== "function" || typeof remove !== "function") {
    return () => {};
  }
  add.call(globalThis, type, fn);
  return () => remove.call(globalThis, type, fn);
}

function documentHidden(): boolean {
  const doc = g["document"] as { hidden?: boolean } | undefined;
  return doc?.hidden ?? false;
}

export interface BatteryState {
  supported: boolean;
  charging: () => boolean;
  level: () => number;
  chargingTime: () => number;
  dischargingTime: () => number;
  error: () => Error | null;
}

interface BatteryLike extends EventTarget {
  charging: boolean;
  level: number;
  chargingTime: number;
  dischargingTime: number;
}

/**
 * createBattery
 *
 * Reactive wrapper around the Battery Status API (`navigator.getBattery`).
 * Tracks charging state, level (0..1), and charge/discharge time in seconds.
 */
export function createBattery(): BatteryState {
  const nav = getNavigator();
  const hasApi = isClient() && typeof (nav as any)?.getBattery === "function";
  const [charging, setCharging] = createSignal(false);
  const [level, setLevel] = createSignal(1);
  const [chargingTime, setChargingTime] = createSignal(Infinity);
  const [dischargingTime, setDischargingTime] = createSignal(Infinity);
  const [error, setError] = createSignal<Error | null>(null);

  if (hasApi) {
    let manager: BatteryLike | null = null;
    const sync = () => {
      if (!manager) return;
      setCharging(manager.charging);
      setLevel(manager.level);
      setChargingTime(manager.chargingTime);
      setDischargingTime(manager.dischargingTime);
    };
    (nav as any)
      .getBattery()
      .then((m: BatteryLike) => {
        manager = m;
        sync();
        manager.addEventListener("chargingchange", sync);
        manager.addEventListener("levelchange", sync);
        manager.addEventListener("chargingtimechange", sync);
        manager.addEventListener("dischargingtimechange", sync);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    onCleanup(() => {
      manager?.removeEventListener("chargingchange", sync);
      manager?.removeEventListener("levelchange", sync);
      manager?.removeEventListener("chargingtimechange", sync);
      manager?.removeEventListener("dischargingtimechange", sync);
    });
  }

  return {
    supported: hasApi,
    charging,
    level,
    chargingTime,
    dischargingTime,
    error,
  };
}

export interface NetworkState {
  online: () => boolean;
  effectiveType: () => string | undefined;
  downlink: () => number | undefined;
  rtt: () => number | undefined;
  saveData: () => boolean;
  supported: boolean;
}

/**
 * createNetwork
 *
 * Reactive network status: `navigator.onLine` plus the Network Information
 * API (`navigator.connection`) for effective type, downlink, RTT, and
 * data-saver preference.
 */
export function createNetwork(): NetworkState {
  const nav = getNavigator();
  const conn = (nav as any)?.connection as
    | {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
        addEventListener?: (type: string, fn: () => void) => void;
        removeEventListener?: (type: string, fn: () => void) => void;
      }
    | undefined;

  const [online, setOnline] = createSignal<boolean>(
    typeof nav?.onLine === "boolean" ? nav.onLine : true,
  );
  const [effectiveType, setEffectiveType] = createSignal<string | undefined>(
    conn?.effectiveType,
  );
  const [downlink, setDownlink] = createSignal<number | undefined>(
    conn?.downlink,
  );
  const [rtt, setRtt] = createSignal<number | undefined>(conn?.rtt);
  const [saveData, setSaveData] = createSignal<boolean>(
    conn?.saveData ?? false,
  );

  const syncConnection = () => {
    setEffectiveType(conn?.effectiveType);
    setDownlink(conn?.downlink);
    setRtt(conn?.rtt);
    setSaveData(conn?.saveData ?? false);
  };

  const off1 = onGlobalEvent("online", () => setOnline(true));
  const off2 = onGlobalEvent("offline", () => setOnline(false));
  if (typeof conn?.addEventListener === "function") {
    conn.addEventListener("change", syncConnection);
  }
  onCleanup(() => {
    off1();
    off2();
    if (typeof conn?.removeEventListener === "function") {
      conn.removeEventListener("change", syncConnection);
    }
  });

  return {
    online,
    effectiveType,
    downlink,
    rtt,
    saveData,
    supported: conn != null,
  };
}

export interface WakeLockState {
  supported: boolean;
  active: () => boolean;
  error: () => Error | null;
  request: () => Promise<void>;
  release: () => Promise<void>;
}

/**
 * createWakeLock
 *
 * Keeps the screen awake with the Screen Wake Lock API. Re-acquires the lock
 * automatically when the tab becomes visible again after a release.
 */
export function createWakeLock(): WakeLockState {
  const nav = getNavigator();
  const hasApi =
    isClient() && typeof (nav as any)?.wakeLock?.request === "function";
  const [active, setActive] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let sentinel: { release: () => Promise<void> } | null = null;
  let wanted = false;

  const acquire = async (): Promise<void> => {
    if (!hasApi) {
      throw new Error("Screen Wake Lock API is not supported.");
    }
    setError(null);
    try {
      const next = (await (nav as any).wakeLock.request("screen")) as {
        release: () => Promise<void>;
      };
      sentinel = next;
      setActive(true);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  };

  const request = async (): Promise<void> => {
    wanted = true;
    await acquire();
  };

  const release = async (): Promise<void> => {
    wanted = false;
    const current = sentinel;
    sentinel = null;
    setActive(false);
    if (current) {
      try {
        await current.release();
      } catch {
        // Releasing an already-released lock is harmless.
      }
    }
  };

  const off = onGlobalEvent("visibilitychange", () => {
    if (!documentHidden() && wanted && !active()) {
      void acquire().catch(() => {});
    }
  });
  onCleanup(() => {
    off();
    wanted = false;
    void sentinel?.release().catch(() => {});
    sentinel = null;
  });

  return { supported: hasApi, active, error, request, release };
}

export interface PickedContact {
  name: string[];
  tel: string[];
  email: string[];
}

export interface ContactPickState {
  supported: boolean;
  contacts: () => PickedContact[];
  error: () => Error | null;
  pick: (options?: { multiple?: boolean }) => Promise<PickedContact[]>;
}

/**
 * createContactPick
 *
 * Contact Picker API (`navigator.contacts.select`). Resolves with the chosen
 * contacts; empty array when the user cancels.
 */
export function createContactPick(): ContactPickState {
  const nav = getNavigator();
  const hasApi =
    isClient() && typeof (nav as any)?.contacts?.select === "function";
  const [contacts, setContacts] = createSignal<PickedContact[]>([]);
  const [error, setError] = createSignal<Error | null>(null);

  const pick = async (
    options: { multiple?: boolean } = {},
  ): Promise<PickedContact[]> => {
    if (!hasApi) {
      throw new Error("Contact Picker API is not supported.");
    }
    setError(null);
    try {
      const selected = (await (nav as any).contacts.select(
        ["name", "tel", "email"],
        { multiple: options.multiple ?? false },
      )) as Array<{
        name?: string[];
        tel?: string[];
        email?: string[];
      }>;
      const normalized: PickedContact[] = (selected ?? []).map((c) => ({
        name: c.name ?? [],
        tel: c.tel ?? [],
        email: c.email ?? [],
      }));
      setContacts(normalized);
      return normalized;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  };

  return { supported: hasApi, contacts, error, pick };
}

export interface OTPState {
  supported: boolean;
  code: () => string | null;
  error: () => Error | null;
  wait: (options?: { transport?: string[] }) => Promise<string | null>;
  abort: () => void;
}

/**
 * createOTP
 *
 * WebOTP API: reads a one-time code from an incoming SMS without leaving the
 * page. `wait()` resolves with the code (or null when aborted). Works only on
 * secure origins where the SMS matches the site's origin-bound format.
 */
export function createOTP(): OTPState {
  const nav = getNavigator();
  const hasApi =
    isClient() && typeof (nav as any)?.credentials?.get === "function";
  const [code, setCode] = createSignal<string | null>(null);
  const [error, setError] = createSignal<Error | null>(null);
  let controller: AbortController | null = null;

  const abort = (): void => {
    controller?.abort();
    controller = null;
  };

  const wait = async (
    options: { transport?: string[] } = {},
  ): Promise<string | null> => {
    if (!hasApi) {
      throw new Error("WebOTP API is not supported.");
    }
    abort();
    setError(null);
    controller = new AbortController();
    const current = controller;
    try {
      const credential = (await (nav as any).credentials.get({
        otp: { transport: options.transport ?? ["sms"] },
        signal: current.signal,
      } as CredentialRequestOptions)) as { code?: string } | null;
      const value = credential?.code ?? null;
      setCode(value);
      return value;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return null;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      if (controller === current) controller = null;
    }
  };

  onCleanup(abort);

  return { supported: hasApi, code, error, wait, abort };
}

export interface ShareState {
  supported: boolean;
  canShare: (data: ShareData) => boolean;
  error: () => Error | null;
  share: (data: ShareData) => Promise<void>;
}

/**
 * createShare
 *
 * Web Share API: opens the native share sheet. `share()` resolves when the
 * user completes or dismisses the sheet (dismissal is not an error).
 */
export function createShare(): ShareState {
  const nav = getNavigator();
  const hasApi = isClient() && typeof (nav as any)?.share === "function";
  const [error, setError] = createSignal<Error | null>(null);

  const canShare = (data: ShareData): boolean => {
    const canShareFn = (nav as any)?.canShare as
      | ((data: ShareData) => boolean)
      | undefined;
    if (typeof canShareFn === "function") {
      try {
        return canShareFn.call(nav, data);
      } catch {
        return false;
      }
    }
    return hasApi;
  };

  const share = async (data: ShareData): Promise<void> => {
    if (!hasApi) {
      throw new Error("Web Share API is not supported.");
    }
    setError(null);
    try {
      await (nav as any).share.call(nav, data);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  };

  return { supported: hasApi, canShare, error, share };
}

export interface NFCRecord {
  recordType: string;
  mediaType?: string;
  text?: string;
  url?: string;
}

export interface NFCMessage {
  records: NFCRecord[];
  serialNumber: string;
}

export interface NFCState {
  supported: boolean;
  scanning: () => boolean;
  message: () => NFCMessage | null;
  error: () => Error | null;
  scan: () => Promise<void>;
  write: (content: string | { records: Array<Record<string, unknown>> }) => Promise<void>;
  abort: () => void;
}

function decodeNFCRecord(record: {
  recordType: string;
  mediaType?: string;
  data?: DataView | null;
}): NFCRecord {
  const out: NFCRecord = { recordType: record.recordType };
  if (record.mediaType) out.mediaType = record.mediaType;
  if (!record.data) return out;
  const bytes = new Uint8Array(
    record.data.buffer,
    record.data.byteOffset,
    record.data.byteLength,
  );
  if (record.recordType === "text" && bytes.length > 1) {
    const status = bytes[0]!;
    const utf16 = (status & 0x80) !== 0;
    const langLength = status & 0x3f;
    const textBytes = bytes.slice(1 + langLength);
    out.text = new TextDecoder(utf16 ? "utf-16" : "utf-8").decode(textBytes);
  } else if (record.recordType === "url") {
    out.url = new TextDecoder().decode(bytes);
  }
  return out;
}

/**
 * createNFC
 *
 * Web NFC (Chrome on Android, secure context): scan tags with `scan()` and
 * read decoded records from `message`; write text or records with `write()`.
 * Scanning needs a user gesture.
 */
export function createNFC(): NFCState {
  const readerCtor = g["NDEFReader"] as
    | (new () => {
        scan: (options?: { signal?: AbortSignal }) => Promise<void>;
        write: (
          content: unknown,
          options?: { signal?: AbortSignal },
        ) => Promise<void>;
        onreading: ((event: { message: unknown; serialNumber: string }) => void) | null;
        onreadingerror: (() => void) | null;
      })
    | undefined;
  const supported = isClient() && typeof readerCtor === "function";
  const [scanning, setScanning] = createSignal(false);
  const [message, setMessage] = createSignal<NFCMessage | null>(null);
  const [error, setError] = createSignal<Error | null>(null);
  let controller: AbortController | null = null;

  const abort = (): void => {
    controller?.abort();
    controller = null;
    setScanning(false);
  };

  const scan = async (): Promise<void> => {
    if (!supported || !readerCtor) {
      throw new Error("Web NFC is not supported.");
    }
    abort();
    setError(null);
    const reader = new readerCtor();
    controller = new AbortController();
    const current = controller;
    reader.onreading = (event) => {
      const raw = event.message as {
        records?: Array<{
          recordType: string;
          mediaType?: string;
          data?: DataView | null;
        }>;
      };
      setMessage({
        records: (raw.records ?? []).map(decodeNFCRecord),
        serialNumber: event.serialNumber ?? "",
      });
    };
    reader.onreadingerror = () => {
      const err = new Error("Could not read the NFC tag. Try another one.");
      setError(err);
    };
    try {
      setScanning(true);
      await reader.scan({ signal: current.signal });
    } catch (e) {
      setScanning(false);
      if (controller === current) controller = null;
      if ((e as Error)?.name === "AbortError") return;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  };

  const write = async (
    content: string | { records: Array<Record<string, unknown>> },
  ): Promise<void> => {
    if (!supported || !readerCtor) {
      throw new Error("Web NFC is not supported.");
    }
    setError(null);
    const reader = new readerCtor();
    try {
      await reader.write(content);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  };

  onCleanup(abort);

  return { supported, scanning, message, error, scan, write, abort };
}

export interface TorchState {
  supported: () => boolean;
  on: () => boolean;
  error: () => Error | null;
  attach: (input: MediaStreamTrack | MediaStream) => void;
  set: (value: boolean) => Promise<void>;
  toggle: () => Promise<void>;
}

/**
 * createTorch
 *
 * Camera flashlight for devices that expose the `torch` capability.
 * Attach a video track (or stream) from `getUserMedia`, then `set()` or
 * `toggle()` the flashlight.
 */
export function createTorch(): TorchState {
  const [supported, setSupported] = createSignal(false);
  const [on, setOn] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let track: MediaStreamTrack | null = null;

  const attach = (input: MediaStreamTrack | MediaStream): void => {
    const next =
      typeof (input as MediaStream).getVideoTracks === "function"
        ? (input as MediaStream).getVideoTracks()[0] ?? null
        : (input as MediaStreamTrack);
    track = next;
    const capabilities = (next?.getCapabilities?.() ?? {}) as {
      torch?: boolean;
    };
    setSupported(!!capabilities.torch);
    setError(null);
  };

  const set = async (value: boolean): Promise<void> => {
    if (!track) {
      throw new Error("No camera track attached. Call attach() first.");
    }
    setError(null);
    try {
      await track.applyConstraints({ advanced: [{ torch: value }] } as unknown as MediaTrackConstraints);
      setOn(value);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  };

  const toggle = async (): Promise<void> => {
    await set(!on());
  };

  return { supported, on, error, attach, set, toggle };
}

export interface GyroState {
  supported: boolean;
  needsPermission: boolean;
  alpha: () => number | null;
  beta: () => number | null;
  gamma: () => number | null;
  absolute: () => boolean;
  listening: () => boolean;
  error: () => Error | null;
  requestPermission: () => Promise<"granted" | "denied">;
  start: () => Promise<void>;
  stop: () => void;
}

async function requestDevicePermission(
  ctor: unknown,
): Promise<"granted" | "denied"> {
  const request = (ctor as { requestPermission?: () => Promise<string> })
    ?.requestPermission;
  if (typeof request !== "function") return "granted";
  try {
    return (await request.call(ctor)) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/**
 * createGyro
 *
 * Device orientation (alpha/beta/gamma in degrees). On iOS the motion
 * permission prompt must come from a user gesture: call `requestPermission()`
 * from a tap handler, then `start()`.
 */
export function createGyro(): GyroState {
  const ctor = g["DeviceOrientationEvent"] as unknown;
  const supported = isClient() && typeof ctor !== "undefined";
  const needsPermission =
    typeof (ctor as { requestPermission?: unknown })?.requestPermission ===
    "function";
  const [alpha, setAlpha] = createSignal<number | null>(null);
  const [beta, setBeta] = createSignal<number | null>(null);
  const [gamma, setGamma] = createSignal<number | null>(null);
  const [absolute, setAbsolute] = createSignal(false);
  const [listening, setListening] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let detach: (() => void) | null = null;

  const requestPermission = (): Promise<"granted" | "denied"> =>
    requestDevicePermission(ctor);

  const start = async (): Promise<void> => {
    if (!supported) {
      throw new Error("Device orientation is not supported.");
    }
    if (listening()) return;
    setError(null);
    const verdict = await requestDevicePermission(ctor);
    if (verdict !== "granted") {
      const err = new Error("Motion permission was denied.");
      setError(err);
      throw err;
    }
    const handler = (event: Event) => {
      const e = event as DeviceOrientationEvent;
      setAlpha(typeof e.alpha === "number" ? e.alpha : null);
      setBeta(typeof e.beta === "number" ? e.beta : null);
      setGamma(typeof e.gamma === "number" ? e.gamma : null);
      setAbsolute(!!e.absolute);
    };
    detach = onGlobalEvent("deviceorientation", handler);
    setListening(true);
  };

  const stop = (): void => {
    detach?.();
    detach = null;
    setListening(false);
  };

  onCleanup(stop);

  return {
    supported,
    needsPermission,
    alpha,
    beta,
    gamma,
    absolute,
    listening,
    error,
    requestPermission,
    start,
    stop,
  };
}

export interface ShakeOptions {
  /** Acceleration delta (m/s^2) that counts as a shake. Default 15. */
  threshold?: number;
  /** Minimum milliseconds between shakes. Default 800. */
  cooldown?: number;
  onShake?: () => void;
}

export interface ShakeState {
  supported: boolean;
  needsPermission: boolean;
  listening: () => boolean;
  shakes: () => number;
  error: () => Error | null;
  requestPermission: () => Promise<"granted" | "denied">;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * createShake
 *
 * Shake-to-undo style detection from `devicemotion`. Counts a shake when the
 * acceleration delta exceeds `threshold`, rate-limited by `cooldown`.
 */
export function createShake(options: ShakeOptions = {}): ShakeState {
  const { threshold = 15, cooldown = 800, onShake } = options;
  const ctor = g["DeviceMotionEvent"] as unknown;
  const supported = isClient() && typeof ctor !== "undefined";
  const needsPermission =
    typeof (ctor as { requestPermission?: unknown })?.requestPermission ===
    "function";
  const [listening, setListening] = createSignal(false);
  const [shakes, setShakes] = createSignal(0);
  const [error, setError] = createSignal<Error | null>(null);
  let detach: (() => void) | null = null;
  let last: { x: number; y: number; z: number } | null = null;
  let lastSample = 0;
  let lastShake = 0;

  const requestPermission = (): Promise<"granted" | "denied"> =>
    requestDevicePermission(ctor);

  const start = async (): Promise<void> => {
    if (!supported) {
      throw new Error("Device motion is not supported.");
    }
    if (listening()) return;
    setError(null);
    const verdict = await requestDevicePermission(ctor);
    if (verdict !== "granted") {
      const err = new Error("Motion permission was denied.");
      setError(err);
      throw err;
    }
    const handler = (event: Event) => {
      const accel = (event as DeviceMotionEvent).accelerationIncludingGravity;
      if (!accel) return;
      const now = Date.now();
      const x = accel.x ?? 0;
      const y = accel.y ?? 0;
      const z = accel.z ?? 0;
      if (last && now - lastSample > 40) {
        const dx = x - last.x;
        const dy = y - last.y;
        const dz = z - last.z;
        const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (delta > threshold && now - lastShake > cooldown) {
          lastShake = now;
          setShakes((n) => n + 1);
          onShake?.();
        }
      }
      last = { x, y, z };
      lastSample = now;
    };
    detach = onGlobalEvent("devicemotion", handler);
    setListening(true);
  };

  const stop = (): void => {
    detach?.();
    detach = null;
    last = null;
    setListening(false);
  };

  onCleanup(stop);

  return {
    supported,
    needsPermission,
    listening,
    shakes,
    error,
    requestPermission,
    start,
    stop,
  };
}

export interface ScanlineOptions {
  /** Milliseconds per sweep. Default 1800. */
  duration?: number;
  /** Sweep pattern. Default "alternate" (ping-pong). */
  direction?: "down" | "up" | "alternate";
}

export interface ScanlineState {
  /** Line position, 0 at the top edge and 1 at the bottom edge. */
  progress: () => number;
  running: () => boolean;
  start: () => void;
  stop: () => void;
}

/**
 * createScanline
 *
 * The animated line of a camera viewfinder (QR/barcode scanning UI). Bind
 * `progress()` to the line position, for example
 * `style={{ top: `${progress() * 100}%` }}`. Runs on the shared clock and
 * freezes mid-frame under reduced motion.
 */
export function createScanline(options: ScanlineOptions = {}): ScanlineState {
  const { duration = 1800, direction = "alternate" } = options;
  const [progress, setProgress] = createSignal(0);
  const [running, setRunning] = createSignal(false);
  let stopClock: (() => void) | null = null;

  const start = (): void => {
    if (running()) return;
    setRunning(true);
    if (prefersReducedMotion() || duration <= 0) {
      setProgress(0.5);
      return;
    }
    let startTime = 0;
    let first = true;
    stopClock = schedule((t) => {
      if (first) {
        startTime = t;
        first = false;
      }
      const phase = ((t - startTime) % duration) / duration;
      let value = phase;
      if (direction === "up") value = 1 - phase;
      else if (direction === "alternate")
        value = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      setProgress(value);
      return true;
    });
  };

  const stop = (): void => {
    stopClock?.();
    stopClock = null;
    setRunning(false);
  };

  onCleanup(stop);

  return { progress, running, start, stop };
}
