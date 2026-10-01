# Migrating from Framer Motion

You know Framer Motion. Here is what each piece is called in solid-drift,
with before/after examples. The mental model shift: Framer Motion animates
components; solid-drift animates values (signals) that you bind to the DOM
yourself.

## Quick mapping

| Framer Motion | solid-drift | Notes |
|---|---|---|
| `useSpring(source)` | `createSpring(source)` | Same idea; source is a signal accessor |
| `useTransform(v, [0,1], [0,100])` | derive with a function: `() => v() * 100` | Signals compose with plain functions |
| `animate()` (imperative) | `animate()` | Same name, signal-driven |
| `useAnimation()` controls | `AnimationControls` from `animate()` | `.start()`, `.stop()` |
| `<motion.div animate={{ x: 100 }} />` | `createTween`/`createSpring` + `style` binding | No motion components; bind values |
| `AnimatePresence` | `createPresence` | Enter/exit for conditional UI |
| `layoutId` shared layout | `createSharedLayout` | Same concept, signal-driven |
| `useScroll()` | `createScrollProgress` | Scroll-linked values |
| `useInView()` | `createInView` | IntersectionObserver as a signal |
| `useDrag` / `drag` prop | `createDrag` | Pointer drag with constraints |
| `whileHover` / `whileTap` | `createHover` / `createPress` | Hover and press states |
| `useTime`, `useVelocity` | `createVelocity` | Velocity of a signal |
| `staggerChildren` | `createStagger` | Per-index delays |
| `useReducedMotion()` | `createPrefersReducedMotion()` | Same; also `usePrefersReducedMotion` alias |
| `Reorder.Group` | manual with `createDrag` + `animateFlip` | No built-in reorder component |
| `useMotionValueEvent` | `createEffect` on the signal | Signals are already observable |

## Before / after

### Spring a value

```tsx
// Framer Motion
import { useSpring, useMotionValue } from "framer-motion";
const x = useMotionValue(0);
const springX = useSpring(x, { stiffness: 300, damping: 30 });
// <motion.div style={{ x: springX }} />
```

```tsx
// solid-drift
import { createSignal } from "solid-js";
import { createSpring } from "solid-drift";
const [target, setTarget] = createSignal(0);
const x = createSpring(target, { stiffness: 300, damping: 30 });
// <div style={{ transform: `translateX(${x()}px)` }} />
```

### Enter animation on mount

```tsx
// Framer Motion
// <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} />
```

```tsx
// solid-drift
import { createSignal, onMount } from "solid-js";
import { createSpring, createTween } from "solid-drift";
const [shown, setShown] = createSignal(false);
onMount(() => setShown(true));
const y = createSpring(() => (shown() ? 0 : 24));
const opacity = createTween(() => (shown() ? 1 : 0), { duration: 400 });
// <div style={{ transform: `translateY(${y()}px)`, opacity: opacity() }} />
```

### Exit animation

```tsx
// Framer Motion
// <AnimatePresence>{show && <motion.div exit={{ opacity: 0 }} />}</AnimatePresence>
```

```tsx
// solid-drift
import { createPresence } from "solid-drift";
const presence = createPresence({ when: show, exitDuration: 200 });
const opacity = createTween(() => (presence.exiting() ? 0 : 1), {
  duration: 200,
});
// <Show when={presence.mounted()}>
//   <div style={{ opacity: opacity() }}>...</div>
// </Show>
```

### Scroll-linked parallax

```tsx
// Framer Motion
// const { scrollYProgress } = useScroll();
// const y = useTransform(scrollYProgress, [0, 1], [0, -100]);
```

```tsx
// solid-drift
import { createScrollProgress } from "solid-drift";
const progress = createScrollProgress();
const y = () => progress() * -100;
```

### Drag with constraints

```tsx
// Framer Motion
// <motion.div drag dragConstraints={{ left: 0, right: 300 }} />
```

```tsx
// solid-drift
import { createDrag } from "solid-drift";
let el!: HTMLDivElement;
const drag = createDrag(() => el, { axis: "x", min: 0, max: 300 });
// <div ref={el} style={{ transform: `translateX(${drag.x()}px)` }} />
```

## What has no direct equivalent

- **Motion components** (`motion.div`): solid-drift has no component
  wrappers. You bind signal values to `style` yourself, or use the
  `drift` directive (`use:drift={{ x, opacity }}`).
- **`layout` prop / FLIP**: `createSharedLayout` covers shared-element
  transitions; general layout animation is manual (see
  `docs/comparison.md` for this honest gap).
- **`Reorder`**: build with `createDrag` plus `animateFlip`.

## Tips

- Start from the [starter template](../templates/solidstart-starter):
  `npx degit austinpnguyen/solid-drift/templates/solidstart-starter my-app`.
- Springs retarget mid-flight for free: just `setTarget(newValue)`.
  No need to restart or re-create anything.
- Every primitive is SSR-safe, so the patterns above hydrate cleanly in
  SolidStart. See `docs/ssr.md`.
