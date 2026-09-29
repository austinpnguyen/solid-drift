# Utilities

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when you need everyday app glue: DOM helpers, haptics, storage, gesture state.

### DOM utilities

Everyday DOM glue, signal-native: debounced and throttled signal transforms, a persisted signal, a live media query, outside-press dismissal, body scroll locking, and infinite scroll. All SSR-safe.

```tsx
import {
  createDebounced,
  createThrottled,
  createLocalStorage,
  createMediaQuery,
  createClickOutside,
  createScrollLock,
  createInfiniteScroll,
} from "solid-drift"

// Debounced search: the query waits for a 300ms pause before firing.
const [query, setQuery] = createSignal("")
const debounced = createDebounced(query, 300)
createEffect(() => { if (debounced()) search(debounced()) })

// Throttled scroll position: at most one update per 100ms.
const throttledY = createThrottled(scrollY, 100)

// Persisted theme, synced across tabs.
const theme = createLocalStorage<"light" | "dark">("theme", "light")
theme.set("dark")

// Live media query.
const wide = createMediaQuery("(min-width: 1024px)")

// Dismiss a menu on outside press.
let menu!: HTMLDivElement
createClickOutside(() => menu, () => setOpen(false))

// Lock body scroll while a modal is open (nested locks stack).
const scroll = createScrollLock()
createEffect(() => { modalOpen() ? scroll.lock() : scroll.unlock() })

// Infinite scroll: prefetch as the sentinel approaches.
let sentinel!: HTMLDivElement
createInfiniteScroll(() => sentinel, {
  onLoadMore: () => loadPage(),
  disabled: () => !hasMore(),
})
<div ref={sentinel} />
```

- `createDebounced(source, delay)` returns an `Accessor<T>` that follows the source after it stops changing for `delay` ms (trailing edge).
- `createThrottled(source, interval)` returns an `Accessor<T>` that updates at most once per `interval` ms: leading change applies immediately, the rest collapse into one trailing update.
- `createLocalStorage<T>(key, initialValue, options?)` returns `{ value, set, remove }`: reads the stored value on creation (falling back on missing or corrupt JSON), writes through on every set, and stays in sync across tabs via the `storage` event (`sync: true` default). Custom `serialize`/`deserialize` supported. Behaves like a plain signal where storage is unavailable.
- `createMediaQuery(query)` returns an `Accessor<boolean>` that tracks the query live (`false` on the server).
- `createClickOutside(ref, handler, options?)` calls `handler` on `pointerdown` (default, configurable via `events`) outside the element. Shadow-DOM aware via `composedPath`. No-op on the server.
- `createScrollLock()` returns `{ locked, lock, unlock }`: sets `document.body.style.overflow = "hidden"`, restores the previous value when the last lock releases, and reference-counts nested locks so stacked modals cannot unlock each other early. Unmounting releases the locks.
- `createInfiniteScroll(ref, options)` observes a sentinel with IntersectionObserver and calls `onLoadMore` as it approaches the viewport (`threshold` px prefetch via `rootMargin`, default `200`). `disabled` is a reactive kill switch (e.g. `() => !hasMore()`).

### Haptics

Tactile feedback through the Vibration API: `createHaptic` wraps `navigator.vibrate` with an iOS-style vocabulary (light/medium/heavy, success/warning/error), one-shot presets, and morse-code encoding; `createHapticBeat` is a 16-step haptic sequencer (heartbeat pulses, metronome ticks, breathing guides) running on the shared animation clock.

```tsx
import { createHaptic, createHapticBeat, hapticBeatPresets } from "solid-drift"

const haptic = createHaptic()
// Buttons get a physical click:
<button onClick={() => { haptic.light(); confirm() }}>Confirm</button>
// Morse code: dots, dashes, letter gaps, word gaps.
<button onClick={() => haptic.morse("... --- ...")}>SOS</button>

// A heartbeat pulse the user can toggle:
const beat = createHapticBeat(haptic, {
  bpm: 60,
  pattern: hapticBeatPresets.heartbeat,
  onStep: (i) => setFlash(i === 0),
})
<button onClick={() => beat.toggle()}>
  {beat.playing() ? "Stop pulse" : "Start pulse"}
</button>
```

- `createHaptic(options?)` returns `{ supported, vibrate, light, medium, heavy, success, warning, error, morse }`. `vibrate(pattern)` fires a raw ms pattern; `morse(code, unit?)` encodes `"."`, `"-"`, `" "` (letter gap), `"/"` (word gap) with a configurable dot length (default 60ms). `hapticPatterns` holds the one-shot presets (`tap`, `doubleTap`, `longPress`, `tick`, `heartbeat`, `success`, `warning`, `error`). `options.enabled` is a boolean or a signal master switch (wire it to `useLowPowerMode()`).
- `createHapticBeat(haptic, options?)` returns `{ playing, bpm, step, start, stop, toggle, setBpm }`. The 16-step pattern uses `"x"` for a hit, `"X"` for an accent, anything else for a rest; steps run as 16th notes at `bpm` (live-changeable via `setBpm`), the downbeat fires immediately on `start()`, and `onStep(i)` reports each step index. `hapticBeatPresets` ships `heartbeat`, `metronome`, `ticks`, and `pulse`.
- Haptics are tactile, not visual, so they fire under reduced motion too; the `enabled` switch is the way to offer quiet. Everything is a no-op where vibration is unsupported, and SSR-safe.

### Bottom sheet

A draggable bottom sheet built on `createDrag`: the user pulls it up by a handle (or the sheet itself) and on release it springs to the nearest snap point, projected forward by the release velocity like a native sheet. Dragging below the lowest snap (or a fast downward flick) dismisses it when `dismissible`.

```tsx
import { createBottomSheet } from "solid-drift"

let sheet!: HTMLDivElement
let handle!: HTMLDivElement
const bs = createBottomSheet(() => handle, {
  snapPoints: [0.4, 1],       // fractions of the sheet's own height
  measureRef: () => sheet,    // measure the sheet, not the handle
  onOpenChange: (open) => setScrimVisible(open),
})

<div
  ref={sheet}
  style={{
    position: "fixed", left: "0", right: "0", bottom: "0",
    transform: `translateY(${bs.y()}px)`,
  }}
>
  <div ref={handle} style={{ "touch-action": "none" }}>Handle</div>
  <div>Sheet content</div>
</div>
<button onClick={() => bs.openSheet()}>Open</button>
```

- `createBottomSheet(ref, options?)` returns `{ open, snapIndex, y, status, openSheet, close, snapTo }`. `y()` is the current translateY in pixels; `status()` is `idle`, `dragging`, or `settling`; `snapIndex()` is the snap-point index or -1 when dismissed.
- `snapPoints` are visible height fractions (`1` fully open); values are clamped to [0, 1] and sorted ascending, an empty array falls back to `[1]`. Default `[0.5, 1]`; `initialSnap` (default the fullest) picks the point `openSheet()` opens at.
- While the pointer is down the sheet tracks 1:1 with light rubber-banding past the fully-open top and the dismissed bottom. On release, the target is the nearest snap to `y + velocity * 0.18`; dismissal happens past the midpoint between the lowest snap and closed, or on a downward flick over 700 px/s. Snap travel uses a spring (`options.spring`, default stiffness 400 / damping 40).
- Bind `ref` to the drag handle when the sheet body scrolls (keeps drag and scroll from fighting), to the sheet root otherwise. The moving element gets `translateY(y())`; the drag target needs `touch-action: none`. Starts dismissed on the server (SSR-safe); under reduced motion it jumps straight to snap targets.

### Optimistic updates

```tsx
import { createOptimistic } from "solid-drift";

const feed = createOptimistic<Bid[], Bid>([], (bids, bid) =>
  bids.some((b) => b.id === bid.id) ? bids : [...bids, bid],
);

// in an event handler:
await feed.commit(bid, (b) => sendBidTx(b)).catch(() => {
  // already rolled back; read feed.error() for a toast
});
```

`createOptimistic(initial, apply)` gives `{ value, setBase, pending, pendingCount, error, commit, reset }`. `commit(update, task)` applies the update instantly, then runs the task; on success the update is promoted into the base truth (no flicker while the server catches up), and on failure it is rolled back, `error()` is set, and the error is rethrown. `setBase()` folds fresh server truth in (after a refetch); write `apply` idempotently, for example upsert by id, so truth that already includes an optimistic update does not duplicate it. `reset()` drops in-flight updates. Pure signals, SSR-safe.

### Skeleton and scroll spy

```tsx
import { createSkeleton, createScrollSpy } from "solid-drift";

const sk = createSkeleton({ delay: 200, minVisible: 400 });
createEffect(() => sk.setLoading(query.loading()));

const spy = createScrollSpy({ targets: ["intro", "api", "faq"], offset: 80 });

<Show when={sk.show()} fallback={<ArticleView />}>
  <div class="skeleton" style={{ "--shine": `${sk.phase() * 100}%` }} />
</Show>
<nav>
  <For each={["intro", "api", "faq"]}>
    {(id) => (
      <a classList={{ active: spy.active() === id }}
         onClick={() => spy.scrollTo(id)}>{id}</a>
    )}
  </For>
</nav>
```

- `createSkeleton(options?)` is a loading-placeholder controller with flicker protection: `{ loading, show, phase, setLoading }`. `show()` flips true only after `delay` ms (default 200), so fast loads never flash a skeleton, and stays true for at least `minVisible` ms once shown. `phase()` sweeps 0..1 on the shared clock while shown for a JS-driven shimmer (bind it to a gradient stop); it freezes under reduced motion. On the server `show()` never flips.
- `createScrollSpy(options)` tracks the deepest section at or above the offset line: `{ active, scrollTo, refresh }`. `targets` is an id list or accessor; `container` defaults to the window (pass an element for a scrollable panel); scroll handling is rAF-throttled on the shared clock; `scrollTo(id)` smooth-scrolls (auto under reduced motion); `onChange` fires only when the active id changes. SSR-safe.

### Copy and countdown

```tsx
import { createCopy, createCountdown } from "solid-drift";

const clipboard = createCopy();
const sale = createCountdown(new Date("2026-12-01T00:00:00"), {
  onDone: () => toast("The sale has ended"),
});

<button onClick={() => clipboard.copy(link())}>
  {clipboard.copied() ? "Copied!" : "Copy link"}
</button>
<p>{sale.days()}d {sale.hours()}h {sale.minutes()}m {sale.seconds()}s</p>
```

- `createCopy(options?)` copies text to the clipboard: `{ copied, error, copy, reset }`. Uses the async Clipboard API with an `execCommand` fallback (`noFallback: true` disables it). `copied()` flips true for `resetDelay` ms (default 2000) for transient "Copied!" feedback. SSR-safe.
- `createCountdown(target, options?)` counts down to a date, timestamp, or accessor: `{ remaining, days, hours, minutes, seconds, done, running, start, stop, reset }`. Wall-clock based (the moment is fixed even if the tab hides); recomputes on the shared clock throttled to `interval` ms (default 1000); stops itself at zero and fires `onDone` once. SSR-safe.

### Marquee, variants, path drawing, press and hover

```tsx
import {
  createMarquee,
  createVariants,
  createPathDraw,
  createPress,
  createHover,
} from "solid-drift";

const marquee = createMarquee({ speed: 80 });
const card = createVariants(
  {
    idle: { scale: 1 },
    hover: { scale: 1.04 },
    press: { scale: 0.96 },
  },
  { initial: "idle", duration: 180 },
);

let strip!: HTMLDivElement;
let btn!: HTMLButtonElement;
let mark!: SVGPathElement;
createEffect(() => marquee.setContentSize(strip.scrollWidth / 2));
createHover(() => btn, { onChange: (h) => card.go(h ? "hover" : "idle") });
createPress(() => btn, { onChange: (p) => card.go(p ? "press" : "idle") });
const draw = createPathDraw(() => mark, { duration: 1600 });
```

- `createMarquee(options?)` infinite scroller: `{ offset, running, setContentSize, start, stop }`. The offset advances at `speed` px/s (`direction` left/right/up/down) on the shared clock and wraps at the content size; render the content twice and translate by `-offset()`. Measure one loop unit and pass it to `setContentSize`. Static under reduced motion; SSR-safe.
- `createVariants(defs, options?)` named animation states: `{ current, values, go }`. `go(name)` tweens numeric props from the current values to the target variant (`duration` ms, easing) and snaps non-numeric props at the end; unknown names are ignored. Snaps instantly under reduced motion; SSR-safe.
- `createPathDraw(ref, options?)` SVG stroke draw-on: `{ progress, running, start, stop, reset }`. Reads the length with `getTotalLength()` and drives `stroke-dashoffset` to 0, eased; `onDone` fires once; resume keeps a constant speed. Renders fully drawn under reduced motion; SSR-safe.
- `createPress(ref, options?)` press gesture state: `{ pressed }`. Pointer down/up/cancel/leave plus Enter/Space keys for keyboard parity; `onChange` fires on change only. State only, no animation; pair with `createVariants`. SSR-safe.
- `createHover(ref, options?)` hover gesture state: `{ hovering }`. Pointer enter/leave plus focus/blur for keyboard parity; `onChange` fires on change only. SSR-safe.

### App utilities

```tsx
import {
  createColorScheme,
  createIdle,
  createOnline,
  createInstallPrompt,
  createUndo,
  createFullscreen,
} from "solid-drift";

const theme = createColorScheme(); // follows the OS, persists, writes html[data-theme]
const { idle } = createIdle({ timeout: 30_000 }); // auto-hide chrome when idle
const { online } = createOnline(); // offline banner
const install = createInstallPrompt(); // PWA install button
const doc = createUndo({ title: "" }); // undoable form state
let stage!: HTMLDivElement;
const fs = createFullscreen(() => stage); // fullscreen toggle
```

- `createColorScheme(options?)`: `{ scheme, preference, setPreference, toggle }`. Resolves `"system"` through the `(prefers-color-scheme: dark)` media query (reactive to OS changes), persists the preference to localStorage (`storageKey`, null disables), and writes the resolved scheme to `<html data-theme="light|dark">` (configurable `attribute`) plus `color-scheme`. SSR-safe (resolves to light on the server).
- `createIdle(options?)`: `{ idle, lastActive, reset }`. `idle()` flips true after `timeout` ms (default 60000) without any of the `events` (default mousemove, mousedown, keydown, touchstart, wheel); activity restarts the timer. SSR-safe.
- `createOnline()`: `{ online }`. Seeds from `navigator.onLine`, follows window `online`/`offline` events. SSR-safe (assumes online).
- `createInstallPrompt()`: `{ canInstall, prompt }`. Captures `beforeinstallprompt` (preventing the browser mini-bar); `prompt()` shows it from a click handler and resolves to the user's choice, or null when unavailable; each captured event is single-use. SSR-safe.
- `createUndo(initial, options?)`: undoable state: `{ value, set, undo, redo, clear, reset, canUndo, canRedo, past, future }`. `set()` (value or updater) records history trimmed to `capacity` (default 50); a new `set()` discards the redo stack. Pure logic, SSR-safe.
- `createFullscreen(ref, options?)`: `{ fullscreen, enter, exit, toggle }`. Tracks `document.fullscreenElement` so Escape and external changes stay in sync; failures go to `onError` instead of throwing. SSR-safe.

### `useLowPowerMode(options?)`

One reactive signal for mobile-first degradation. It combines the OS `prefers-reduced-motion` and `prefers-reduced-data` media queries with low-end device signals (`navigator.deviceMemory`, `navigator.hardwareConcurrency`), so a single check covers user preference, network thrift, and weak hardware. The media queries update live; the device signals are sampled once. There is also a one-shot `isLowPowerMode(options?)` for non-reactive checks.

```tsx
import { useLowPowerMode } from "solid-drift"

const lowPower = useLowPowerMode()
// Degrade gracefully: shorter, cheaper motion on weak devices.
const duration = () => (lowPower() ? 0 : 400)
const confettiCount = () => (lowPower() ? 20 : 150)
```

Options: `maxDeviceMemory` (GB, default `4`), `maxHardwareConcurrency` (default `4`): a device at or below either threshold counts as low-end. Where the device signals are unsupported they degrade to "not low-end". SSR-safe: always `false` on the server.

### `usePrefersReducedMotion()` / `prefersReducedMotion()`

Reduced-motion checks for the `(prefers-reduced-motion: reduce)` media query. `prefersReducedMotion()` is a one-shot boolean (always `false` on the server); `usePrefersReducedMotion()` is a reactive signal that updates live if the OS preference changes. `createSpring`, `createTween`, and `animate` already respect this automatically and jump straight to the target when reduced motion is preferred.

```tsx
import { usePrefersReducedMotion } from "solid-drift";

const reduced = usePrefersReducedMotion();
const duration = () => (reduced() ? 0 : 400);
```
