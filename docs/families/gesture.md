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

## Mobile notes

### iOS Safari

- **300ms tap delay is gone** in modern iOS (viewport `width=device-width`), but `touch-action` still matters for gestures. Without it, Safari may scroll or zoom instead of delivering pointer events to your drag.
- **Pointer Events work** on iOS 13+. `createDrag` and `createSwipe` use Pointer Events, so touch, mouse, and pen share one code path. No touch-event fallback needed.
- **`touch-action` values**: use `none` for free-form drags (cards, sliders), `pan-x` for vertical drags (bottom sheets) so horizontal page scroll still works, `pan-y` for horizontal swipes (carousels).
- **Rubber-banding**: iOS scrolls the whole page with an elastic effect. If your drag surface is inside a scrollable area, set `overscroll-behavior: none` on the container to prevent the page from stealing the gesture at the edges.
- **Visual viewport**: when the keyboard opens, `window.innerHeight` shrinks but the layout viewport does not. Bottom sheets should use `100dvh` (dynamic viewport height) so they track the visible area.

### Scroll-lock pitfalls

Locking body scroll while a bottom sheet is open is a common source of bugs:

```tsx
// Do this: lock scroll when the sheet opens, restore on close.
createEffect(() => {
  document.body.style.overflow = sheet.open() ? "hidden" : "";
  onCleanup(() => (document.body.style.overflow = ""));
});
```

Pitfalls:
- **iOS ignores `overflow: hidden` on body** during momentum scroll. Add `position: fixed` to the body as well, or use a scroll-lock library that handles it.
- **Restore scroll position**: `position: fixed` resets the scroll. Save `window.scrollY` before locking and restore after.
- **Nested scrollers**: if the sheet content itself scrolls, stop propagation on its touchmove so the lock does not fight inner scrolling.

### Low-power mode

iOS Low Power Mode and Android battery saver throttle `requestAnimationFrame` and may pause it entirely in background tabs. solid-drift handles this:

- The shared clock uses `visibilitychange` to pause when the tab is hidden and resume on visible, so animations do not jump forward after a throttle gap.
- Springs and tweens converge to their targets even with sparse frames; they just take more wall-clock time.
- `createBattery()` exposes the battery level; consider reducing non-essential animation when `level() < 0.2 && !charging()`.

For PWA guidance (install prompts, offline), see the browser family docs.
