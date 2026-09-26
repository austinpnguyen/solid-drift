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

  // Springs follow the signal with physics; tweens use duration + easing.
  const y = createSpring(() => (open() ? 0 : 24), { stiffness: 170, damping: 26 });
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

### Easings

Named easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeOutExpo`, `easeOutBack`, plus `cubicBezier(x1, y1, x2, y2)` for CSS-style curves. Pass a name or a custom `(t) => number` function anywhere an easing is accepted.

## How it works

One shared `requestAnimationFrame` loop drives every animation in the app, so hundreds of springs cost a single rAF tick per frame. Springs integrate with semi-implicit Euler; tweens sample an easing curve. Everything is SSR-safe (animations simply don't run on the server).

## License

MIT © Austin Nguyen
