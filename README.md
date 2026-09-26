# solid-drift

Signal-native animation for SolidJS. Animate **values, not elements**: springs and tweens follow your signals, and retargeting mid-flight is seamless by design — no restarts, no jumps.

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
| `onRest`    | —       | Called once the spring settles        |

### `createTween(source, options?)`

Returns a signal that tweens toward `source` over a fixed duration. Interrupting retargets from the current value.

| Option       | Default          | Description                    |
| ------------ | ---------------- | ------------------------------ |
| `duration`   | `300`            | Duration in milliseconds       |
| `delay`      | `0`              | Delay before starting (ms)     |
| `easing`     | `"easeOutCubic"` | Easing function or name        |
| `onComplete` | —                | Called when the tween finishes |

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

### Easings

Named easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeOutExpo`, `easeOutBack` — plus `cubicBezier(x1, y1, x2, y2)` for CSS-style curves. Pass a name or a custom `(t) => number` function anywhere an easing is accepted.

## How it works

One shared `requestAnimationFrame` loop drives every animation in the app, so hundreds of springs cost a single rAF tick per frame. Springs integrate with semi-implicit Euler; tweens sample an easing curve. Everything is SSR-safe (animations simply don't run on the server).

## License

MIT © Austin Nguyen
