# Cartoon

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when you want cartoon-style motion: squash, anticipation, wobble.

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
