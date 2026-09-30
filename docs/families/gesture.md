# Gesture

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when you need drag or swipe interactions with touch parity.

### `createDrag(ref, options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/gesture/createDrag)

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

[Try it](https://austinpnguyen.github.io/solid-drift/#/gesture/createSwipe)

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
