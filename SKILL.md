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
- `createTiltCard(ref, options?)` - holographic trading-card tilt: `{ rotateX, rotateY, glareX, glareY, holoAngle, shine, scale, hovering, transform }`. Bind glare/shine/holo overlays for the foil look.
- `createTrail(source, options?)` - delayed signal replay.
- `createGravity(options?)` - gravity simulation.
- `createPendulum(ref, options?)` - pendulum swing.
- `createFling(ref, options?)` - fling with momentum.
- `animateFlip(ref, mutate, options?)` - FLIP layout animation.

**Gesture**

- `createDrag(ref, options?)` - pointer drag with spring settle, constraints, elastic overshoot, momentum. Returns `{ x, y, status }`.
- `createSwipe(ref, options?)` - discrete swipe recognition (swipe-to-dismiss, carousels) with touch parity via Pointer Events: `{ direction, distance, velocity, duration }`, per-direction callbacks, `lastSwipe` signal.
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
- `createSpecPlayer(spec, refs, hooks?)` - play a validated spec against a refs map. Returns `{ play, stop, status, scene }`. `hooks.onAgentTxStep(proposal, tx)` wires host approval UI for `agentTx` steps.

**Web3**

- `createTxLifecycle(options?)` - transaction state machine (`idle`, `signing`, `pending`, `confirming`, `success`, `failed`) with spring-smoothed `progress()`. Feed wagmi/viem-style state via `source`.
- `createTicker(source, ref, options?)` - rolling-digit price ticker. Returns `{ display, direction }`.
- `createMintReveal(ref, options?)` - anticipation shake, rotateY flip, `onFlip` at the midpoint. Returns `{ play, reset, status }`.
- `createDepixelate(image, canvas, options?)` - pixel-to-sharp NFT reveal on a canvas: `{ pixelSize, progress, status, play, complete, reset, stop }`. Teaser frame self-paints on image load.
- `createConnectButton(ref, options?)` - magnetic connect button with copy tick and chain pulse. Returns `{ copyTick, chainPulse, status }`.
- `createAgentTx(options?)` - AI proposes, user approves, tx executes: `idle`, `proposed`, `approved`, `executing`, `confirmed`, `rejected`, `failed`. Invalid transitions are no-ops. Returns `{ state, proposal, tx, propose, approve, reject, execute, reset, progress }`.

**Web3 data** (read-only, zero deps, SSR-safe, all share `{ data, error, status, retry, abort }`)

- `createPoll(fetcher, options?)` - backoff polling infra: immediate fetch, `interval` (30s), error backoff x2 up to `maxInterval` (5min).
- `createTokenPrice(tokenId, options?)` - CoinGecko price signal (60s default). Returns `{ price, change24h }` plus poll controls.
- `createPriceChange(source, options?)` - percent change of any numeric signal over a rolling window. Returns `{ change, reset }`.
- `createPriceCompare(a, b)` - two price signals compared: `{ ratio, diffPercent, leader }`.
- `createGasPrice(options?)` - `eth_gasPrice` every 15s. Returns `{ wei, gwei }`.
- `createBalance(address, options?)` - native or ERC20 balance every 20s. Returns `{ balance, formatted }`.
- `createTxReceipt(hash, options?)` - polls every 4s until the receipt lands, then stops. Returns `{ receipt, mined }`.
- `createBlockNumber(options?)` - latest block every 12s, chain-health heartbeat. Returns `{ blockNumber }`.
- `createChainlinkPrice(feed, options?)` - on-chain Chainlink feed, `decimals()` once then `latestRoundData()` every 30s. Returns `{ price }`.
- `createNFTMetadata(contract, tokenId, options?)` - `tokenURI` on-chain plus JSON metadata, one-shot with `retry`, `ipfs://` rewritten via gateway. Returns `{ metadata, image }`.
- `createENS(address, options?)` - reverse-resolves via the ENS registry, one-shot with `retry`. Returns `{ name }`.
- `createIdenticon(address, options?)` - deterministic SVG identicon data URI, pure computation, SSR-safe.
- `CHAINS` / `createChain(id)` - registry of 7 EVM chains (name, currency, explorer, RPC).
- `shortenAddress(address, chars?)`, `isAddress(value)`, `formatUnits(value, decimals?)`, `parseUnits(value, decimals?)` - pure BigInt-safe helpers.

**Feedback**

- `createToast(options?)` - signal-native toast queue, you render the UI. Returns `{ toasts, toast, info, success, warning, error, dismiss, clear }`.

**Fun**

- `createSlotMachine(options)` - gacha reels with momentum spin, staggered stops, riggable landing. Returns `{ values, result, status, spin, stop, reset }`.
- `createRedPacket(options?)` - red packet ceremony: tap to open, coin burst physics, amount count-up. Returns `{ status, coins, revealed, open, reset }`.
- `createConfetti(canvas, options?)` - canvas confetti bursts (gravity, drag, sway, paper flutter) on the shared clock. `burst(origin?)`, `clear()`, `active()`. Reduced motion skips particles but still calls `onDone`.
- `createEmojiBurst(canvas, options?)` - same particle physics with emoji glyphs. `{ active, burst, clear }`.
- `createScratch(canvas, options?)` - scratch-off foil cover with `destination-out` erasing, alpha-sampled `cleared()` fraction, `onComplete` past `threshold`, custom `paint` cover art. `{ cleared, done, reset }`.
- `createDebounced(source, delay)` / `createThrottled(source, interval)` - signal transforms: debounced waits for a pause (trailing edge), throttled is leading + collapsed trailing. Both return `Accessor<T>`.
- `createLocalStorage(key, initialValue, options?)` - persisted signal: reads on creation, writes through on set, syncs across tabs via `storage` events, custom serialize/deserialize. `{ value, set, remove }`.
- `createMediaQuery(query)` - live boolean signal tracking a CSS media query.
- `createClickOutside(ref, handler, options?)` - outside-press dismissal (default `pointerdown`, shadow-DOM aware). No-op on server.
- `createScrollLock()` - body scroll lock with nested reference counting; restores original overflow. `{ locked, lock, unlock }`.
- `createInfiniteScroll(ref, options)` - IntersectionObserver sentinel with `threshold` prefetch and reactive `disabled` kill switch; calls `onLoadMore` on approach.
- `createHaptic(options?)` - Vibration API wrapper: `{ supported, vibrate, light, medium, heavy, success, warning, error, morse }`; morse encodes `.`/`-`/` `//` gaps; `hapticPatterns` one-shot presets; `enabled` boolean-or-signal master switch. Tactile so it fires under reduced motion; no-op where unsupported.
- `createHapticBeat(haptic, options?)` - 16-step haptic sequencer on the shared clock (`"x"` hit, `"X"` accent); `{ playing, bpm, step, start, stop, toggle, setBpm }`; `hapticBeatPresets` ships heartbeat, metronome, ticks, pulse.
- `createBottomSheet(ref, options?)` - draggable bottom sheet on `createDrag`: `{ open, snapIndex, y, status, openSheet, close, snapTo }`; `snapPoints` are height fractions (clamped/sorted, default `[0.5, 1]`); release target is nearest snap to `y + velocity * 0.18`, dismiss past midpoint or on fast downward flick; rubber-banded 1:1 tracking while dragging; `measureRef` when the drag ref is a handle.
- `createChatModel(options)` - streaming chat over `openai` / `anthropic` / `meta` (Llama API `/compat/v1`) or a custom `{ kind: "custom", stream, parseDelta }`: `{ messages, streamingText, status, error, send, stop, reset }`; deltas append to a live assistant message; Anthropic needs `maxTokens` (default 1024) and, from browsers, a proxy/`baseUrl` since api.anthropic.com sends no CORS headers.
- `createSSE(url, options?)` - fetch-based SSE client (any method, custom headers): `{ status, events, lastEvent, error, connect, disconnect }`; full SSE framing; manual reconnect; SSR-safe.
- `createVoiceState()` - voice turn state machine: `idle` / `listening` / `thinking` / `speaking` with `toIdle` / `toListening` / `toThinking` / `toSpeaking`.
- `createMicLevel(options?)` - mic volume meter (`getUserMedia` + `AnalyserNode`, smoothed 0..1 `level`); `{ active, supported, analyser, error, start, stop }`; analyser wires into `createWaveform`.
- `createSpeech(options?)` - Web Speech API recognition (webkit fallback): `{ supported, listening, transcript, interim, error, start, stop, reset }`; continuous sessions auto-restart.
- `createWaveform(canvas, options)` - DPR-aware canvas renderer for an analyser (`line` wave or `bars` spectrum) on the shared clock; throttled under reduced motion.
- `createTTS(options?)` - `speechSynthesis` by default, cloud upgrade via `provider: { speak(text, { signal }) }`; `{ supported, speaking, voices, speak, cancel }`.
- `createThinking(options?)` - animated thinking indicator cycling phrases and dots: `{ text, running, start, stop }`.
- `createPrompt(options?)` - voice-enabled prompt input: `{ value, setValue, listening, interim, supported, toggleMic, submit, clear }`; mic finals append to the value; pairs with `createChatModel`.
- `createBattery()` - Battery Status API: `{ supported, charging, level, chargingTime, dischargingTime, error }`; level 0..1; live change events.
- `createNetwork()` - `navigator.onLine` + Network Information API: `{ online, effectiveType, downlink, rtt, saveData, supported }`.
- `createWakeLock()` - Screen Wake Lock: `{ supported, active, error, request, release }`; auto re-acquires on visibility return.
- `createContactPick()` - Contact Picker API: `{ supported, contacts, error, pick }`; `pick({ multiple })` resolves normalized `{ name, tel, email }` arrays.
- `createOTP()` - WebOTP SMS codes: `{ supported, code, error, wait, abort }`; `wait({ transport })` resolves the code or null on abort.
- `createShare()` - Web Share API: `{ supported, canShare, error, share }`; user dismissal is not an error.
- `createNFC()` - Web NFC (Chrome Android, secure context): `{ supported, scanning, message, error, scan, write, abort }`; decoded text/url records + serialNumber.
- `createTorch()` - camera flashlight: `{ supported, on, error, attach, set, toggle }`; `attach(trackOrStream)` checks the `torch` capability.
- `createGyro()` - device orientation: `{ supported, needsPermission, alpha, beta, gamma, absolute, listening, error, requestPermission, start, stop }`; iOS permission flow built in.
- `createShake(options?)` - shake detection from devicemotion: `{ supported, needsPermission, listening, shakes, error, requestPermission, start, stop }`; threshold/cooldown/onShake options.
- `createScanline(options?)` - QR viewfinder scan line: `{ progress, running, start, stop }`; 0..1 sweep on the shared clock, down/up/alternate; freezes under reduced motion.
- `createOptimistic(initial, apply)` - optimistic updates with rollback: `{ value, setBase, pending, pendingCount, error, commit, reset }`; `commit(update, task)` applies instantly, promotes to base on success, rolls back and rethrows on failure; write `apply` idempotently.
- `createSkeleton(options?)` - loading placeholder with flicker protection: `{ loading, show, phase, setLoading }`; `show()` after `delay`, held for `minVisible`; `phase()` shimmer sweep on the shared clock, frozen under reduced motion.
- `createScrollSpy(options)` - nav scroll spy: `{ active, scrollTo, refresh }`; deepest section at/above the offset line; id list or accessor; custom container; rAF-throttled; smooth scrollTo (auto under reduced motion); onChange on change only.
- `createCopy(options?)` - copy to clipboard: `{ copied, error, copy, reset }`; async Clipboard API with execCommand fallback; `copied()` true for `resetDelay` ms for transient feedback.
- `createCountdown(target, options?)` - countdown to a date/timestamp/accessor: `{ remaining, days, hours, minutes, seconds, done, running, start, stop, reset }`; wall-clock based; shared-clock recompute throttled to `interval`; stops at zero; onDone fires once.

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

Rules: `primitive` is one of `kineticType`, `streamReveal`, `camera`, `colorShift`, `transition`, `beat`, `agentTx`, `txReceipt`. `target` must be a key the host app provides in its refs map (not needed for `agentTx` / `txReceipt`). `options` must match that primitive's documented options. `agentTx` needs `to` (0x address) and `description`; it proposes the transaction and waits for the host's `hooks.onAgentTxStep` to approve and execute it. `txReceipt` needs `hash` and waits for the transaction to mine (optional `timeout` ms, `endpoint`). Keep scenes short; add a `duration` budget to any scene that should not block the reel. Validate with `parseDriftSpec` before playing.

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
