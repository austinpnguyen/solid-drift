# solid-drift

Signal-native animation for SolidJS. Animate **values, not elements**: springs and tweens follow your signals, and retargeting mid-flight is seamless by design, with no restarts and no jumps.

Built with AI assistance.

## Install

```bash
npm install solid-drift
```

## Quick start

```tsx
import { createSignal } from "solid-js";
import { createSpring, createTween, drift } from "solid-drift";

function Panel() {
  const [open, setOpen] = createSignal(false);

  // Springs follow the signal with physics, tweens use duration and easing.
  const y = createSpring(() => (open() ? 0 : 24), {
    stiffness: 170,
    damping: 26,
  });
  const opacity = createTween(() => (open() ? 1 : 0), { duration: 250 });

  return (
    <>
      <button onClick={() => setOpen(!open())}>toggle</button>
      <div use:drift={{ y, opacity }}>slides and fades</div>
    </>
  );
}
```

## API

### `createSpring(source, options?)`

Returns a signal that follows `source` with spring physics. Changing the source mid-flight bends the spring toward the new target, keeping its velocity.

| Option      | Default | Description                           |
| ----------- | ------- | ------------------------------------- |
| `stiffness` | `170`   | Spring stiffness                      |
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
});
await ctl.finished; // or ctl.stop()
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
import { createHorizontalScroll } from "solid-drift";

function Story() {
  let pin!: HTMLElement;
  let track!: HTMLElement;
  const { progress } = createHorizontalScroll({
    pin: () => pin,
    track: () => track,
    stiffness: 120,
    damping: 20,
    onProgress: (p) => console.log("chapter progress:", p),
  });
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
  );
}
```

The stage (the sticky element) defaults to the track's parent, so you only need `pin` and `track` refs in the common layout above.

| Option       | Default                                 | Description                                                           |
| ------------ | --------------------------------------- | --------------------------------------------------------------------- |
| `pin`        | (required)                              | Tall wrapper. Its height beyond one viewport is the scroll range      |
| `track`      | (required)                              | Wide track translated horizontally                                    |
| `stage`      | track's parent                          | Sticky viewport showing one screenful at a time                       |
| `distance`   | `track.scrollWidth - stage.clientWidth` | Horizontal travel in px. Number, or a function re-evaluated on resize |
| `start`      | `0`                                     | Fraction of the scroll range where the slide begins                   |
| `end`        | `1`                                     | Fraction of the scroll range where the slide ends                     |
| `stiffness`  | `120`                                   | Spring stiffness smoothing scroll into motion                         |
| `damping`    | `20`                                    | Spring damping for the smoothing                                      |
| `onProgress` | none                                    | Called with the smoothed progress (0 to 1) on every update            |

Returns `{ progress, distance, refresh }`:

- `progress` is a signal from 0 to 1 following the smoothed slide. Drive per-panel parallax or a chapter indicator from it.
- `distance` is a signal with the current travel in pixels.
- `refresh()` re-measures the distance and recomputes progress immediately. The primitive already re-measures on resize via `ResizeObserver` and recomputes on scroll (rAF-throttled, passive listeners). Call `refresh()` yourself after layout shifts it cannot see, like webfont loads.

Reduced motion is a first-class path. When the user prefers reduced motion, the stage unpins (the tall section scrolls as a normal page), the track renders as a plain vertical stack of panels, nothing slides, and `progress` still reports 0 to 1 through the section so indicators keep working. Flipping the OS preference mid-session applies live. SSR-safe: constant `0` accessors on the server.

### `createScrub(progress, keyframes, options?)`

Maps a 0-to-1 progress signal through an array of keyframes and returns the interpolated value as a signal. This is the scroll-choreography primitive: pair it with `createScrollProgress` and any numeric style becomes a scrubbed sequence. Parallax is the two-keyframe case, longer lists build full scenes (fade in, hold, fade out) driven by one scroll.

```tsx
import { createScrollProgress, createScrub } from "solid-drift";

const progress = createScrollProgress(() => section);

// Parallax: the background drifts against the scroll
const y = createScrub(progress, [
  { at: 0, value: 60 },
  { at: 1, value: -60 },
]);

// Choreography: fade in, hold, fade out
const opacity = createScrub(progress, [
  { at: 0, value: 0 },
  { at: 0.3, value: 1, easing: "easeOutCubic" },
  { at: 0.7, value: 1 },
  { at: 1, value: 0 },
]);
```

Each keyframe is `{ at, value, easing? }`: `at` is the progress position from 0 to 1, `value` is the value there, and `easing` shapes the segment that ends at that keyframe (CSS keyframe convention). Keyframes sort themselves by `at`, progress outside the range clamps to the end values, and segments default to linear so motion tracks scroll 1:1 unless you ask for shaping. Pure computation with no listeners, so it is SSR-safe by construction. Under reduced motion it holds the final keyframe value.

| Option   | Default    | Description                              |
| -------- | ---------- | ---------------------------------------- |
| `easing` | `"linear"` | Fallback easing for segments without one |

### `createScrollColor(stops, options?)`

Maps a 0-to-1 progress signal through a list of color stops and returns the interpolated color as a string signal. Colors shift as you scroll: a hero tint that warms through a chapter, section backgrounds that deepen, text that cools into a new mood.

Each stop is `{ at, color, easing? }`: `at` is the progress position from 0 to 1, `color` is the color to reach there, and `easing` shapes the segment that ends at that stop (CSS keyframe convention, same as `createScrub`). Colors interpolate in linear light, so the midpoint between red and blue is the vivid purple your eyes expect, not the muddy `#800080` from naive channel math. Alpha channels interpolate too. Stops sort themselves by `at` and progress outside the range clamps to the end colors.

Accepted inputs: hex (`#rgb`, `#rrggbb`, with optional alpha), `rgb()`/`rgba()`, `hsl()`/`hsla()` (comma and space syntax), and the 148 CSS named colors.

```tsx
import { createScrollProgress, createScrollColor } from "solid-drift";

const progress = createScrollProgress();

// The hero tint warms as you scroll through the first chapter.
const tint = createScrollColor(
  [
    { at: 0, color: "#f4f6f9" },
    { at: 0.5, color: "#f7e8d0" },
    { at: 1, color: "#2b5176", easing: "easeInOutQuad" },
  ],
  { progress },
);

<section style={{ "background-color": tint() }} />;
```

| Option     | Default                | Description                                            |
| ---------- | ---------------------- | ------------------------------------------------------ |
| `progress` | whole-page scroll      | Progress signal, 0 to 1 (pass `createScrollProgress(() => section)` for element-scoped color) |
| `easing`   | `"linear"`             | Fallback easing for segments without one              |
| `format`   | `"hex"`                | Output format: `"hex"`, `"rgb"`, or `"hsl"`            |

Pure computation with no listeners, so it is SSR-safe by construction. Under reduced motion it holds the final stop's color.

### `createScrollTracking(options?)`

Drives `letter-spacing` from a 0-to-1 progress signal: display words that spread apart or tighten together as you scroll. Returns a string signal like `"0.15em"` or `"6px"`, ready to drop into a style binding.

```tsx
import { createScrollProgress, createScrollTracking } from "solid-drift";

const progress = createScrollProgress(() => chapter);

// A chapter title that tightens as it arrives.
const tracking = createScrollTracking({
  progress,
  from: 0.35,
  to: 0,
  unit: "em",
  easing: "easeOutCubic",
});

<h2 style={{ "letter-spacing": tracking() }}>Chapter One</h2>;
```

| Option     | Default           | Description                                            |
| ---------- | ----------------- | ------------------------------------------------------ |
| `progress` | whole-page scroll | Progress signal, 0 to 1                                |
| `from`     | `0.3`             | Letter-spacing at progress 0                           |
| `to`       | `0`               | Letter-spacing at progress 1                           |
| `unit`     | `"em"`            | Unit for the returned value: `"em"` or `"px"`          |
| `easing`   | `"linear"`        | Easing applied to the progress before mapping          |

SSR-safe (returns the `from` value on the server). Under reduced motion it holds the `to` value, the settled readable end state.

### `createScrollLine(options?)`

Drives a divider/rule reveal from a 0-to-1 progress signal: a chapter line that draws itself as you scroll. It uses scale (not width/height) so the reveal stays on the compositor. Returns a signal holding `{ transform, transformOrigin }`, ready to spread into a style binding. The line element itself only needs a background (or border) and a fixed size; the primitive supplies the scale and the edge it grows from.

```tsx
import { createScrollProgress, createScrollLine } from "solid-drift";

const progress = createScrollProgress(() => chapter);
const line = createScrollLine({ progress, axis: "x", origin: "start" });

<div
  style={{
    height: "2px",
    "background-color": "#d9a441",
    ...line(),
  }}
/>;
```

| Option     | Default           | Description                                            |
| ---------- | ----------------- | ------------------------------------------------------ |
| `progress` | whole-page scroll | Progress signal, 0 to 1                                |
| `axis`     | `"x"`             | Grow along `"x"` (horizontal rule) or `"y"` (vertical rule) |
| `from`     | `0`               | Scale at progress 0                                    |
| `to`       | `1`               | Scale at progress 1                                    |
| `origin`   | `"start"`         | Which edge the line grows from: `"start"`, `"center"`, or `"end"` (`"start"` is left/top) |
| `easing`   | `"linear"`        | Easing applied to the progress before mapping          |

SSR-safe (returns the `from` scale on the server). Under reduced motion the line holds the `to` scale, so it is fully revealed rather than stuck invisible.

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

| Option        | Default | Description                                          |
| ------------- | ------- | ---------------------------------------------------- |
| `smoothing`   | `0.8`   | Exponential smoothing, 0 to 1. Higher rides smoother |
| `scale`       | `1`     | Multiplier applied to the raw units per second       |
| `settleAfter` | `0.12`  | Seconds of stillness before the velocity parks at 0  |

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

| Option     | Default | Description                                         |
| ---------- | ------- | --------------------------------------------------- |
| `radius`   | `140`   | Attraction radius in px around the element's center |
| `strength` | `0.35`  | Pull strength at the center, 0 to 1                 |
| `spring`   | default | Spring physics for the pull and the release         |

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

### `createTiltCard(ref, options?)`

Holographic trading-card tilt: 3D lean plus every signal a holo foil needs. Beyond `createTilt`'s rotation, this tracks `glareX`/`glareY` (pointer position 0..1, for a radial glare overlay), `holoAngle` (a rainbow angle that sweeps with the pointer, for a gradient foil overlay), `shine` (0..1 overlay intensity that fades in on hover and out on leave), `scale` (hover pop), `hovering`, and a ready-made `transform()` string (perspective, rotateX/rotateY, scale). SSR-safe and reduced-motion safe: static constants, no tilt, no shine. Touch drags tilt while touching, release settles back.

```tsx
import { createTiltCard } from "solid-drift"

let card!: HTMLDivElement
const c = createTiltCard(() => card, { maxAngle: 14 })
<div style={{ transform: c.transform() }} ref={card}>
  {art}
  <div style={{
    background: `radial-gradient(circle at ${c.glareX() * 100}% ${c.glareY() * 100}%, rgba(255,255,255,0.6), transparent 60%)`,
    opacity: c.shine(),
  }} />
  <div style={{
    background: `linear-gradient(${c.holoAngle()}deg, #ff0080, #ff8000, #ffff00, #00ff80, #0080ff, #8000ff)`,
    "mix-blend-mode": "color-dodge",
    opacity: c.shine() * 0.55,
  }} />
</div>
```

| Option        | Default | Description                          |
| ------------- | ------- | ------------------------------------ |
| `maxAngle`    | `12`    | Maximum tilt in degrees at the edge  |
| `scale`       | `1.04`  | Scale while hovering                 |
| `perspective` | `900`   | Perspective distance in px           |
| `spring`      | default | Spring physics for tilt, shine, pop  |

### `createDrag(ref, options?)`

Pointer drag with spring physics, constraints, and momentum. The gesture workhorse: draggable cards, sliders, bottom-sheet handles, sortable rows. While the pointer is down the element tracks it 1:1; on release it glides with inertia and springs into its constraints, stretching elastically past the edges while dragged. Set `touch-action: none` on the draggable element so touch drags do not fight the page scroll. For the physics-toy flavor (exponential friction plus bouncing off walls), see `createFling` instead.

```tsx
import { createDrag } from "solid-drift"

let card!: HTMLDivElement
const { x, y, status } = createDrag(() => card, {
  constraints: { left: 0, right: 300, top: 0, bottom: 0 },
  elastic: 0.4,
})
<div
  ref={card}
  style={{
    transform: `translate(${x()}px, ${y()}px)`,
    "touch-action": "none",
    cursor: status() === "dragging" ? "grabbing" : "grab",
  }}
>
  Drag me
</div>
```

| Option        | Default                          | Description                                                        |
| ------------- | -------------------------------- | ------------------------------------------------------------------ |
| `axis`        | `"both"`                         | `"x"`, `"y"`, or `"both"`                                          |
| `constraints` | none                             | Bounds in px relative to the drag origin; release settles inside    |
| `elastic`     | `0.35`                           | Overshoot past constraints while dragging, 0 (hard stop) to 1      |
| `momentum`    | `true`                           | Glide with inertia after release                                   |
| `inertia`     | `0.2`                            | Seconds of release velocity projected into the settle target       |
| `spring`      | `{ stiffness: 300, damping: 32 }` | Spring physics for the settle after release                       |
| `onDragStart` | none                             | Called when the pointer grabs the element                           |
| `onDragEnd`   | none                             | Called on release with `{ x, y, velocityX, velocityY }` (px/s)      |

Returns `{ x, y, status }`: the drag offset in pixels and `status` (`"idle"`, `"dragging"`, `"settling"`). SSR-safe: everything rests at 0. Under reduced motion the drag still tracks the pointer (direct manipulation is not animation) but release snaps instantly to the constrained target with no glide.

### `createSwipe(ref, options?)`

Touch swipe gesture recognition: swipe-to-dismiss, carousels. While `createDrag` tracks the pointer continuously, `createSwipe` makes the discrete decision: was that gesture a swipe, and which way? On pointerup it compares travel, duration, and velocity against the thresholds and fires the matching callbacks plus the `lastSwipe` signal. Pointer Events give touch parity for free: mouse, touch, and pen run through the same path. For touch, set `touch-action: pan-y` on a horizontal swipe surface (or `pan-x` for vertical) so the browser does not hijack the gesture; use `none` when recognizing both axes.

```tsx
import { createSwipe } from "solid-drift"

let deck!: HTMLDivElement
const { lastSwipe } = createSwipe(() => deck, {
  onSwipeLeft: () => dismiss(),
  onSwipeRight: () => keep(),
})
<div ref={deck} style={{ "touch-action": "pan-y" }}>card</div>
```

| Option         | Default | Description                                                              |
| -------------- | ------- | ------------------------------------------------------------------------ |
| `threshold`    | `48`    | Minimum travel in px to count as a swipe                                 |
| `maxDuration`  | `800`   | Maximum gesture duration in ms                                           |
| `minVelocity`  | `0.4`   | Minimum velocity in px/ms; a fast flick below `threshold` still counts    |
| `axis`         | `"both"`| `"x"`, `"y"`, or `"both"`                                                |
| `onSwipe`      | none    | Called for every recognized swipe with `{ direction, distance, velocity, duration, from, to }` |
| `onSwipeLeft` / `onSwipeRight` / `onSwipeUp` / `onSwipeDown` | none | Per-direction callbacks |

Returns `{ lastSwipe, reset }`. A swipe counts when travel passes `threshold` inside `maxDuration`, or velocity passes `minVelocity`; slow long drags are not swipes. Recognition is not animation, so it works identically under reduced motion; the host decides how to animate the response. SSR-safe: `lastSwipe()` stays null and callbacks never fire.

### `createTrail(source, options?)`

A signal that replays another signal's past: it returns the value the source had `delay` milliseconds ago, interpolated between samples. Chain trails off one source for follower effects (a cursor with a comet tail, cascading highlights), or trail a scroll progress for a delayed echo of the page. The trail catches up and parks exactly on the latest value when the source rests. The follow loop runs only while the trail is behind.

```tsx
import { createTrail } from "solid-drift";

const [tab, setTab] = createSignal(0);
// The indicator glides behind the selection instead of jumping
const ghost = createTrail(tab, { delay: 150 });
```

| Option  | Default | Description                                        |
| ------- | ------- | -------------------------------------------------- |
| `delay` | `120`   | How far behind the source the trail follows, in ms |

SSR-safe: returns the source itself on the server. Under reduced motion it also returns the source directly, with no trailing motion. A `delay` of 0 returns the source itself.

### `createTimeline(steps)`

Plays a sequence of one-shot animations back to back. Each step is an `animate()` call: `from`/`to` plus duration, delay, easing, and `onUpdate`. Steps run strictly in order, so one step's `onUpdate` can drive one element while the next step drives another, building choreographed entrances without nested callbacks.

```ts
import { createTimeline } from "solid-drift";

const intro = createTimeline([
  {
    from: 0,
    to: 1,
    duration: 400,
    onUpdate: (v) => (title.style.opacity = String(v)),
  },
  {
    from: 24,
    to: 0,
    duration: 500,
    easing: "easeOutExpo",
    onUpdate: (v) => (title.style.transform = `translateY(${v}px)`),
  },
  {
    from: 0,
    to: 1,
    duration: 300,
    onUpdate: (v) => (cta.style.opacity = String(v)),
  },
]);
await intro.start();
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
import { animateFlip } from "solid-drift";

const [items, setItems] = createSignal(["a", "b", "c"]);
let list!: HTMLUListElement;

const shuffle = () =>
  animateFlip(
    () => list,
    () => setItems((prev) => [...prev].reverse()),
    { duration: 450 },
  );
```

| Option     | Default          | Description                                                                                          |
| ---------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `duration` | `400`            | Duration in milliseconds                                                                             |
| `delay`    | `0`              | Delay before starting, in milliseconds                                                               |
| `easing`   | `"easeOutCubic"` | Easing function or name                                                                              |
| `scale`    | `true`           | Also animate the size delta as scale, so growing or shrinking elements morph instead of just sliding |

Returns `{ stop, finished }`: `stop()` halts mid-flight and restores the original transform. SSR-safe and reduced-motion safe: the mutation runs with no animation. If the element does not move, no animation runs either.

### `createSharedLayout(ref, options)`

Shared-element transition across mounts, the `layoutId` magic. Give the same `id` to elements that represent the same thing in different places: a tab pill, a card that opens into a detail view, a thumbnail that becomes a hero image. When the old element unmounts its rect is remembered; when the new one mounts it starts at the donor's rect and springs home, sliding and morphing into place. This is cross-mount FLIP: where `animateFlip` inverts the delta around a mutation on one element, `createSharedLayout` inverts the delta between two elements that share an identity. One active carrier per id.

```tsx
import { createSharedLayout } from "solid-drift"

function TabPill(props: { id: string }) {
  let pill!: HTMLDivElement
  const { x, y, scaleX, scaleY } = createSharedLayout(() => pill, {
    id: props.id,
  })
  return (
    <div
      ref={pill}
      style={{
        transform: `translate(${x()}px, ${y()}px) scale(${scaleX()}, ${scaleY()})`,
      }}
    />
  )
}

// Only one pill is mounted at a time; it glides between tabs.
<Show when={tab() === "a"}><TabPill id="pill" /></Show>
<Show when={tab() === "b"}><TabPill id="pill" /></Show>
```

| Option   | Default                          | Description                                                     |
| -------- | -------------------------------- | --------------------------------------------------------------- |
| `id`     | required                         | Shared identity; elements with the same id hand off to each other |
| `spring` | `{ stiffness: 260, damping: 30 }` | Spring physics for the handoff flight                           |
| `scale`  | `true`                           | Also morph the size delta as scale                               |

Returns `{ x, y, scaleX, scaleY, flying }`: the corrective transform and `flying`, true while the handoff runs. SSR-safe and reduced-motion safe: the element simply appears, with no flight.

### `springPresets`

Named spring configurations for common feels. Spread into `createSpring`, `createMagnetic`, or `createTilt` options.

```ts
import { createSpring, springPresets } from "solid-drift";

const x = createSpring(target, { ...springPresets.wobbly });
```

| Preset     | Feel                                            |
| ---------- | ----------------------------------------------- |
| `gentle`   | Soft and calm, default-like, a touch slower     |
| `default`  | The library default balance                     |
| `snappy`   | Tight and responsive, for UI that must keep up  |
| `wobbly`   | Loose and playful, with a visible overshoot     |
| `molasses` | Heavy and deliberate, like moving through syrup |

### `createSquashStretch(ref, options)`

Cartoon squash and stretch driven by real velocity. Give it a motion source (a signal, or an element it watches) and it stretches the element along its direction of travel, preserving volume on the cross axis. Slam to a stop and it squash-pancakes on impact, then jiggles back to rest. The deform is applied through the CSS `scale` property, so it composes with `translate` and `rotate` from other primitives.

```tsx
import { createSpring, createSquashStretch } from "solid-drift"

let card: HTMLDivElement | undefined
const [target, setTarget] = createSignal(0)
const x = createSpring(target, { stiffness: 120, damping: 14 })
const { scaleX, scaleY } = createSquashStretch(() => card, { source: x })

<div ref={card} use:drift={{ x, scaleX, scaleY }}>fling me</div>
```

Options: `source` (signal, or `"element"` to watch the ref's own movement), `maxStretch` (default 1.3), `maxSquash` (default 0.7), `preserveVolume` (default 0.8), `fullSpeed` (px/s that maps to full stretch, default 2400), `spring` (stiffness/damping for the deform itself). Returns `{ scaleX, scaleY }`. Pass `ref` as `null` to get the raw deform signals without touching the DOM. Under reduced motion the deform stays at 1.

### `createFollowThrough(source, options?)`

Overlapping action for signals: a chain of followers that chase the source with staggered delays and springy overshoot, like a tail or a cape trailing behind a runner. Each link follows the previous one, so the lag compounds down the chain.

```ts
import { createFollowThrough } from "solid-drift";

const [tip, setTip] = createSignal(0);
// Three followers, each 70ms behind the last.
const [seg1, seg2, seg3] = createFollowThrough(tip, { links: 3 });
```

Options: `links` (default 3), `delayPerLink` (ms, default 70), `spring` (stiffness/damping, or an array with one config per link for a whip that loosens toward the tail). Under reduced motion each follower is the source itself.

### `createAnticipation(from, to, options?)`

The wind-up before the punch. Moves opposite the travel direction, holds a beat, then fires the main animation. Returns `AnimationControls` (`finished`, `stop()`).

```ts
import { createAnticipation } from "solid-drift";

// A punch button: pulls back 24px, holds, then slams forward.
createAnticipation(0, 200, {
  windupDistance: 24,
  windupDuration: 160,
  holdDuration: 60,
  duration: 320,
  easing: "easeOutExpo",
  onUpdate: (v) => (el.style.translate = `${v}px`),
});
```

Options: `windupDistance` (px opposite travel, default 24), `windupDuration` (default 140), `holdDuration` (default 50), plus every `animate()` option (`duration`, `easing`, `delay`, `onUpdate`, `onComplete`). Under reduced motion it skips straight to the main animation with no wind-up.

### `createWobble(ref?, options?)`

A triggerable cartoon wobble: decaying rotational oscillation with a counter-phase scale pulse, like a jelly nudged on a plate. Call `wobble()` yourself or let a pointer-down on the element trigger it.

```ts
import { createWobble } from "solid-drift";

const { wobble } = createWobble(() => badge, {
  rotation: 9, // degrees of swing
  frequency: 5, // wobbles per second
  decay: 0.45, // seconds of visible wobble
  trigger: "pointerdown",
});
```

Options: `rotation` (default 7), `frequency` (default 5), `decay` (default 0.45), `scaleAmount` (default 0.06), `trigger` (`"pointerdown" | "none"`, default `"pointerdown"` when a ref is given). Returns `{ rotate, scaleX, scaleY, wobble }`; `wobble(direction?)` retriggers with an optional initial direction. Under reduced motion it never moves.

### `createGravity(options?)`

Real falling physics with floor bounces. A body accelerates downward, bounces with restitution, and comes to rest exactly on the floor. Call `drop()` to replay.

```ts
import { createGravity } from "solid-drift";

const { x, y, moving, drop } = createGravity({
  from: 300, // drop height above the floor
  gravity: 2600,
  bounciness: 0.55,
  velocityX: 120, // optional sideways toss
  onRest: () => console.log("landed"),
});
```

Returns `{ x, y, vx, vy, moving, drop, stop }`. Under reduced motion the body sits on the floor and `drop()` is a no-op.

### `createPendulum(ref, options?)`

A true physical pendulum: integrates the pendulum equation, so the period naturally depends on the rope length. Drag the bob with the pointer to set a release angle, or call `swing(degrees)`.

```ts
import { createPendulum } from "solid-drift";

const { angle, x, y, swing } = createPendulum(() => bob, {
  length: 180,
  gravity: 2600,
  damping: 0.35,
  amplitude: 40, // auto-swings on mount
});
```

Returns `{ angle, x, y, swing }` where `x`/`y` are the bob offset from the pivot. Pointer drag pauses the sim, sets the angle from the pointer position around the pivot, and releases on pointer-up. Under reduced motion it hangs at rest.

### `createFling(ref, options?)`

Drag it, throw it: pointer drag with release velocity, exponential friction, and bounces off the container or viewport edges. The momentum is sampled from the last 120ms of pointer movement, so a flick feels like a flick.

```ts
import { createFling } from "solid-drift";

const { x, y, moving, stop } = createFling(() => card, {
  friction: 1.4,
  bounciness: 0.6,
  bounds: () => arena, // or omit for the viewport
});
```

Returns `{ x, y, vx, vy, moving, stop }`. Under reduced motion dragging still works but release has no momentum.

### `createFontSwap(ref, options)`

Interactive display type: swaps the font family (and optionally weight) on hover with a per-letter roll. Each letter flips away in the old font and lands in the new one, so the metric change never reads as a layout jump.

```ts
import { createFontSwap } from "solid-drift";

const { swapped, toggle } = createFontSwap(() => headline, {
  to: "Georgia, serif",
  toWeight: 700,
  duration: 160,
  stagger: 24,
});
```

Options: `to` (font family), `toWeight`, `duration` (ms per half-roll), `stagger` (ms between letters), `easing`, `tapToToggle` (on touch devices a tap toggles, default true). Returns `{ swapped, swap, toggle }`. Under reduced motion the font swaps instantly.

### `createTyping(ref, options?)`

Types out text character by character with human-like variable speed: each character's delay jitters around the base speed, and punctuation gets its own beat. A blinking cursor rides along and parks itself when done.

```ts
import { createTyping } from "solid-drift";

const { start, replay, typing } = createTyping(() => terminal, {
  speed: 45,
  variance: 0.4,
  pauses: { ".": 350, ",": 180 },
  cursor: "▍",
});
```

Options: `text` (defaults to the element's current text), `speed`, `variance`, `pauses`, `cursor` (`""` for none), `blinkRate`, `autostart` (default true), `onComplete`. Returns `{ start, replay, stop, typing, completed }`. Under reduced motion the full text appears instantly.

### `createTextPhysics(ref, options?)`

Per-letter cartoon physics: `drop()` rains each letter from above with gravity, tumbling rotation, and squashy bounces until every letter lands in its slot. `scatter()` flings the letters apart so they can rain again. Pair with `createInView` to rain a headline in as it scrolls into view.

```ts
import { createTextPhysics, createInView } from "solid-drift";

const { drop, settled } = createTextPhysics(() => headline, {
  dropHeight: 320,
  bounciness: 0.45,
  tumble: 200,
  stagger: 45,
});
createInView(
  () => headline,
  (inView) => inView && drop(),
);
```

Options: `dropHeight`, `gravity`, `bounciness`, `tumble` (max initial rotation in degrees), `stagger`, `restThreshold`, `onSettle`. Returns `{ drop, scatter, settled }`. Under reduced motion letters sit in place.

### `createTextTunnel(ref, options?)`

An infinite 3D text tunnel: copies of the text at staggered depths zoom toward the viewer forever, each fading in from the distance and out past the camera. Drive it with time, scroll progress, or your own 0..1 signal.

```ts
import { createTextTunnel } from "solid-drift";

// Time-driven ambient tunnel.
createTextTunnel(() => title, { layers: 6, period: 3 });

// Or scroll-driven: the tunnel dives as you scroll.
createTextTunnel(() => title, { drive: "scroll" });
```

Options: `drive` (`"time" | "scroll" | Accessor<number>`, default `"time"`), `period` (seconds per cycle), `layers` (default 6), `zoom` (front-layer scale, default 3). Returns `{ progress, stop }`. Under reduced motion the text renders as a single static line.

### `createTextCutout(ref, options?)`

Turns text into letter-shaped windows onto another world. In `"gradient"` mode an animated nebula drifts behind the letterforms via `background-clip: text`. In `"window"` mode the fill goes transparent with a stroked outline: overlay it on a canvas, video, or 3D scene and the live scene shows through the letters themselves.

```ts
import { createTextCutout } from "solid-drift";

// Nebula drifting inside the letterforms.
createTextCutout(() => headline, {
  palette: ["#312e81", "#7c3aed", "#22d3ee"],
});

// Or frame a live scene behind stroked letters:
// <canvas/> + <h1> with createTextCutout(h1, { mode: "window" })
```

Options: `mode` (`"gradient" | "window"`, default `"gradient"`), `progress` (0..1 signal, defaults to a slow time drift), `palette`, `stroke`, `strokeWidth`, `period`. Returns `{ stop }`.

### `createTextGradient(ref, options?)`

Paints each character its own hue and cycles the rainbow across the text: the hue shifts along the string by `spread` degrees while the whole cycle rotates over time, or with your own progress signal for scroll-driven hue shifts.

```ts
import { createTextGradient } from "solid-drift";

createTextGradient(() => headline, {
  hue: 210,
  spread: 140,
  period: 7,
});
```

Options: `progress`, `spread`, `hue`, `saturation`, `lightness`, `period`. Returns `{ stop }`. Under reduced motion the gradient parks on its first frame.

### `createTextScramble(ref, options?)`

A decoder-ring text reveal: every character cycles through random glyphs and locks into its final letter left to right, like a combination lock finding its code.

```ts
import { createTextScramble } from "solid-drift";

const { start, replay, scrambling } = createTextScramble(() => headline, {
  stagger: 28,
  duration: 500,
  charset: "!<>-_\\/[]{}=+*^?#",
});
```

Options: `text` (defaults to the element's text), `charset`, `stagger`, `duration` (ms each character scrambles), `frameRate`, `autostart` (default true), `onComplete`. Returns `{ start, replay, stop, scrambling }`. Under reduced motion the full text appears instantly.

### `createTextWave(ref, options?)`

A traveling sine wave across the text: each character bobs up and down and tilts with the slope as the wave passes through. Time-driven for an ambient shimmer, or hand it scroll progress for a wave that moves as you scroll.

```ts
import { createTextWave } from "solid-drift";

createTextWave(() => headline, {
  amplitude: 9,
  wavelength: 7,
  period: 1.8,
});
```

Options: `amplitude`, `wavelength` (characters per wave), `period`, `tilt` (default true), `progress`. Returns `{ stop }`. Under reduced motion the text sits still.

### `createCountUp(source, options?)`

A signal that counts toward a source number with an eased tween, rendering as a formatted string: dashboard stats, prices, scores. When the source changes mid-count the tween retargets from the current displayed value, with no snapping.

```tsx
import { createCountUp } from "solid-drift"

const [revenue, setRevenue] = createSignal(0)
const display = createCountUp(revenue, {
  decimals: 2,
  prefix: "$",
  separator: ",",
})
<div>{display()}</div> // "$1,234.50" gliding up from "$0.00"
setRevenue(1234.5)
```

Options: `decimals` (default 0), `duration` (ms, default 1000), `easing` (default `"easeOutExpo"`), `prefix` (default `""`), `suffix` (default `""`), `separator` (thousands separator, default `""`). Returns an accessor of the formatted string. SSR-safe: renders the formatted source value. Under reduced motion the text jumps straight to each new value.

### `createKineticType(ref, options?)`

Kinetic typography: each character (or word) flies in with position, blur, scale, and opacity, staggered for that showreel title feel. One master clock drives every unit, so a 40-character headline costs a single rAF task.

```tsx
let title!: HTMLHeadingElement;
const kinetic = createKineticType(() => title, {
  unit: "chars", // or "words"
  duration: 550, // ms per unit
  stagger: 45, // ms between unit starts
  from: { y: 40, blur: 12, scale: 0.8, opacity: 0, rotate: 0 },
  easing: "easeOutExpo",
});
onMount(() => kinetic.play());
<h1 ref={title}>Showreel</h1>
```

Returns `{ play, stop, replay, status }`. `play()` resolves when the last unit arrives. Under reduced motion every unit jumps to its final state, so the text is fully readable.

`from` also accepts `variance` (0 to 1, default 0) and `seed`. Each unit jitters `y`, `blur`, `scale`, and `rotate` around the `from` values by up to `variance`, so a headline feels hand-set instead of mechanical. The jitter uses a seeded PRNG, so the same `seed` renders the exact same layout on every run (stable across SSR and replays). `variance: 0` keeps the classic uniform behavior.

### `createScenePlayer(scenes)`

Scene orchestrator for showreels and launch films: an ordered list of scenes, each with a `duration` and `onEnter`/`onExit` hooks. `scene()` tells your view which scene is live; the hooks trigger each scene's choreography (a `createKineticType`, a camera move, a color shift).

```ts
const player = createScenePlayer([
  { duration: 1200, onEnter: () => hookTitle.play() },
  { duration: 2000, onEnter: () => cameraZoom.play() },
  { duration: 1500, onEnter: () => showLogo() }, // final frame
]);
await player.play(); // resolves after the last scene
```

Returns `{ scene, status, play, pause, stop, replay, next, prev, goTo }`. `pause()` freezes the clock and `play()` resumes where it left off. Under reduced motion `play()` jumps straight to the last scene (the clean final frame).

### `createCamera(keyframes, options)`

Camera moves for a motion-design stage: pan (`x`/`y` in px) and zoom (`scale`) through keyframes, driven by a 0-to-1 progress signal. Returns a compositor-friendly transform string (`translate3d(...) scale(...)`).

```tsx
const [p, setP] = createSignal(0);
const cam = createCamera(
  [
    { at: 0, x: 0, y: 0, scale: 1 },
    { at: 1, x: -120, y: 40, scale: 1.6, easing: "easeInOutCubic" },
  ],
  { progress: p },
);
<div style={{ transform: cam() }}>...</div>
```

Keyframes sort themselves by `at`; progress outside the range clamps to the end poses. Pure computation, no listeners. Under reduced motion it holds the final keyframe's pose.

### `createColorShift(stops, options?)`

Time-based color interpolation across stops: the sibling of `createScrollColor` for motion graphics, where color shifts run on a clock instead of scroll. Colors interpolate in linear light and alpha channels interpolate too.

```ts
const shift = createColorShift(
  [
    { at: 0, color: "#0a1220" },
    { at: 0.5, color: "#2f8fdd" },
    { at: 1, color: "#d9a441", easing: "easeInOutQuad" },
  ],
  { duration: 2000, format: "hex" },
);
shift.color(); // "#0a1220" ... "#d9a441" as it plays
await shift.play();
```

Returns `{ color, play, stop, replay, status }`. Under reduced motion `play()` jumps to the final stop's color.

### `createTransition(options?)`

Match-cut style scene handoffs: `outgoing()` and `incoming()` return style objects for the two scene layers, driven by one 0-to-1 progress.

```tsx
const cut = createTransition({ type: "wipe", direction: "left", duration: 600 });
const go = async () => {
  showSceneB();
  await cut.play();
};
<div style={cut.outgoing()}>{sceneA}</div>
<div style={cut.incoming()}>{sceneB}</div>
```

Types: `"cut"` (instant swap), `"fade"` (crossfade), `"slide"` (layers move in opposite directions), `"wipe"` (incoming scene reveals over the outgoing one with a clip-path). Directions for slide/wipe: `"left"`, `"right"`, `"up"`, `"down"`. Everything animates on opacity, transform, or clip-path, so handoffs stay on the compositor. Under reduced motion every type degrades to a cut.

### `createBeat(options?)`

A beat clock for cutting on the music: `onBeat` fires your scene cuts, kinetic type replays, or color shifts in time. `phase()` gives the fractional position inside the current beat for syncing continuous motion to the rhythm.

```ts
const beat = createBeat({ bpm: 128, beatsPerBar: 4 });
const off = beat.onBeat((b) => {
  if (b % 8 === 0) player.next(); // cut scenes every 2 bars
});
beat.start();
```

Returns `{ beat, bar, beatsPerBar, phase, onBeat, start, stop, status }`. `onBeat` returns an unsubscribe function. Beats are timing, not motion, so the clock keeps ticking under reduced motion (your callbacks decide what that means visually).

### `createShowreel(scenes)`

A guided showreel recipe on top of `createScenePlayer`: scenes carry a `kind` label (`"title"`, `"camera"`, `"color"`, `"cut"`, `"custom"`) so the reel reads like a shot list. It returns the full scene player controls, so `play`, `pause`, `next`, `prev`, and `goTo` all work unchanged.

```ts
const reel = createShowreel([
  { kind: "title", duration: 1200, onEnter: () => titleCard.play() },
  { kind: "camera", duration: 2000, onEnter: () => dolly.play() },
  { kind: "color", duration: 1500, onEnter: () => finale.play() },
  { kind: "cut", duration: 400, onEnter: () => wipe.play() },
]);
await reel.play(); // resolves after the last scene
```

Showreel recipe: combine `createKineticType` (title cards), `createCamera` (dolly moves), `createColorShift` (finale grade), `createTransition` (match cuts), `createBeat` (rhythm), and `createShowreel` (the shot list). Under reduced motion `play()` jumps straight to the last scene.

### `createBeatCuts(beat, player, options?)`

Beat-synced scene cuts: advances the player every N beats through the beat clock's `onBeat`. The default interval is the beat clock's `beatsPerBar`, so a cut lands on every downbeat. Returns a cleanup function that unsubscribes the cut listener.

```ts
const beat = createBeat({ bpm: 128, beatsPerBar: 4 });
const stopCuts = createBeatCuts(beat, player); // cut every bar
// const stopCuts = createBeatCuts(beat, player, { every: 8 }); // every 2 bars
beat.start();
await player.play();
stopCuts();
```

Cuts only fire while the player is running, so pausing the reel pauses the cuts too. Beat timing is not motion, so cuts keep firing under reduced motion (pair with a reduced-motion-safe `onEnter` if the cut itself animates).

### `createStreamReveal(ref, options?)`

Streaming text for chat and agent UIs: push characters as they arrive and each batch reveals with the kinetic treatment (rise, deblur, settle). Batches flush on a short cadence, or early when the queue grows past `maxBatch`, so fast streams never fall behind.

```tsx
let out!: HTMLDivElement;
const stream = createStreamReveal(() => out, { batchMs: 120, maxBatch: 24 });
const res = await fetch("/chat", { method: "POST", body: q });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  stream.push(decoder.decode(value, { stream: true }));
}
await stream.complete(); // flush the tail, then done
<div ref={out} aria-live="polite" />
```

Returns `{ push, complete, reset, status, pending }`. `status()` is `"idle"`, `"streaming"`, or `"done"`; `pending()` counts queued characters. Under reduced motion pushed text appears immediately with no per-unit animation; on the server `push` is a no-op and `status()` is `"done"`.

### `createTokenStream(options?)`

Streamed text with citation chips: AI answers cite sources as markers like `[1]`, and `push()` parses them out of the stream so each renders as a tappable chip next to the text. The buffer is re-parsed on every push, so a marker split across two chunks still resolves. Pure signals, no DOM.

```tsx
const stream = createTokenStream({
  citations: { "1": { label: "1", url: "https://example.com/source" } },
});
stream.push("Revenue grew 12% [1] last quarter.");
<For each={stream.segments()}>
  {(seg) => (
    <Show
      when={seg.kind === "citation"}
      fallback={<span>{(seg as { text: string }).text}</span>}
    >
      <a href={(seg as { citation: TokenCitation }).citation.url} class="chip">
        {(seg as { citation: TokenCitation }).citation.label}
      </a>
    </Show>
  )}
</For>;
```

Returns `{ push, complete, reset, segments, text, status }`. `segments()` is an ordered list of `{ kind: "text", text }` and `{ kind: "citation", key, citation }`; `text()` is the raw stream with markers intact for copying. Options: `citations` (marker to definition map), `pattern` (default `/\[(\d+)\]/`, first capture group is the key), `keepUnknown` (default true; unknown markers render as text, or are dropped when false). Pair with `createStreamReveal` when the text itself should animate in.

### `createAgentState(options?)`

A tiny state machine for agent UIs: `idle`, `thinking`, `streaming`, `tool`, `done`, `error`, with legal-transition gating and enter/exit hooks. Pure signals, no DOM, so it works on the server and in tests.

```ts
const agent = createAgentState({
  allowed: [
    { from: "idle", to: "thinking" },
    { from: "thinking", to: "streaming" },
    { from: "streaming", to: "tool-call" },
    { from: "tool-call", to: "streaming" },
    { from: "streaming", to: "done" },
  ],
  onEnter: (s) => console.log("agent:", s),
});
agent.set("thinking");
agent.state(); // "thinking"
agent.prev(); // "idle"
```

Agent UI recipe: `thinking` pairs with `createWobble` on typing dots, `streaming` drives `createStreamReveal`, `tool-call` overlays a `createTransition`, and `done`/`error` tint a status pill with `createColorShift`. Returns `{ state, prev, set, reset, is }`. Illegal moves are ignored. State is logic, not motion, so it behaves identically under reduced motion.

### `createApprovalGate(options?)`

Human in the loop for agent flows. An agent that mints, transfers, or publishes should not run unattended: `propose()` parks the flow in `"pending"`, the host renders an approve/deny UI, and the agent resumes only after a decision.

```ts
const gate = createApprovalGate({ timeoutMs: 60_000 });
gate.propose({ title: "Mint 1 NFT", description: "Costs 0.05 ETH" });
// ... the user approves in the UI ...
gate.approve();
gate.status(); // "approved"
```

Returns `{ status, request, reason, propose, approve, deny, reset }`. `status()` is `"idle"`, `"pending"`, `"approved"`, or `"denied"`; `request()` is the pending proposal; `deny(reason?)` records why. Decisions are no-ops unless pending, and `propose()` replaces a pending request. `timeoutMs` auto-denies when nobody decides in time (default 0, never). Pure signals, SSR-safe.

### `parseDriftSpec(input)`

Validates a DriftSpec, the JSON motion spec a coding agent can generate: `{ version: 1, scenes: [{ primitive, target?, options?, duration? }] }`. Supported primitives: `kineticType`, `streamReveal`, `camera`, `colorShift`, `transition`, `beat`. Throws a `DriftSpecError` naming the exact path (`scenes[0].options.duration`) on the first problem.

```ts
import { parseDriftSpec } from "solid-drift";

const spec = parseDriftSpec({
  version: 1,
  scenes: [
    {
      primitive: "kineticType",
      target: "title",
      options: { duration: 600, stagger: 40, from: { y: 40, variance: 0.5, seed: 7 } },
    },
    {
      primitive: "colorShift",
      options: {
        stops: [
          { at: 0, color: "#0a1220" },
          { at: 1, color: "#d9a441" },
        ],
        duration: 1200,
      },
      duration: 1200, // step budget: move on even if the shift is still running
    },
  ],
});
```

Prompt hint for generating specs: "Return ONLY a JSON DriftSpec: `{ version: 1, scenes: [...] }`. Each scene is `{ primitive, target?, options?, duration? }`. `primitive` is one of kineticType, streamReveal, camera, colorShift, transition, beat. `target` is a key into the refs map I provide. `options` match that primitive's options exactly. Keep scenes short; put a `duration` budget on any scene that should not block." Validation is pure and runs anywhere, including the server.

### `createSpecPlayer(spec, refs)`

Plays a validated DriftSpec: each scene runs its primitive against the matching ref from the `refs` map (`{ title: () => el }`), then the player advances. A scene `duration` acts as a budget, so a long ambient loop never stalls the reel.

```ts
const player = createSpecPlayer(spec, { title: () => titleEl });
await player.play(); // scenes in order, ends "done"
player.stop(); // halt mid-reel; the play() promise resolves
```

Returns `{ scene, status, play, stop }`. `scene()` is the live scene index (-1 before the first play). Under reduced motion `play()` applies every scene's final state instantly and ends `"done"`.

### `createTxLifecycle(options?)`

Transaction lifecycle for onchain UI, with zero wallet dependencies: feed it wagmi/viem-style state through an accessor (the adapter pattern) and it maps that to `idle`, `signing`, `pending`, `confirming`, `success`, `failed`. `progress()` springs between 0, 0.25, 0.5, 0.75, 1 so progress rings glide instead of jumping.

```ts
// Adapter: your wagmi/viem state in, tx state out.
const [chain] = createSignal({ status: "idle" as const, confirmations: 0 });
const tx = createTxLifecycle({
  source: () => ({
    status: chain().status, // "idle" | "pending" | "success" | "error"
    confirmations: chain().confirmations,
  }),
  requiredConfirmations: 2,
  onEnter: (s) => console.log("tx:", s),
});
tx.set("signing"); // manual: the moment the wallet prompt opens
```

Standard mapping: `set("signing")` when the wallet prompt opens, source `pending` (hash received) maps to `"pending"`, confirmations reaching the threshold promote to `"confirming"`, source `success`/`error` map to `"success"`/`"failed"`. Omit `source` for a fully manual lifecycle. Returns `{ state, set, reset, progress }`. On the server it stays `"idle"` with `progress()` 0; under reduced motion state changes apply instantly and `progress()` jumps to its target.

### `createTicker(source, ref, options?)`

A price ticker with rolling digits: each digit rolls vertically on change, the whole figure flashes green/red on up/down moves, and rapid source updates batch into one render per frame. `display()` always holds the formatted string, so SSR and tests read the price without DOM.

```tsx
const [price] = createSignal(64218.5);
const ticker = createTicker(price, () => priceEl, {
  decimals: 2,
  locale: "en-US",
  upColor: "#16a34a",
  downColor: "#dc2626",
  flashMs: 600,
});
<div>
  <span ref={priceEl} aria-label={`Price ${ticker.display()}`} />
</div>
```

Returns `{ display, direction }`. `direction()` is `"up"`, `"down"`, or `"flat"`. Formatting uses `Intl.NumberFormat` with the given locale. Under reduced motion the text swaps instantly with no rolling digits and no color flash; on the server only `display()` and `direction()` work.

### `createMintReveal(ref, options?)`

An NFT mint reveal: an anticipation shake winds up, the card flips on rotateY, `onFlip` fires at the midpoint (edge-on, so the face swap is invisible), and squash-and-stretch sells the landing. `reset()` returns the card to idle.

```tsx
let card!: HTMLDivElement;
const reveal = createMintReveal(() => card, {
  shakeDuration: 500,
  flipDuration: 700,
  squash: true,
  onFlip: () => setFace("revealed"), // swap the artwork mid-flip
});
<button onClick={() => reveal.play()}>Reveal</button>
<div ref={card} style={{ "transform-style": "preserve-3d" }} />
```

Returns `{ play, reset, status }`. `status()` walks `"idle"`, `"anticipating"`, `"flipping"`, `"revealed"`. Under reduced motion (and on the server) `play()` applies the revealed state immediately and still calls `onFlip`.

### `createDepixelate(image, canvas, options?)`

Pixel-to-sharp image reveal, the classic NFT mint ceremony. An image renders into a canvas fully pixelated, then resolves to sharp in discrete chunky steps on the shared animation clock. Owns the canvas drawing: give it an image and a canvas, call `play()` when the art should reveal. The pixelated teaser frame paints itself as soon as the image loads, so the pre-reveal state needs no manual setup. Pair with `createMintReveal` for the full ceremony: flip the card, depixelate the art.

```tsx
let img!: HTMLImageElement
let cvs!: HTMLCanvasElement
const reveal = createDepixelate(() => img, () => cvs, { duration: 1800 })
<img ref={img} src={artUrl} style={{ display: "none" }} />
<canvas ref={cvs} />
<button onClick={() => reveal.play()}>Reveal</button>
```

| Option       | Default           | Description                                    |
| ------------ | ----------------- | ---------------------------------------------- |
| `levels`     | `10`              | Discrete pixelation steps from blocky to sharp |
| `duration`   | `1600`            | Full reveal duration in ms                     |
| `easing`     | `"easeInOutCubic"`| Easing for the reveal progress                 |
| `onComplete` | none              | Called when the reveal reaches sharp           |

Returns `{ pixelSize, progress, status, play, complete, reset, stop }`. `status()` walks `"idle"`, `"revealing"`, `"revealed"`; `pixelSize()` is the current block size in px (1 means sharp). `stop()` halts mid-reveal and resolves the pending `play()` promise; `reset()` repaints the teaser; `complete()` jumps to sharp. Under reduced motion (and on the server) the art is sharp immediately.

### `createConnectButton(ref, options?)`

Wallet connect button micro-interactions: magnetic pull toward the pointer, a press scale, an animated check overlay for copy-address feedback, and a chain pulse ring. Pointer handling is global (presses that start inside still count if released outside), and everything cleans up on unmount.

```tsx
let btn!: HTMLButtonElement;
const connect = createConnectButton(() => btn, { strength: 0.35 });
<button
  ref={btn}
  onClick={() => {
    navigator.clipboard.writeText(address);
    connect.copyTick(); // check overlay pops, then fades
  }}
>
  {address}
</button>
```

Returns `{ copyTick, chainPulse, status }`. `status()` is `"idle"`, `"ticking"` (check visible), or `"pulsing"` (ring expanding). Call `chainPulse()` after a successful connection or network switch. Under reduced motion there is no magnetic pull or scale; `copyTick()` and `chainPulse()` still show their overlays statically.

### `createAgentTx(options?)`

AI proposes, the user approves, the transaction executes. The agent (an LLM) calls `propose()` with a plain-data proposal the user can read (`to`, `value`, `data`, `description`, `chainId`); the user calls `approve()` or `reject()`; `execute()` hands the approved proposal to your wallet adapter and the inner `createTxLifecycle` tracks signing to confirmation. The library never signs: `execute` is your wagmi/viem send function.

States flow `idle` to `proposed` to `approved` to `executing` to `confirmed`, with `rejected` and `failed` as the off-ramps. Invalid transitions are no-ops, so an LLM-driven UI cannot skip the user's approval. `progress()` is spring-smoothed across the whole flow for progress UI, and `tx` exposes the inner lifecycle for manual driving or extra rendering.

```tsx
const agentTx = createAgentTx({
  execute: async (p) => sendTransaction({ to: p.to, value: p.value }),
  source: () => receiptQuery(), // wagmi/viem-style status
});
// The AI proposes:
agentTx.propose({
  to: "0x…",
  value: "1000000000000000000",
  description: "Swap 1 ETH for USDC at the current rate.",
});
// The user reviews agentTx.proposal() and taps approve:
agentTx.approve();
await agentTx.execute(); // "executing" to "confirmed"
```

DriftSpec gains two LLM-generatable web3 steps for full dApp choreography: `"agentTx"` (options `to`, `description`, `value`, `data`, `chainId`, `autoApprove`) proposes a transaction mid-spec and waits for the host, via the new `createSpecPlayer(spec, refs, hooks)` third parameter, to approve and execute it through `hooks.onAgentTxStep`; `"txReceipt"` (options `hash`, `endpoint`, `timeout`) waits for a transaction hash to mine. A typical generated ceremony reads: `streamReveal` (explain) to `agentTx` (approve and send) to `txReceipt` (confirm).

```json
{
  "version": 1,
  "scenes": [
    { "primitive": "streamReveal", "target": "explainer", "options": { "text": "The agent proposes swapping 1 ETH for USDC." } },
    { "primitive": "agentTx", "options": { "to": "0x…", "description": "Swap 1 ETH for USDC.", "value": "1000000000000000000" } },
    { "primitive": "txReceipt", "options": { "hash": "0x…" } }
  ]
}
```

### Web3 data layer

A zero-dependency read layer for chain and market data as signals: public RPC and API endpoints over `fetch`, with user-swappable endpoints. Every network primitive shares the `{ data, error, status, retry, abort }` shape, is SSR-safe (nothing fetches on the server), and polls with error backoff. Defaults are conservative because public endpoints are rate-limited. This is read-only: transaction signing stays with wallet libraries.

```tsx
import {
  createPoll, createTokenPrice, createPriceChange, createPriceCompare,
  createGasPrice, createBalance, createTxReceipt, createBlockNumber,
  createChainlinkPrice, createNFTMetadata, createENS, createIdenticon,
  createChain, CHAINS, shortenAddress, isAddress, formatUnits, parseUnits,
  sanitizeOnchain,
} from "solid-drift";
```

**Polling infra.** `createPoll(fetcher, options?)` fetches immediately (unless `immediate: false`), then on `interval` (default 30s). On error the interval multiplies by `backoff` (default 2) up to `maxInterval` (default 5min) and resets on the next success. Returns `{ data, error, status, retry, abort }`; `status()` is `"idle"`, `"loading"`, `"success"`, or `"error"`.

**Pure helpers.** `isAddress(value)` checks `0x` + 40 hex chars. `shortenAddress(address, chars = 4)` renders `0xd8dA…6045` and passes invalid input through. `formatUnits(value, decimals = 18)` formats wei-style bigints as decimal strings without float artifacts; `parseUnits(value, decimals = 18)` parses them back and throws on invalid input. `sanitizeOnchain(input, options?)` sanitizes an untrusted onchain string (token name, memo, ENS label) for display: strips event handler attributes (`onerror=...`), neutralizes dangerous URL schemes in href/src style attributes (`javascript:`, `vbscript:`, non-image `data:` become `"#"`; `http`, `https`, `mailto`, relative URLs, anchors, and `data:image/` pass, with `allowedSchemes` customizable), then HTML-escapes the result, so the output is safe for `innerHTML`. Non-strings coerce (`null`/`undefined` become `""`); `maxLength` truncates. `CHAINS` maps seven chain ids (Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum One, Sepolia) to name, currency, decimals, explorer, and a public RPC; `createChain(id)` looks one up as a reactive accessor (`undefined` for unknown ids).

**Market.** `createTokenPrice(tokenId, options?)` polls CoinGecko's public API (default 60s; swap `endpoint` or `vsCurrency`) and exposes `price()` and `change24h()`. `createPriceChange(source, options?)` samples any numeric signal on change and on `sampleMs` (default 60s), keeps a rolling `windowMs` (default 1h), and reports the percent change between the first and last sample; `reset()` clears the window. `createPriceCompare(a, b)` compares two price signals with `ratio()`, `diffPercent()`, and `leader()` (`"a"`, `"b"`, or `"tie"`).

**Chain (JSON-RPC).** `createGasPrice(options?)` reads `eth_gasPrice` every 15s as `{ wei, gwei }`. `createBalance(address, options?)` reads the native balance every 20s, or an ERC20 `balanceOf` when `token` is set, exposing `balance()` (bigint) and `formatted()`. `createTxReceipt(hash, options?)` polls every 4s until the receipt lands, then stops on its own; `mined()` mirrors that and `receipt()` carries `transactionHash`, `blockNumber`, `success`, and `gasUsed`. `createBlockNumber(options?)` polls the latest block every 12s as a chain-health heartbeat. `createChainlinkPrice(feed, options?)` reads a Chainlink `AggregatorV3Interface` feed on-chain (`decimals()` once, then `latestRoundData()` every 30s). All take an `endpoint` option defaulting to a public mainnet RPC.

**Identity and NFTs.** `createNFTMetadata(contract, tokenId, options?)` fetches `tokenURI` on-chain, resolves the JSON (one-shot with `retry`), rewrites `ipfs://` through a gateway, and exposes `metadata()` (`name`, `description`, `image`, `attributes`, `raw`) plus `image()`. `createENS(address, options?)` reverse-resolves an address through the public ENS registry (one-shot with `retry`); `name()` is `undefined` when no name is set. `createIdenticon(address, options?)` renders a deterministic mirrored-grid SVG avatar as a data URI, pure computation, works on the server.

```tsx
const { price, change24h } = createTokenPrice("ethereum");
const { change } = createPriceChange(price);
const { formatted } = createBalance("0xd8dA…6045");
const { mined, receipt } = createTxReceipt("0x5c50…f7b");
const avatar = createIdenticon("0xd8dA…6045");
```

### `createToast(options?)`

A signal-native toast queue with choreographed lifecycle. The primitive owns timing and state; you own the rendering, so no component opinions leak into your design system. Each toast moves through `"entering"` to `"visible"` to `"leaving"` to removed on the shared animation clock: bind `state` to CSS classes or drift values for enter/exit motion without any timers of your own.

```tsx
import { createToast } from "solid-drift"

const { toasts, success, dismiss } = createToast()
success("Payment sent", { description: "0.5 SOL to alice.sol" })

<For each={toasts()}>
  {(t) => (
    <div
      class="toast"
      classList={{
        "toast-enter": t.state === "entering",
        "toast-leave": t.state === "leaving",
      }}
    >
      <strong>{t.title}</strong>
      {t.description && <p>{t.description}</p>}
      <button onClick={() => dismiss(t.id)}>Dismiss</button>
    </div>
  )}
</For>
```

| Option     | Default | Description                                                      |
| ---------- | ------- | ---------------------------------------------------------------- |
| `max`      | `5`     | Max toasts in the queue; older ones are dismissed first          |
| `enterMs`  | `250`   | Enter transition time in milliseconds                            |
| `leaveMs`  | `200`   | Leave transition time in milliseconds                            |
| `duration` | `4000`  | Default auto-dismiss time in milliseconds                        |

Push helpers: `toast(title, options?)`, `info(...)`, `success(...)`, `warning(...)`, `error(...)`. Each returns the toast id. Per-toast options: `kind`, `description`, `duration` (ms; `0` means sticky). `dismiss(id)` starts the leave transition for one toast; `clear()` dismisses all. SSR-safe: toasts pushed on the server start `"visible"`. Under reduced motion the enter and leave transitions are instant, but auto-dismiss timing still applies.

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

### `createSlotMachine(options)`

Gacha slot machine: reels launch fast, decelerate with momentum, and stop left to right. Spin-to-mint theater for reveals, loot boxes, and prize draws. Pass `landing` to `spin()` when the outcome is already decided (the minted NFT, the prize): the reels still spin with full drama and land exactly on your symbols. Omit it for a fair random spin.

```tsx
import { createSlotMachine } from "solid-drift"

const machine = createSlotMachine({
  symbols: ["🍒", "⭐", "💎", "🚀"],
  onTick: (reel) => navigator.vibrate?.(10), // haptic tick per symbol
  onDone: (result) => console.log("minted:", result),
})

<button onClick={() => machine.spin()}>SPIN</button>
<div>{machine.values().join(" ")}</div>
```

Options: `symbols` (required, at least 2), `reels` (default `3`), `duration` (ms for the first reel, default `1400`), `stagger` (extra ms per subsequent reel, default `500`), `minSpins` (full rotations before stopping, default `3`), `easing` (default `"easeOutQuart"`), `onTick(reel, symbol)`, `onDone(result)`. Returns `{ values, result, status, spin, stop, reset }`: `values()` is the visible symbol per reel, `result()` the final symbols of the last spin, `status()` is `"idle"`, `"spinning"`, or `"done"`. `stop()` halts at the current symbols; `reset()` returns to idle. SSR-safe and reduced-motion safe: `spin()` jumps straight to the result.

### `createRedPacket(options?)`

Crypto red packet ceremony: tap to open, coins burst out with physics, the amount counts up. The primitive owns the ceremony state machine (`"sealed"`, `"opening"`, `"bursting"`, `"revealed"`) and the coin particle physics; you render the envelope and the coins. Each coin carries position, rotation, size, opacity, and its share of the total, split randomly like a real red packet grab.

```tsx
import { createRedPacket } from "solid-drift"

const packet = createRedPacket({ amount: 88, coins: 14 })

<button onClick={() => packet.open()}>
  {packet.status() === "sealed"
    ? "🧧 Tap to open"
    : `$${packet.revealed().toFixed(2)}`}
</button>
<For each={packet.coins()}>
  {(coin) => (
    <div
      class="coin"
      style={{
        transform: `translate(${coin.x}px, ${coin.y}px) rotate(${coin.rotation}deg)`,
        opacity: coin.opacity,
        width: `${coin.size}px`,
      }}
    />
  )}
</For>
```

Options: `coins` (default `12`), `amount` (total, default `88`), `spread` (burst size in px, default `160`), `gravity` (px/s^2, default `900`), `openDuration` (ms, default `500`), `burstDuration` (ms, default `1600`), `revealDuration` (ms, default `800`), `onOpen`, `onReveal(amount)`. Returns `{ status, coins, revealed, open, reset }`. SSR-safe and reduced-motion safe: `open()` jumps straight to revealed with no burst.

### `createConfetti(canvas, options?)`

Canvas confetti bursts: celebration physics with gravity, drag, sway, and tumbling paper flutter, rendered on the shared animation clock. Give it a canvas (a fullscreen fixed overlay with `pointer-events: none` is the classic setup) and call `burst()` from party moments: mints, wins, onboarding completions. Bursts accumulate, so rapid celebrations stack instead of replacing. The canvas is fitted to its CSS size times the device pixel ratio automatically.

```tsx
import { createConfetti } from "solid-drift"

let cvs!: HTMLCanvasElement
const confetti = createConfetti(() => cvs, {
  onDone: () => console.log("party over"),
})
<canvas ref={cvs} style={{ position: "fixed", inset: "0", "pointer-events": "none" }} />
<button onClick={() => confetti.burst()}>Celebrate</button>
<button onClick={() => confetti.burst({ x: 0.2, y: 0.8 })}>Side popper</button>
```

Options: `count` (particles per burst, default `120`), `colors` (default a festive palette), `spread` (launch cone in degrees around straight up, default `70`), `power` (launch speed in px/s, default `900`), `gravity` (px/s^2, default `1100`), `drag` (default `1.2`), `size` ([min, max] px, default `[6, 12]`), `shapes` (default `["rect", "circle"]`), `lifetime` (ms, default `2600`), `onDone` (called when the last particle fades). Returns `{ active, burst, clear }`: `burst(origin?)` fires from a normalized origin (default `{ x: 0.5, y: 0.6 }`), `clear()` removes every particle immediately. SSR-safe: `burst()` is a no-op on the server. Under reduced motion `burst()` skips the particles but still calls `onDone`, so chained logic (show the prize after the celebration) keeps working. Tip: pair with `useLowPowerMode` to drop the count on weak devices.

### `createEmojiBurst(canvas, options?)`

Emoji celebration burst: the same particle physics as confetti, but the particles are emoji glyphs that rise, tumble gently, and fade. Reactions, likes, level-ups, chat celebrations. Same canvas setup, same safety rules.

```tsx
import { createEmojiBurst } from "solid-drift"

let cvs!: HTMLCanvasElement
const burst = createEmojiBurst(() => cvs, { emoji: ["❤️", "🔥"] })
<canvas ref={cvs} style={{ position: "fixed", inset: "0", "pointer-events": "none" }} />
<button onClick={() => burst.burst()}>Send love</button>
```

Options: `emoji` (default `["🎉", "✨", "💥", "⭐", "💖", "🥳"]`), `count` (default `24`), `power` (default `650`), `gravity` (default `700`: floatier than confetti), `drag` (default `1.6`), `size` ([min, max] px, default `[24, 48]`), `spread` (default `90`), `lifetime` (default `1800`), `onDone`. Returns `{ active, burst, clear }`.

### `createScratch(canvas, options?)`

Scratch-off cover: a lottery-ticket foil over hidden content. The canvas paints an opaque cover (silver holographic foil by default, or your own art via `paint`) and pointer drags erase through it with `destination-out`. The cleared fraction is sampled from the alpha channel on a throttled cadence, and `onComplete` fires once past `threshold`. Layer it over the prize with absolute positioning, and set `touch-action: none` on the canvas so touch scratches do not scroll the page.

```tsx
import { createScratch } from "solid-drift"

let foil!: HTMLCanvasElement
const scratch = createScratch(() => foil, {
  onComplete: () => console.log("revealed!"),
})
<div style={{ position: "relative" }}>
  <div>YOU WON 50 STARS</div>
  <canvas ref={foil} style={{ position: "absolute", inset: "0", "touch-action": "none" }} />
</div>
```

Options: `threshold` (fraction cleared to complete, default `0.45`), `brush` (eraser radius in px, default `26`), `paint(ctx, w, h)` (custom cover art), `onComplete`. Returns `{ cleared, done, reset }`: `cleared()` is the 0..1 fraction erased, `reset()` repaints the cover. Scratching is direct manipulation, so it works identically under reduced motion. SSR-safe: `cleared()` stays 0.

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

### Streaming

Token-by-token chat over OpenAI, Anthropic, Meta's Llama API, or your own provider, plus a low-level fetch-based SSE client for any event stream.

```tsx
import { createChatModel } from "solid-drift"

const chat = createChatModel({
  provider: "openai",
  apiKey: () => localStorage.getItem("openai_key") ?? "",
  model: "gpt-4o-mini",
  system: "You are a concise assistant.",
})

// In your component:
<For each={chat.messages()}>
  {(m) => <div class={m.role}>{m.content}</div>}
</For>
<button onClick={() => chat.send(input())} disabled={chat.status() === "streaming"}>
  Send
</button>
```

- `createChatModel(options)` returns `{ messages, streamingText, status, error, send, stop, reset }`. `send(content)` appends the user message and streams the reply into a live assistant message, so UI bound to `messages()` renders token by token; `status()` is `idle`, `streaming`, or `error`. `stop()` aborts and keeps the partial reply; `send()` while streaming is ignored.
- `provider` is `"openai"`, `"anthropic"`, `"meta"`, or a custom `{ kind: "custom", stream, parseDelta }`. OpenAI and Meta (Llama API via `/compat/v1`, OpenAI-compatible) use Bearer auth and `data:` chunks terminated by `[DONE]`; Anthropic uses `x-api-key` plus `anthropic-version: 2023-06-01`, a top-level `system` prompt, and `content_block_delta` text deltas (required `maxTokens` defaults to 1024).
- Honest limitation: api.anthropic.com does not send CORS headers for browser origins, so from a browser Anthropic must go through your own server route or proxy; point `baseUrl` at it. For production with any provider, prefer a server route that holds the key and set `baseUrl` to it so keys never ship to the browser.
- `createSSE(url, options?)` is a fetch-based event-stream client (`{ status, events, lastEvent, error, connect, disconnect }`): unlike `EventSource` it supports any method and custom headers, parses the full SSE framing (named events, multi-line data, comments, chunk splits), and leaves reconnection manual via `connect()`. SSR-safe: nothing connects until `connect()` (or `autoConnect`) runs on the client.

### Voice

A full voice loop: mic metering, speech-to-text, a voice state machine, canvas waveforms, text-to-speech (browser or cloud), thinking indicators, and a voice-enabled prompt input.

```tsx
import { createVoiceState, createSpeech, createTTS, createPrompt, createChatModel } from "solid-drift"

const voice = createVoiceState()
const chat = createChatModel({ provider: "openai", apiKey: getKey, model: "gpt-4o-mini" })
const tts = createTTS()
const prompt = createPrompt({
  onSubmit: async (text) => {
    voice.toThinking()
    await chat.send(text)
    voice.toSpeaking()
    const msgs = chat.messages()
    tts.speak(msgs[msgs.length - 1]?.content ?? "")
    voice.toIdle()
  },
})

<input
  value={prompt.value()}
  onInput={(e) => prompt.setValue(e.currentTarget.value)}
  onKeyDown={(e) => e.key === "Enter" && prompt.submit()}
/>
<button onClick={() => { voice.toListening(); prompt.toggleMic(); }}>Mic</button>
```

- `createVoiceState()` is the turn state machine: `state()` is `idle`, `listening`, `thinking`, or `speaking`, with `toIdle`/`toListening`/`toThinking`/`toSpeaking` transitions.
- `createMicLevel(options?)` returns `{ level, active, supported, analyser, error, start, stop }`: a 0..1 smoothed RMS meter from `getUserMedia` plus an `AnalyserNode` (call `start()` from a user gesture). The exposed `analyser` wires straight into `createWaveform`.
- `createSpeech(options?)` wraps the Web Speech API (`SpeechRecognition` with `webkitSpeechRecognition` fallback): `{ supported, listening, transcript, interim, error, start, stop, reset }`. Final results accumulate into `transcript()`; `continuous` sessions auto-restart if the browser ends them mid-turn.
- `createWaveform(canvas, options)` draws the analyser's time-domain wave (`mode: "line"`) or spectrum (`mode: "bars"`) on a canvas, DPR-aware, on the shared clock; under reduced motion it redraws at most every 250ms.
- `createTTS(options?)` speaks via `speechSynthesis` by default (`{ supported, speaking, voices, speak, cancel }`, async voice loading, `speak()` cancels the current utterance first) and upgrades to any cloud voice through `provider: { speak(text, { signal }) }`.
- `createThinking(options?)` cycles `"Thinking"`, `"Thinking."`, ... through `phrases` at `interval` ms: `{ text, running, start, stop }`.
- `createPrompt(options?)` is the voice-enabled input: `{ value, setValue, listening, interim, supported, toggleMic, submit, clear }`. Mic finals are appended to the value as they arrive; `submit()` fires `onSubmit` and clears by default. Everything is SSR-safe: unsupported primitives report `supported: false` and their actions no-op on the server.

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

### Presence, view transitions, and scroll reveals

```tsx
import { createPresence, createViewTransition, createScrollReveal } from "solid-drift";

// Exit animations that actually run
const dialog = createPresence({ when: open, exitDuration: 250 });
<Show when={dialog.mounted()}>
  <div
    style={{
      opacity: dialog.exiting() ? "0" : "1",
      transition: "opacity 250ms",
    }}
  >
    ...
  </div>
</Show>;

// Native-feel page transitions
const vt = createViewTransition();
const switchTab = (tab: string) => vt.transition(() => setTab(tab));

// Scroll-triggered reveal choreography
const reveal = createScrollReveal(3, { stagger: 90 });
<For each={cards}>
  {(card, i) => (
    <div ref={reveal.items[i()].ref} style={reveal.items[i()].style()}>
      {card.title}
    </div>
  )}
</For>;
```

- `createPresence({ when, exitDuration?, onExitStart?, onExitComplete? })`: `{ mounted, status, exiting, forceExit }`. When `when` flips false, content stays mounted for `exitDuration` ms (default 300) so the exit animation finishes, then unmounts; flipping back mid-exit cancels it. `forceExit()` unmounts immediately. Skips the exit phase under reduced motion. SSR-safe.
- `createViewTransition()`: `{ supported, transitioning, transition }`. Wraps `document.startViewTransition`: `transition(update)` animates between old and new DOM when supported, otherwise runs the update directly. SSR-safe (`supported()` is false on the server).
- `createScrollReveal(count, options?)`: `{ items, replay, reset }`. Each `items[i]` has `ref`, `revealed`, and `style` (empty on the server so content stays visible without JS). Staggered entrance (`stagger`, default 60ms), variants (`fade`, `fade-up`, `fade-down`, `fade-left`, `fade-right`, `scale`, `none`), `once` semantics (default true), and instant reveal under reduced motion.

### Offline queue

```tsx
import { createOfflineQueue } from "solid-drift";

const outbox = createOfflineQueue({
  send: (payload) =>
    fetch("/api/messages", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  storageKey: "my-app:outbox", // persist across reloads
});
outbox.enqueue({ text: "hello" }); // sends now, or when back online
```

`createOfflineQueue({ send, online?, maxAttempts?, retryDelayMs?, storageKey?, capacity?, onDrain?, onDead? })`: `{ queue, dead, pending, status, error, enqueue, flush, remove, retryDead, clear }`. `enqueue()` sends immediately when online, otherwise waits for reconnect; the queue replays in order with exponential backoff (`retryDelayMs`, default 1000, doubled per attempt). Mutations that exhaust `maxAttempts` (default 5) are parked in `dead()` for the UI to surface, and `retryDead(id)` puts one back. `status()` is `"online"`, `"offline"`, or `"flushing"`. Online state defaults to the window `online`/`offline` events (assumes online on the server); pass your own `online` accessor to override. `storageKey` persists the queue to localStorage (payloads must be JSON-serializable). SSR-safe.

### Social posting helpers

```tsx
import { validatePost, normalizeAnalytics } from "solid-drift";

const check = validatePost(
  { text: draft, media: [{ type: "image" }] },
  ["x", "threads", "linkedin"],
);
if (!check.valid) {
  // check.issues: [{ platform, code, message }] — show what to fix
  // before the network silently truncates or rejects the post.
}

const report = normalizeAnalytics([
  { platform: "x", impressions: 1200, favorites: 40, reposts: 6 },
  { platform: "threads", views: 800, likes: 30, replies: 4 },
]);
// report: { followers, views, likes, shares, comments, clicks,
//           posts, engagementRate, platforms: [...] }
```

`validatePost(draft, platforms, options?)`: pure function that checks a post draft (`{ text, media?, link? }`) against documented platform limits: X 280 chars / 4 attachments / 140s video, Threads 500 chars / 10 media / 300s video, LinkedIn 3000 chars, Facebook 63206 chars, Instagram 2200 chars / 10 carousel items, TikTok 4000 chars (video required), Bluesky 300 chars / 4 images, Mastodon 500 chars / 4 media. Returns `{ valid, issues }` with machine-readable issue codes (`empty_post`, `text_too_long`, `too_many_media`, `video_too_long`, `video_required`). Character counts use code points so emoji count as one. Limits that vary by post type or are unverified are not checked; pass `limits` overrides to adjust any platform. Never posts anything.

`normalizeAnalytics(entries)`: pure function that takes one entry per platform using native field names (impressions, favorites, reposts, retweets, replies, urlClicks) and returns canonical totals plus a per-platform breakdown. `engagementRate` is `(likes + shares + comments) / views`, 0 when views is 0. Missing, negative, or non-finite values count as 0. Followers are summed across platforms (total audience, not unique people).

### Network primitives

```tsx
import {
  createApi,
  createWebSocket,
  createSearch,
  createUpload,
  createPagination,
  verifyWebhookSignature,
} from "solid-drift";

const user = createApi<User>({ url: () => `/api/users/${id()}` });
// user.data(), user.error(), user.status(), user.retry(), user.abort()

const socket = createWebSocket("wss://example.com/live");
socket.send({ type: "subscribe", channel: "prices" });

const search = createSearch({ fetcher: (q, signal) => searchUsers(q, signal) });
search.setQuery(input); // debounced; aborts the in-flight request

const upload = createUpload({ url: "/api/files" });
upload.upload(file); // upload.progress() goes 0 to 1

const pages = createPagination({ fetcher: (page, signal) => fetchPage(page, signal) });
pages.next(); // appends; pages.hasMore() tells you when to stop

const valid = await verifyWebhookSignature({
  payload: rawBody,
  signature: req.headers.get("x-signature") ?? "",
  secret: WEBHOOK_SECRET,
  prefix: "sha256=",
});
```

Every reactive primitive exposes `{ data, error, status, retry, abort }` (`status` is `"idle"`, `"loading"`, `"success"`, or `"error"`), plus its own controls.

- `createApi({ url, method?, headers?, body?, fetchFn?, immediate?, parse? })`: reactive fetch. A URL accessor refetches when it changes. Plain-object bodies are serialized as JSON. Non-2xx responses become errors. `execute()` runs it manually when `immediate` is false.
- `createWebSocket(url, { protocols?, reconnect?, reconnectDelayMs?, maxReconnectAttempts?, WebSocketImpl? })`: `{ data, error, status, send, retry, abort, close }`. `status` is `"connecting"`, `"open"`, `"closed"`, or `"error"`. Incoming messages are JSON-parsed when possible. Unexpected closes reconnect with exponential backoff; `retry()` reconnects now, `close()` shuts down for good. `send()` accepts a string or an object (serialized as JSON).
- `createSearch({ fetcher, debounceMs?, minLength? })`: `{ query, setQuery, data, error, status, retry, abort, clear }`. Setting the query debounces, then calls `fetcher(query, signal)`; a new keystroke aborts the in-flight request. Short queries clear the results.
- `createUpload({ url?, fieldName?, headers?, withCredentials?, XHRImpl?, parse? })`: `{ data, error, status, progress, upload, retry, abort }`. Multipart POST via XMLHttpRequest (fetch cannot report upload progress). `progress()` goes 0 to 1; the response is JSON-parsed when possible.
- `createPagination({ fetcher, initialPage?, append? })`: `{ data, page, hasMore, total, error, status, next, prev, goto, reset, retry, abort }`. `next()` appends the following page; `prev()`/`goto()` replace. `hasMore` comes from the fetcher, or is derived from `total`.
- `verifyWebhookSignature({ payload, signature, secret, algorithm?, encoding?, prefix? })`: async pure helper that checks an HMAC signature (SHA-256 hex by default; SHA-1 and base64 supported) with a timing-safe comparison. Returns `false` when verification is unavailable or fails; never throws. Uses WebCrypto.

All SSR-safe: nothing fires on the server until you call it.

### Easings

Named easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeOutExpo`, `easeOutBack`, plus the cartoon set: `easeInBack` (anticipation dip before movement), `easeInOutBack` (wind-up, overshoot, settle), `easeOutElastic` (decaying rubber-band oscillation), `easeOutBounce` (shrinking cartoon bounces). Also `cubicBezier(x1, y1, x2, y2)` for CSS-style curves. Pass a name or a custom `(t) => number` function anywhere an easing is accepted.

## How it works

One shared `requestAnimationFrame` loop drives every animation in the app, so hundreds of springs cost a single rAF tick per frame. Springs integrate with semi-implicit Euler, tweens sample an easing curve. When the tab becomes hidden the engine pauses the loop and freezes its clock, so nothing burns battery in the background; on return the clock continues where it left off and in-flight animations resume seamlessly. Everything is SSR-safe (animations simply don't run on the server).

## License

MIT © Austin Nguyen
