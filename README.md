# solid-drift

Signal-native animation for SolidJS. Animate **values, not elements**: springs and tweens follow your signals, and retargeting mid-flight is seamless by design, with no restarts and no jumps.

Built with AI assistance.

## Install

```bash
npm install solid-drift
```

## Quick start

```tsx
import { createSignal } from "solid-js"
import { createSpring, createTween, drift } from "solid-drift"

function Panel() {
  const [open, setOpen] = createSignal(false)

  // Springs follow the signal with physics, tweens use duration and easing.
  const y = createSpring(() => (open() ? 0 : 24), { stiffness: 170, damping: 26 })
  const opacity = createTween(() => (open() ? 1 : 0), { duration: 250 })

  return (
    <>
      <button onClick={() => setOpen(!open())}>toggle</button>
      <div use:drift={{ y, opacity }}>slides and fades</div>
    </>
  )
}
```

## API

### `createSpring(source, options?)`

Returns a signal that follows `source` with spring physics. Changing the source mid-flight bends the spring toward the new target, keeping its velocity.

| Option      | Default | Description                          |
| ----------- | ------- | ------------------------------------ |
| `stiffness` | `170`   | Spring stiffness                     |
| `damping`   | `26`    | Damping coefficient                   |
| `mass`      | `1`     | Mass                                  |
| `precision` | `0.01`  | Rest threshold for value and velocity |
| `onRest`    | none    | Called once the spring settles        |

### `createTween(source, options?)`

Returns a signal that tweens toward `source` over a fixed duration. Interrupting retargets from the current value.

| Option       | Default          | Description                    |
| ------------ | ---------------- | ------------------------------ |
| `duration`   | `300`            | Duration in milliseconds       |
| `delay`      | `0`              | Delay before starting (ms)     |
| `easing`     | `"easeOutCubic"` | Easing function or name        |
| `onComplete` | none             | Called when the tween finishes |

### `animate(from, to, options?)`

Imperative one-shot animation. Returns `{ stop, finished }`.

```ts
const ctl = animate(0, 1, {
  duration: 500,
  easing: "easeOutExpo",
  onUpdate: (v) => (el.style.opacity = String(v)),
})
await ctl.finished // or ctl.stop()
```

### `drift` directive

Binds animated values directly to an element's style. Each prop accepts a plain number or any signal.

```tsx
<div use:drift={{ x, y, opacity, scale, scaleX, scaleY, rotate }} />
```

`x`/`y` map to `translate3d` px, `rotate` to degrees.

### `createHorizontalScroll(options)`

Pins a tall section and slides a wide track through it as the user scrolls vertically: the classic horizontal-scroll storytelling chapter. The pinning itself is plain CSS (`position: sticky` on the stage), so this primitive never hijacks scrolling. It only translates the track with `translate3d`, smoothed by a spring that retargets seamlessly mid-scroll. Touch stays native: vertical swipes scroll the page, so keep `touch-action: pan-y` on the stage in your CSS.

Complete example (copy, paste, adjust the chapters):

```tsx
import { createHorizontalScroll } from "solid-drift"

function Story() {
  let pin!: HTMLElement
  let track!: HTMLElement
  const { progress } = createHorizontalScroll({
    pin: () => pin,
    track: () => track,
    stiffness: 120,
    damping: 20,
    onProgress: (p) => console.log("chapter progress:", p),
  })
  return (
    <section ref={pin} style={{ height: "300vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          "touch-action": "pan-y",
        }}
      >
        <div
          ref={track}
          style={{ display: "flex", width: "max-content", height: "100%" }}
        >
          <article style={{ width: "100vw" }}>Chapter one</article>
          <article style={{ width: "100vw" }}>Chapter two</article>
          <article style={{ width: "100vw" }}>Chapter three</article>
        </div>
      </div>
    </section>
  )
}
```

The stage (the sticky element) defaults to the track's parent, so you only need `pin` and `track` refs in the common layout above.

| Option       | Default                                     | Description                                                        |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| `pin`        | (required)                                  | Tall wrapper. Its height beyond one viewport is the scroll range   |
| `track`      | (required)                                  | Wide track translated horizontally                                 |
| `stage`      | track's parent                              | Sticky viewport showing one screenful at a time                    |
| `distance`   | `track.scrollWidth - stage.clientWidth`     | Horizontal travel in px. Number, or a function re-evaluated on resize |
| `start`      | `0`                                         | Fraction of the scroll range where the slide begins                |
| `end`        | `1`                                         | Fraction of the scroll range where the slide ends                  |
| `stiffness`  | `120`                                       | Spring stiffness smoothing scroll into motion                      |
| `damping`    | `20`                                        | Spring damping for the smoothing                                   |
| `onProgress` | none                                        | Called with the smoothed progress (0 to 1) on every update         |

Returns `{ progress, distance, refresh }`:

- `progress` is a signal from 0 to 1 following the smoothed slide. Drive per-panel parallax or a chapter indicator from it.
- `distance` is a signal with the current travel in pixels.
- `refresh()` re-measures the distance and recomputes progress immediately. The primitive already re-measures on resize via `ResizeObserver` and recomputes on scroll (rAF-throttled, passive listeners). Call `refresh()` yourself after layout shifts it cannot see, like webfont loads.

Reduced motion is a first-class path. When the user prefers reduced motion, the stage unpins (the tall section scrolls as a normal page), the track renders as a plain vertical stack of panels, nothing slides, and `progress` still reports 0 to 1 through the section so indicators keep working. Flipping the OS preference mid-session applies live. SSR-safe: constant `0` accessors on the server.

### `createScrub(progress, keyframes, options?)`

Maps a 0-to-1 progress signal through an array of keyframes and returns the interpolated value as a signal. This is the scroll-choreography primitive: pair it with `createScrollProgress` and any numeric style becomes a scrubbed sequence. Parallax is the two-keyframe case, longer lists build full scenes (fade in, hold, fade out) driven by one scroll.

```tsx
import { createScrollProgress, createScrub } from "solid-drift"

const progress = createScrollProgress(() => section)

// Parallax: the background drifts against the scroll
const y = createScrub(progress, [
  { at: 0, value: 60 },
  { at: 1, value: -60 },
])

// Choreography: fade in, hold, fade out
const opacity = createScrub(progress, [
  { at: 0, value: 0 },
  { at: 0.3, value: 1, easing: "easeOutCubic" },
  { at: 0.7, value: 1 },
  { at: 1, value: 0 },
])
```

Each keyframe is `{ at, value, easing? }`: `at` is the progress position from 0 to 1, `value` is the value there, and `easing` shapes the segment that ends at that keyframe (CSS keyframe convention). Keyframes sort themselves by `at`, progress outside the range clamps to the end values, and segments default to linear so motion tracks scroll 1:1 unless you ask for shaping. Pure computation with no listeners, so it is SSR-safe by construction. Under reduced motion it holds the final keyframe value.

| Option   | Default    | Description                              |
| -------- | ---------- | ---------------------------------------- |
| `easing` | `"linear"` | Fallback easing for segments without one |

### `createVelocity(source?, options?)`

A signal tracking how fast another signal changes, in units per second, smoothed with an exponential moving average. With no source it measures page scroll in pixels per second. It spikes while the user flings the page and coasts back to exactly 0 when motion stops, which makes it ideal for velocity-driven skew, stretch, or blur that intensifies with speed. The measurement loop runs only while the value is live.

```tsx
import { createVelocity } from "solid-drift"

// Skew a list while scrolling fast, relax when scrolling stops
const velocity = createVelocity()
const skew = () => Math.max(-8, Math.min(8, velocity() / 120))
<ul style={{ transform: `skewY(${skew()}deg)` }}>...</ul>

// Velocity of any signal, in its own units per second
const [n, setN] = createSignal(0)
const speed = createVelocity(n, { smoothing: 0.7 })
```

| Option        | Default | Description                                              |
| ------------- | ------- | -------------------------------------------------------- |
| `smoothing`   | `0.8`   | Exponential smoothing, 0 to 1. Higher rides smoother     |
| `scale`       | `1`     | Multiplier applied to the raw units per second           |
| `settleAfter` | `0.12`  | Seconds of stillness before the velocity parks at 0      |

SSR-safe and reduced-motion safe: both return a constant `0` accessor.

### `createMagnetic(ref, options?)`

Magnetic attraction toward the pointer. When the pointer comes within `radius` of the element's center, the element is pulled toward it with a strength that fades with distance. When the pointer leaves, the element springs back to rest. The pull itself is a spring, so arrivals and releases glide instead of snapping. Built on `pointermove`, so touch drags work the same as mouse hovers.

```tsx
import { createMagnetic } from "solid-drift"

let btn!: HTMLButtonElement
const { x, y } = createMagnetic(() => btn, { strength: 0.4 })
<button ref={btn} style={{ transform: `translate(${x()}px, ${y()}px)` }}>
  Pull me
</button>
```

| Option     | Default | Description                                              |
| ---------- | ------- | -------------------------------------------------------- |
| `radius`   | `140`   | Attraction radius in px around the element's center      |
| `strength` | `0.35`  | Pull strength at the center, 0 to 1                       |
| `spring`   | default | Spring physics for the pull and the release              |

Returns `{ x, y }`: spring-smoothed pull offsets in pixels. SSR-safe and reduced-motion safe: both return constant `0` accessors.

### `createTilt(ref, options?)`

3D tilt that follows the pointer across an element. The pointer's position over the element maps to `rotateX`/`rotateY` in degrees, spring-smoothed so the card leans with weight instead of jittering. When the pointer leaves, the element settles back to flat. Pair with a CSS `perspective` on the parent for real depth. Touch drags tilt while touching, release settles back to flat.

```tsx
import { createTilt } from "solid-drift"

let card!: HTMLDivElement
const { rotateX, rotateY } = createTilt(() => card, { maxAngle: 12 })
<div style={{ perspective: "800px" }}>
  <div
    ref={card}
    style={{ transform: `rotateX(${rotateX()}deg) rotateY(${rotateY()}deg)` }}
  />
</div>
```

| Option     | Default | Description                                   |
| ---------- | ------- | --------------------------------------------- |
| `maxAngle` | `10`    | Maximum tilt in degrees at the element's edge |
| `spring`   | default | Spring physics for the tilt and the settle    |

Returns `{ rotateX, rotateY }`: spring-smoothed tilt in degrees. SSR-safe and reduced-motion safe: both return constant `0` accessors.

### `createTrail(source, options?)`

A signal that replays another signal's past: it returns the value the source had `delay` milliseconds ago, interpolated between samples. Chain trails off one source for follower effects (a cursor with a comet tail, cascading highlights), or trail a scroll progress for a delayed echo of the page. The trail catches up and parks exactly on the latest value when the source rests. The follow loop runs only while the trail is behind.

```tsx
import { createTrail } from "solid-drift"

const [tab, setTab] = createSignal(0)
// The indicator glides behind the selection instead of jumping
const ghost = createTrail(tab, { delay: 150 })
```

| Option  | Default | Description                                   |
| ------- | ------- | --------------------------------------------- |
| `delay` | `120`   | How far behind the source the trail follows, in ms |

SSR-safe: returns the source itself on the server. Under reduced motion it also returns the source directly, with no trailing motion. A `delay` of 0 returns the source itself.

### `createTimeline(steps)`

Plays a sequence of one-shot animations back to back. Each step is an `animate()` call: `from`/`to` plus duration, delay, easing, and `onUpdate`. Steps run strictly in order, so one step's `onUpdate` can drive one element while the next step drives another, building choreographed entrances without nested callbacks.

```ts
import { createTimeline } from "solid-drift"

const intro = createTimeline([
  { from: 0, to: 1, duration: 400, onUpdate: (v) => (title.style.opacity = String(v)) },
  { from: 24, to: 0, duration: 500, easing: "easeOutExpo", onUpdate: (v) => (title.style.transform = `translateY(${v}px)`) },
  { from: 0, to: 1, duration: 300, onUpdate: (v) => (cta.style.opacity = String(v)) },
])
await intro.start()
```

Returns `{ start, stop, replay, status }`:

- `start()` plays every step in order and resolves when the last step completes.
- `stop()` halts mid-step and resolves the in-flight `start()` promise.
- `replay()` stops and plays again from the first step.
- `status` is a reactive `"idle" | "running" | "done"` signal.

Under reduced motion every step jumps straight to its end value (each step's `onUpdate(to)` still runs, so the final state is always correct). SSR-safe: steps apply their end values instantly.

### `animateFlip(ref, mutate, options?)`

FLIP layout animation around a DOM mutation. It records the element's position and size (First), runs your `mutate()` which changes the layout (Last), then Inverts the delta as a transform and Plays it back to identity. List reorders, expanding panels, and grid reshuffles glide to their new spots instead of jumping. The element's pre-existing `transform` is captured and restored after the animation, so FLIP composes with other transform animations.

```ts
import { animateFlip } from "solid-drift"

const [items, setItems] = createSignal(["a", "b", "c"])
let list!: HTMLUListElement

const shuffle = () =>
  animateFlip(
    () => list,
    () => setItems((prev) => [...prev].reverse()),
    { duration: 450 }
  )
```

| Option     | Default          | Description                                                        |
| ---------- | ---------------- | ------------------------------------------------------------------ |
| `duration` | `400`            | Duration in milliseconds                                           |
| `delay`    | `0`              | Delay before starting, in milliseconds                            |
| `easing`   | `"easeOutCubic"` | Easing function or name                                            |
| `scale`    | `true`           | Also animate the size delta as scale, so growing or shrinking elements morph instead of just sliding |

Returns `{ stop, finished }`: `stop()` halts mid-flight and restores the original transform. SSR-safe and reduced-motion safe: the mutation runs with no animation. If the element does not move, no animation runs either.

### `springPresets`

Named spring configurations for common feels. Spread into `createSpring`, `createMagnetic`, or `createTilt` options.

```ts
import { createSpring, springPresets } from "solid-drift"

const x = createSpring(target, { ...springPresets.wobbly })
```

| Preset      | Feel                                              |
| ----------- | ------------------------------------------------- |
| `gentle`    | Soft and calm, default-like, a touch slower       |
| `default`   | The library default balance                       |
| `snappy`    | Tight and responsive, for UI that must keep up    |
| `wobbly`    | Loose and playful, with a visible overshoot       |
| `molasses`  | Heavy and deliberate, like moving through syrup   |

### Easings

Named easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeOutExpo`, `easeOutBack`, plus `cubicBezier(x1, y1, x2, y2)` for CSS-style curves. Pass a name or a custom `(t) => number` function anywhere an easing is accepted.

## How it works

One shared `requestAnimationFrame` loop drives every animation in the app, so hundreds of springs cost a single rAF tick per frame. Springs integrate with semi-implicit Euler, tweens sample an easing curve. Everything is SSR-safe (animations simply don't run on the server).

## License

MIT © Austin Nguyen
