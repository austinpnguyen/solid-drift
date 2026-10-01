import { createSignal, onCleanup, type Accessor } from "solid-js";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DATA_QUERY = "(prefers-reduced-data: reduce)";

export interface LowPowerOptions {
  /** deviceMemory in GB at or below which the device counts as low-end. Default 4. */
  maxDeviceMemory?: number;
  /** hardwareConcurrency at or below which the device counts as low-end. Default 4. */
  maxHardwareConcurrency?: number;
}

function mediaMatches(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

function isLowEndDevice(options: LowPowerOptions): boolean {
  if (typeof navigator === "undefined") return false;
  const { maxDeviceMemory = 4, maxHardwareConcurrency = 4 } = options;
  const memory =
    typeof (navigator as Navigator & { deviceMemory?: unknown }).deviceMemory ===
    "number"
      ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory as number)
      : Infinity;
  const cores =
    typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : Infinity;
  return memory <= maxDeviceMemory || cores <= maxHardwareConcurrency;
}

function checkLowPower(options: LowPowerOptions): boolean {
  return (
    mediaMatches(MOTION_QUERY) ||
    mediaMatches(DATA_QUERY) ||
    isLowEndDevice(options)
  );
}

/**
 * Non-reactive check: should the app conserve power and motion right now?
 *
 * True when any of these hold: the OS prefers reduced motion, the user
 * asked to reduce data usage, or the device looks low-end (small
 * deviceMemory or few CPU cores, both Chrome-only signals that degrade
 * to "not low-end" where unsupported).
 *
 * SSR-safe: always `false` on the server. Pair with the reduced-motion
 * behavior of the primitives: when this is true, prefer shorter or
 * zero durations and skip decorative motion.
 *
 * ```ts
 * if (isLowPowerMode()) {
 *   // skip the ambient background animation
 * }
 * ```
 */
export function isLowPowerMode(options: LowPowerOptions = {}): boolean {
  return checkLowPower(options);
}

/**
 * Reactive low-power signal for mobile-first degradation.
 *
 * Combines `prefers-reduced-motion`, `prefers-reduced-data`, and low-end
 * device signals into one accessor. The media queries update live if the
 * OS preference changes while the app is running; the device signals are
 * sampled once. SSR-safe: `false` on the server.
 *
 * ```tsx
 * import { isLowPowerMode, createLowPowerMode } from "solid-drift"
 *
 * const lowPower = createLowPowerMode()
 * // Degrade gracefully: shorter, cheaper motion on weak devices.
 * const duration = () => (lowPower() ? 0 : 400)
 * const confettiCount = () => (lowPower() ? 20 : 150)
 * ```
 */
export function createLowPowerMode(
  options: LowPowerOptions = {},
): Accessor<boolean> {
  const lowEnd = isLowEndDevice(options);
  const [lowPower, setLowPower] = createSignal(checkLowPower(options));

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    const motionMq = window.matchMedia(MOTION_QUERY);
    const dataMq = window.matchMedia(DATA_QUERY);
    const onChange = (): void => {
      setLowPower(lowEnd || motionMq.matches || dataMq.matches);
    };
    motionMq.addEventListener("change", onChange);
    dataMq.addEventListener("change", onChange);
    onCleanup(() => {
      motionMq.removeEventListener("change", onChange);
      dataMq.removeEventListener("change", onChange);
    });
  }

  return lowPower;
}

/**
 * @deprecated Use {@link createLowPowerMode} instead. This alias will be
 * removed in v1.0.
 */
export const useLowPowerMode = createLowPowerMode;
