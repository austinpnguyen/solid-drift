# Scroll

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when animation or state should follow scroll position.

### `createScrollProgress(target?)`

Reports scroll progress as a 0-to-1 signal. Defaults to whole-page progress; pass an element ref accessor for element-scoped progress. Updates are rAF-throttled. SSR-safe: reports 0 on the server.

```tsx
import { createScrollProgress } from "solid-drift";

const progress = createScrollProgress(); // page progress
const section = createScrollProgress(() => sectionRef); // element progress
<div style={{ transform: `scaleX(${progress()})` }} />
```

### `createInView(ref, options?)`

Element visibility as a boolean signal, via IntersectionObserver. `threshold` (default 0.15) sets how much of the element must be visible; `once` (default true) stops observing after the first entry. SSR-safe: always `false` on the server.

```tsx
import { createInView, createTween } from "solid-drift";

let card: HTMLDivElement | undefined;
const inView = createInView(() => card);
const opacity = createTween(() => (inView() ? 1 : 0), { duration: 400 });
<div ref={card} style={{ opacity: opacity() }}>fades in on scroll</div>
```

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
