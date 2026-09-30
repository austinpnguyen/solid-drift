# Pointer and physics

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when elements should react to the pointer or simulate real physics.

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

[Try it](https://austinpnguyen.github.io/solid-drift/#/pointer/createMagnetic)

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

[Try it](https://austinpnguyen.github.io/solid-drift/#/pointer/createTiltCard)

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
