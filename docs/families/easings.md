# Easings

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


### Easings

Named easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeOutExpo`, `easeOutBack`, plus the cartoon set: `easeInBack` (anticipation dip before movement), `easeInOutBack` (wind-up, overshoot, settle), `easeOutElastic` (decaying rubber-band oscillation), `easeOutBounce` (shrinking cartoon bounces). Also `cubicBezier(x1, y1, x2, y2)` for CSS-style curves. Pass a name or a custom `(t) => number` function anywhere an easing is accepted.

### `createCustomEase(path)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/easings/createCustomEase)

Build a custom easing from an SVG path describing a curve in the 0..1 x 0..1 box, like GSAP's CustomEase.

```ts
import { createCustomEase } from "solid-drift";

const snap = createCustomEase("M0,0 C0.2,0 0.4,1 1,1");
animate(0, 100, { easing: snap, duration: 600, onUpdate });
```

The path is sampled into a 200-entry lookup table mapping x to y. X must increase monotonically (the curve must be a function of x); otherwise a clear error is thrown. Works anywhere an easing is accepted. Requires DOM.
