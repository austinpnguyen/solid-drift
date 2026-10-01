# Browser

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when wrapping browser and mobile hardware APIs as signals.

### Browser and DOM utilities

```tsx
import {
  createGeolocation,
  createElementSize,
  createEventListener,
  createHotkey,
  createTimeAgo,
  createPermission,
  createScriptLoader,
} from "solid-drift";

const loc = createGeolocation({ watch: true });
// loc.coords()?.latitude, loc.error(), loc.supported, loc.refresh()

const size = createElementSize(() => panelRef);
// size.width(), size.height() via ResizeObserver

createHotkey("cmd+shift+p", () => commandPalette.open());
createEventListener(() => canvasRef, "pointermove", onMove);

const ago = createTimeAgo(() => post.createdAt); // "5 minutes ago"

const camera = createPermission("camera");
// camera.state(): "granted" | "denied" | "prompt" | undefined

const analytics = createScriptLoader("https://example.com/analytics.js");
analytics.load(); // analytics.loaded()
```

- `createGeolocation({ enableHighAccuracy?, timeout?, maximumAge?, immediate?, watch?, navigatorImpl? })`: `{ position, coords, error, supported, refresh }`. Reads once by default; `watch: true` keeps a live `watchPosition` subscription with automatic cleanup. `supported` is false on the server.
- `createElementSize(() => el, { ResizeObserverImpl? })`: `{ width, height }` via ResizeObserver, 0x0 until the first measurement.
- `createEventListener(target | (() => target), type, handler, options?)`: attaches with automatic cleanup; safe with an undefined target.
- `createHotkey(keys, handler, { target?, preventDefault?, enabled? })`: combos like `"ctrl+k"`, `"cmd+shift+p"`, or `"?"` (modifiers: ctrl, cmd/meta, alt/opt, shift). Case-insensitive, multiple combos supported, `enabled` can be a signal.
- `createTimeAgo(() => date, { updateIntervalMs?, locale? })`: reactive `"5 minutes ago"`, `"yesterday"`, `"in 3 hours"` via `Intl.RelativeTimeFormat`; `"just now"` under 5 seconds. Recomputes on an interval on the client only. [Try it](https://austinpnguyen.github.io/solid-drift/#/browser/createTimeAgo)
- `createPermission(name, { immediate?, navigatorImpl? })`: `{ state, supported, query }` around the Permissions API.
- `createScriptLoader(src, { attrs?, documentImpl? })`: `{ loaded, error, status, load }`. Injects the script once per URL (repeat loads resolve immediately) and tracks it reactively. No-op on the server.

### Mobile hardware

```tsx
import { createBattery, createShare, createScanline } from "solid-drift";

const battery = createBattery();
const share = createShare();
const scanline = createScanline({ duration: 1800 });

scanline.start();
// in your scanner viewfinder:
// <div class="line" style={{ top: `${scanline.progress() * 100}%` }} />

<p>Battery: {Math.round(battery.level() * 100)}% {battery.charging() ? "(charging)" : ""}</p>
<button onClick={() => share.share({ title: "solid-drift", url: location.href })}>Share</button>
```

- `createBattery()` wraps `navigator.getBattery()`: `{ supported, charging, level, chargingTime, dischargingTime, error }`. Level is 0..1; times are seconds (`Infinity` when unknown). Listeners detach on cleanup.
- `createNetwork()` tracks `navigator.onLine` plus the Network Information API: `{ online, effectiveType, downlink, rtt, saveData, supported }`. Updates on `online`/`offline` events and the connection `change` event.
- `createWakeLock()` keeps the screen awake: `{ supported, active, error, request, release }`. Re-acquires automatically when the tab becomes visible again if the lock was still wanted.
- `createContactPick()` wraps the Contact Picker API: `{ supported, contacts, error, pick }`. `pick({ multiple })` resolves with normalized `{ name, tel, email }` arrays, or an empty array when the user cancels.
- `createOTP()` wraps the WebOTP API: `{ supported, code, error, wait, abort }`. `wait({ transport })` resolves with the SMS code (or `null` when aborted). Requires a secure origin and an origin-bound SMS format.
- `createShare()` wraps the Web Share API: `{ supported, canShare, error, share }`. `share({ title, text, url, files })` opens the native sheet; user dismissal is not an error.
- `createNFC()` wraps Web NFC (Chrome on Android, secure context, needs a user gesture): `{ supported, scanning, message, error, scan, write, abort }`. Scanned tags land in `message()` with decoded `text`/`url` records plus `serialNumber`; `write()` takes a string or `{ records }`.
- `createTorch()` drives the camera flashlight: `{ supported, on, error, attach, set, toggle }`. `attach(trackOrStream)` checks the `torch` capability, then `set(true/false)` applies it via `applyConstraints`.
- `createGyro()` wraps `deviceorientation`: `{ supported, needsPermission, alpha, beta, gamma, absolute, listening, error, requestPermission, start, stop }`. On iOS, call `requestPermission()` from a tap handler before `start()`; `start()` also requests it if needed.
- `createShake(options?)` detects shake gestures from `devicemotion`: `{ supported, needsPermission, listening, shakes, error, requestPermission, start, stop }`. A shake counts when the acceleration delta exceeds `threshold` (default 15 m/s^2), rate-limited by `cooldown` (default 800ms); `onShake` fires per shake.
- `createScanline(options?)` is the animated line of a QR/barcode viewfinder: `{ progress, running, start, stop }`. `progress()` sweeps 0..1 on the shared clock (`direction: "down" | "up" | "alternate"`); bind it to the line's position. Under reduced motion it freezes mid-frame. Every primitive is SSR-safe: server renders get `supported: false` and safe no-op actions.

## Mobile and PWA notes

### Dismissible bottom sheets

On mobile, bottom sheets are the primary dialog pattern. Combine
`createBottomSheet` (snap points, drag physics) with `createSwipe`
(fast-dismiss) for a native feel. See the [bottom sheet recipe](../recipes.md#bottom-sheet-with-swipe-to-close-on-mobile).

Key points:
- Use `100dvh` for sheet height so it tracks the iOS Safari toolbar.
- `touch-action: pan-x` on the sheet: vertical drags belong to the sheet, horizontal swipes still scroll inner content.
- Always include a visible close button; swipe-to-dismiss alone is not accessible.

### iOS Safari quirks

- **Permissions**: `createGyro` and `createShake` need
  `requestPermission()` called from a user tap on iOS. Call it in the
  same handler that calls `start()`.
- **WebOTP**: requires a secure origin and an origin-bound SMS format.
  Test with a real device; simulators do not receive SMS.
- **getBattery**: not supported on iOS Safari. `createBattery().supported()` is false; degrade gracefully.
- **Wake Lock**: supported on iOS 16.4+. Older versions silently fail; check `supported()`.

### Low-power behavior

When the OS throttles the device (Low Power Mode, battery saver):

- `requestAnimationFrame` may drop to 30fps or pause in background tabs. The shared clock pauses on `visibilitychange` and resumes cleanly.
- Consider reducing particle counts, marquee speeds, or disabling non-essential motion when `createBattery().level()` is low.
- `createNetwork().saveData` indicates the user wants reduced data usage; skip heavy animated assets.

### PWA checklist

- Animations must not block the install prompt or first paint. Defer non-critical entrances until after `onMount`.
- Test on real devices: iOS Safari and Chrome on Android behave differently around viewports, permissions, and throttling.
- See [Accessibility](../accessibility.md) for reduced-motion and live-region guidance that applies doubly on mobile.
