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

### Easings

Named easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeOutExpo`, `easeOutBack`, plus the cartoon set: `easeInBack` (anticipation dip before movement), `easeInOutBack` (wind-up, overshoot, settle), `easeOutElastic` (decaying rubber-band oscillation), `easeOutBounce` (shrinking cartoon bounces). Also `cubicBezier(x1, y1, x2, y2)` for CSS-style curves. Pass a name or a custom `(t) => number` function anywhere an easing is accepted.

## How it works

One shared `requestAnimationFrame` loop drives every animation in the app, so hundreds of springs cost a single rAF tick per frame. Springs integrate with semi-implicit Euler, tweens sample an easing curve. Everything is SSR-safe (animations simply don't run on the server).

## License

MIT © Austin Nguyen
