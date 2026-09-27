# solid-drift skill

Use this skill when writing SolidJS animation code with `solid-drift`, or when generating `DriftSpec` JSON for it.

## 1. Overview

`solid-drift` is a signal-native animation library for SolidJS: zero dependencies, SSR-safe, and respectful of `prefers-reduced-motion`. One shared `requestAnimationFrame` clock drives every animation in the app.

Core philosophy: **animate values, not elements**. Primitives return signals and control handles; your view binds them with `style={{ transform: x() }}`. The library never takes over your DOM tree.

## 2. Install and import

```bash
npm install solid-drift
```

```ts
import { createSpring, createKineticType, createTxLifecycle } from "solid-drift";
```

Import from the package root only. Never deep-import (`solid-drift/dist/...`). All public APIs are re-exported from the root.

## 3. API cheat sheet

One line per primitive. Full docs with examples live in `README.md`.

**Core**

- `createSpring(source, options?)` - spring-physics signal.
- `createTween(source, options?)` - eased tween signal.
- `animate(from, to, options?)` - imperative animation, returns `{ stop, finished }`.
- `drift` - directive applying a spring/tween to an element.
- `springPresets` - `gentle`, `default`, `snappy`, `wobbly`, `molasses`.
- `createStagger(count, options?)` - staggered delays.
- `createTimeline(steps)` - sequential animation steps.

**Scroll**

- `createScrollProgress(options?)` - page or element scroll progress.
- `createHorizontalScroll(options)` - pinned horizontal scroll section.
- `createScrub(progress, keyframes, options?)` - progress through eased keyframes.
- `createScrollColor(stops, options?)` - scroll-driven color.
- `createScrollTracking(options?)` - scroll velocity/direction.
- `createScrollLine(options?)` - scroll progress line.
- `createInView(ref, options?)` - element visibility signal.

**Pointer and physics**

- `createVelocity(source?, options?)` - signal velocity.
- `createMagnetic(ref, options?)` - pointer attraction.
- `createTilt(ref, options?)` - 3D pointer tilt.
- `createTrail(source, options?)` - delayed signal replay.
- `createGravity(options?)` - gravity simulation.
- `createPendulum(ref, options?)` - pendulum swing.
- `createFling(ref, options?)` - fling with momentum.
- `animateFlip(ref, mutate, options?)` - FLIP layout animation.

**Gesture**

- `createDrag(ref, options?)` - pointer drag with spring settle, constraints, elastic overshoot, momentum. Returns `{ x, y, status }`.
- `createSharedLayout(ref, options)` - `layoutId`-style shared-element transition across mounts. Returns `{ x, y, scaleX, scaleY, flying }`.

**Cartoon**

- `createSquashStretch(ref, options)` - squash and stretch deform.
- `createFollowThrough(source, options?)` - overshoot follow-through.
- `createAnticipation(from, to, options?)` - wind-up before the main move.
- `createWobble(ref?, options?)` - springy wobble.

**Typography**

- `createFontSwap(ref, options)` - font swap transition.
- `createTyping(ref, options?)` - typewriter effect.
- `createTextPhysics(ref, options?)` - physics-driven text.
- `createTextTunnel(ref, options?)` - tunnel perspective text.
- `createTextCutout(ref, options?)` - cutout text effect.
- `createTextGradient(ref, options?)` - animated gradient text.
- `createTextScramble(ref, options?)` - scramble decode effect.
- `createTextWave(ref, options?)` - wave motion across text.
- `createCountUp(source, options?)` - eased number tween as a formatted string.

**Motion graphics**

- `createKineticType(ref, options?)` - staggered kinetic typography. `from` accepts `variance` (0 to 1) and `seed` for deterministic per-unit jitter.
- `createScenePlayer(scenes)` - ordered scene orchestrator.
- `createShowreel(scenes)` - scene player with `kind` labels (`title`, `camera`, `color`, `cut`, `custom`).
- `createCamera(keyframes, options)` - pan/zoom through keyframes.
- `createColorShift(stops, options?)` - time-based color interpolation.
- `createTransition(options?)` - match-cut scene handoffs (`cut`, `fade`, `slide`, `wipe`).
- `createBeat(options?)` - beat clock (`bpm`, `beatsPerBar`).
- `createBeatCuts(beat, player, options?)` - advance the player every N beats (default: every bar).

**Agent UI**

- `createStreamReveal(ref, options?)` - streaming text reveal. Returns `{ push, complete, reset, status, pending }`.
- `createAgentState(options?)` - agent state machine (`idle`, `thinking`, `streaming`, `tool-call`, `done`, `error`). Returns `{ state, prev, set, reset, is }`.
- `parseDriftSpec(input)` - validate a DriftSpec JSON object, throws `DriftSpecError` with an exact path.
- `createSpecPlayer(spec, refs)` - play a validated spec against a refs map. Returns `{ play, stop, status, scene }`.

**Web3**

- `createTxLifecycle(options?)` - transaction state machine (`idle`, `signing`, `pending`, `confirming`, `success`, `failed`) with spring-smoothed `progress()`. Feed wagmi/viem-style state via `source`.
- `createTicker(source, ref, options?)` - rolling-digit price ticker. Returns `{ display, direction }`.
- `createMintReveal(ref, options?)` - anticipation shake, rotateY flip, `onFlip` at the midpoint. Returns `{ play, reset, status }`.
- `createConnectButton(ref, options?)` - magnetic connect button with copy tick and chain pulse. Returns `{ copyTick, chainPulse, status }`.

**Feedback**

- `createToast(options?)` - signal-native toast queue, you render the UI. Returns `{ toasts, toast, info, success, warning, error, dismiss, clear }`.

**Fun**

- `createSlotMachine(options)` - gacha reels with momentum spin, staggered stops, riggable landing. Returns `{ values, result, status, spin, stop, reset }`.

**Utilities**

- `usePrefersReducedMotion()` / `prefersReducedMotion()` - reactive / one-shot reduced-motion check.
- `useLowPowerMode(options?)` / `isLowPowerMode(options?)` - reactive / one-shot low-power signal: reduced motion + reduced data + low-end device.
- Easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeOutExpo`, `easeOutBack`, `easeInBack`, `easeInOutBack`, `easeOutElastic`, `easeOutBounce`, plus `cubicBezier(x1, y1, x2, y2)`.

## 4. Recipes

**Streaming chat reply**

```tsx
const stream = createStreamReveal(() => out, { batchMs: 120 });
for await (const chunk of readChunks(response)) stream.push(chunk);
await stream.complete();
```

**Agent status pill**

```ts
const agent = createAgentState({ onEnter: (s) => pillFor(s) });
// thinking -> wobble the typing dots
// streaming -> push chunks into createStreamReveal
// tool-call -> createTransition overlay
// done | error -> createColorShift the status pill
```

**Transaction button**

```ts
const tx = createTxLifecycle({ source: () => wagmiState() });
tx.set("signing"); // the moment the wallet prompt opens
// progress() drives a progress ring; state() drives the label
```

**Price ticker**

```tsx
const ticker = createTicker(priceSignal, () => el, { decimals: 2 });
// display() for aria-labels and SSR; direction() for up/down styling
```

**Generating a DriftSpec (for code-writing agents)**

Return ONLY this JSON shape:

```json
{
  "version": 1,
  "scenes": [
    {
      "primitive": "kineticType",
      "target": "title",
      "options": { "duration": 600, "stagger": 40, "from": { "y": 40 } }
    },
    { "primitive": "colorShift", "options": { "stops": [{ "at": 0, "color": "#000000" }, { "at": 1, "color": "#ffffff" }], "duration": 1200 }, "duration": 1200 }
  ]
}
```

Rules: `primitive` is one of `kineticType`, `streamReveal`, `camera`, `colorShift`, `transition`, `beat`. `target` must be a key the host app provides in its refs map. `options` must match that primitive's documented options. Keep scenes short; add a `duration` budget to any scene that should not block the reel. Validate with `parseDriftSpec` before playing.

## 5. SSR and reduced-motion rules

- Every primitive is SSR-safe: on the server, animations do not run and signals hold their final or initial static value. Never guard with your own `typeof window` check; the primitive already does.
- Under `prefers-reduced-motion`, motion primitives jump to their end state. State machines (`createAgentState`, `createTxLifecycle`, `createBeat`) keep working because state is logic, not motion.
- `createBeat` keeps ticking under reduced motion; callbacks decide what that means visually.
- Test with fake timers and a stubbed `requestAnimationFrame`; keep the rAF queue module-level and never clear it between tests, or the shared engine strands.

## 6. Anti-patterns

- Do not animate layout properties (`width`, `top`, `left`). Use `transform` and `opacity`; they stay on the compositor.
- Do not create your own `requestAnimationFrame` loops. Use the shared engine (`schedule` from the library, or any primitive); hundreds of animations cost one rAF tick per frame.
- Do not write your own text splitter. `createKineticType`, `createStreamReveal`, and the typography family split text for you, deterministically.
- Do not pass a new options object on every render to a primitive created once; create the primitive once and drive it through signals.
- Do not deep-import from `solid-drift/dist`. Import from the package root.

## 7. MCP outline (future)

No MCP server ships with the library. When one is built, it exposes two tools:

- `drift_lookup(name)` - return the README documentation section for one primitive (signature, example, reduced-motion note).
- `drift_spec_validate(spec)` - validate a DriftSpec JSON object; return `{ ok: true }` or `{ ok: false, path, message }` with the exact scene/option path of the first error.

Both tools are pure and stateless; the server needs no browser and no wallet connection.
