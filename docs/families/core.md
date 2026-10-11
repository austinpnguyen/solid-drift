# Core

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when you need the basic building blocks: springs, tweens, staggered lists, timelines, and imperative animation.

### `createSpring(source, options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/core/createSpring)

Returns a signal that follows `source` with spring physics. Changing the source mid-flight bends the spring toward the new target, keeping its velocity.

| Option      | Default | Description                           |
| ----------- | ------- | ------------------------------------- |
| `stiffness` | `170`   | Spring stiffness                      |
| `damping`   | `26`    | Damping coefficient                   |
| `mass`      | `1`     | Mass                                  |
| `precision` | `0.01`  | Rest threshold for value and velocity |
| `onRest`    | none    | Called once the spring settles        |

### `createTween(source, options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/core/createTween)

Returns a signal that tweens toward `source` over a fixed duration. Interrupting retargets from the current value.

| Option       | Default          | Description                    |
| ------------ | ---------------- | ------------------------------ |
| `duration`   | `300`            | Duration in milliseconds       |
| `delay`      | `0`              | Delay before starting (ms)     |
| `easing`     | `"easeOutCubic"` | Easing function or name        |
| `onComplete` | none             | Called when the tween finishes |

### `animate(from, to, options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/core/animate)

Imperative one-shot animation. Returns `{ stop, finished }`.

```ts
const ctl = animate(0, 1, {
  duration: 500,
  easing: "easeOutExpo",
  onUpdate: (v) => (el.style.opacity = String(v)),
});
await ctl.finished; // or ctl.stop()
```

**Overwrite management.** Rapid retriggers (hover spam) are the number one source of animation bugs. Pass `id` plus `overwrite: "auto"` and starting a new tween kills every active tween under the same id first. The killed tween gets `onInterrupt` (not `onComplete`).

```ts
el.addEventListener("mouseenter", () => {
  animate(0, 1, {
    id: "card-hover",
    overwrite: "auto",
    duration: 200,
    onUpdate: (v) => (el.style.opacity = String(v)),
    onInterrupt: () => console.log("superseded"),
  });
});

// Or kill manually:
import { killTweensOf } from "solid-drift";
killTweensOf("card-hover");
```

`createTween` accepts the same `id` / `overwrite` / `onInterrupt` options; retargeting with `overwrite: "auto"` interrupts the in-flight tween.

### `drift` directive

[Try it](https://austinpnguyen.github.io/solid-drift/#/core/drift)

Binds animated values directly to an element's style. Each prop accepts a plain number or any signal.

```tsx
<div use:drift={{ x, y, opacity, scale, scaleX, scaleY, rotate }} />
```

`x`/`y` map to `translate3d` px, `rotate` to degrees.

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

### `createSequence(steps?)`

Choreographed timeline with overlap, labels, and nesting. Unlike `createTimeline` (strictly sequential), steps can overlap using GSAP-style position parameters.

```ts
import { createSequence } from "solid-drift";

const intro = createSequence();
intro.addLabel("headlineIn", 0);
intro.add({
  target: () => titleEl,
  props: { y: [24, 0], opacity: [0, 1] },
  duration: 500,
  at: "headlineIn",
});
intro.add({
  target: () => ctaEl,
  props: { y: [16, 0], opacity: [0, 1] },
  duration: 400,
  at: "-=200", // overlap the previous step by 200ms
});
await intro.play();
```

Position parameter (`at`) follows GSAP semantics:

- `">"` (default) end of the previous step, `"<"` start of the previous step.
- `"<+=100"` / `">-=200"`: offset from previous step start/end.
- `"-=300"` / `"+=100"`: offset relative to the timeline end so far.
- `number`: absolute milliseconds from the sequence start.
- `"label"` / `"label+=100"`: a label registered with `addLabel()`.

Props are `[from, to]` pairs or keyframes arrays (3+ values, evenly spaced). Transform shortcuts `x`, `y`, `z` (px), `scale`, `scaleX`, `scaleY`, `rotation` (deg) compose into the transform string. Other numeric props become CSS properties (px except unitless like `opacity`).

Returns `{ play, pause, resume, reverse, seek, timeScale, addLabel, add, duration, status, dispose }`:

- `play()` / `reverse()` return a promise that resolves at the end.
- `seek(ms)` jumps to any time; every step renders its correct state. Wire scroll progress straight into `seek` for scrub-driven storytelling.
- `timeScale(n)` sets playback speed.
- Nested sequences can be added as steps; parent `seek`/`reverse` map down.

Under reduced motion `play()` applies every end value immediately and still resolves. SSR-safe: renders end values with no timers.

Try it: [Sequence demo](https://austinpnguyen.github.io/solid-drift/#/core/sequence)

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

### `createStagger(count, delayMs, opts?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/core/createStagger)

Builds a stagger-delay lookup for cascading animations across a list. Given an item index, returns its delay in milliseconds. Pair with `createTween`'s `delay` option (or `animate`) so items enter one after another instead of all at once. Pure function, no reactivity involved.

```tsx
import { createStagger } from "solid-drift";

const at = createStagger(5, 80); // 5 items, 80ms apart
at(0); // 0
at(3); // 240

// From the center outward:
const at2 = createStagger(5, 80, { from: "center" });

// 3x3 grid, center-out:
const at3 = createStagger(9, 100, { grid: [3, 3], from: "center" });
```

Options:

- `from`: `"first"` (default), `"last"`, `"center"`, or a specific index.
- `grid`: `[cols, rows]` for 2D stagger by Euclidean distance.
- `axis`: `"x"` or `"y"` to measure distance along one axis only.
- `ease`: ease the delay distribution.
