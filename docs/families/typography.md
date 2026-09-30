# Typography

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when text itself is the animation.

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

[Try it](https://austinpnguyen.github.io/solid-drift/#/typography/createTyping)

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

[Try it](https://austinpnguyen.github.io/solid-drift/#/typography/createCountUp)

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

[Try it](https://austinpnguyen.github.io/solid-drift/#/typography/createKineticType)

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
