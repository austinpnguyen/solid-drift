# Comparison

How solid-drift stacks up against the alternatives. Written honestly:
every tool below is good at something, including the ones that beat
solid-drift in their lane.

## At a glance

| | solid-drift | Motion (Motion One) | solid-transition-group | CSS transitions |
|---|---|---|---|---|
| Paradigm | Signal-native primitives | Imperative `animate()` + WAAPI | CSS enter/exit components | Declarative CSS |
| SolidJS integration | First-class (signals, SSR-safe) | None (framework-agnostic) | First-class (official) | N/A |
| Bundle (gzipped) | ~53 KB full; 0.8-2.3 KB per primitive | ~2.3 KB mini; ~18-22 KB core | ~2 KB | 0 KB |
| Springs / physics | Yes (shared rAF loop) | Yes | No | No |
| Scroll-linked | Yes | Yes (native ScrollTimeline) | No | Limited |
| Gestures / drag | Yes | Yes | No | No |
| Enter / exit | Manual | `AnimatePresence` (React) | Yes (its whole job) | Manual classes |
| Layout (FLIP) | No | Yes | No | No |
| License | MIT | MIT | MIT | N/A |

## Motion (formerly Motion One)

[Motion](https://motion.dev) is the strongest general-purpose alternative.
Its `animate()` drives the Web Animations API, so the browser composites
on the GPU. The `motion/mini` entry is ~2.3 KB; the full core is ~18-22 KB.
30k+ GitHub stars, excellent docs, 300+ examples.

**Choose Motion when:**
- You want WAAPI hardware acceleration without thinking about it.
- You need FLIP layout animations or shared-element transitions.
- You are in React and want `AnimatePresence` for exit animations.
- You value the largest community and example library.

**Choose solid-drift when:**
- You are in SolidJS and want values as signals (`createSpring(source)`
  that you can compose, derive, and pass around like any other state.
- You want one shared rAF loop for hundreds of concurrent animations.
- You want SSR safety and reduced-motion handling built into every
  primitive rather than configured per call.

**Where Motion wins outright:** layout animations, exit orchestration in
React, community size, and WAAPI compositing. solid-drift has no FLIP
helper and no `AnimatePresence` equivalent; exit animations are manual.

## solid-transition-group

The [official](https://github.com/solidjs-community/solid-transition-group)
SolidJS package for enter/exit animations. You wrap content in
`<Transition name="slide-fade">` and write the CSS classes yourself.
~2 KB, zero learning curve if you know CSS transitions.

**Choose solid-transition-group when:**
- All you need is enter/exit fades and slides.
- You already have a CSS animation system and want SolidJS to hook
  elements in and out of it.
- You want the smallest possible addition to your bundle.

**Choose solid-drift when:**
- You need springs, tweens, or physics rather than fixed CSS curves.
- You animate values (numbers, colors, scroll positions), not just
  class toggles.
- You need drag, scroll-linked motion, or orchestrated sequences.

**Where solid-transition-group wins outright:** simplicity for the
enter/exit case, and bundle size when that is all you need. It does one
job with no abstraction overhead.

## CSS transitions and animations

Zero bytes, GPU-accelerated, no dependency. For a hover fade or a modal
slide-in, nothing beats them.

**Choose CSS when:**
- The animation is a fixed A-to-B with a known easing curve.
- You never need to interrupt, retarget, or read the animated value.
- Bundle budget is zero.

**Choose solid-drift when:**
- The target changes mid-flight (springs retarget; CSS restarts).
- You need the animated value in JS (parallax, counters, scrub).
- You sequence or stagger many elements.
- You want reduced-motion and SSR behavior handled uniformly.

**Where CSS wins outright:** cost. There is no cheaper animation than
the one the browser already ships.

## Honest weaknesses of solid-drift

- **No layout animations.** Motion's FLIP helpers have no equivalent
  here. Animating an element from one layout position to another
  requires manual measurement.
- **No exit orchestration.** There is no `AnimatePresence`: animating an
  element out before SolidJS removes it is manual work.
- **Smaller ecosystem.** Fewer examples, fewer Stack Overflow answers,
  one maintainer. Motion's 300+ examples are a real advantage when you
  are stuck.
- **Not framework-agnostic.** The signal API is the point, which means
  it only makes sense in SolidJS. Motion works anywhere.
- **Young.** The API is stabilizing (the `use*` to `create*` rename
  lands the deprecation path in 0.42.0), but 1.0 has not shipped.
