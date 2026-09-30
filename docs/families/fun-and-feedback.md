# Fun and feedback

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when you want delight: toasts, gacha, confetti, scratch-offs.

### `createToast(options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/fun/createToast)

A signal-native toast queue with choreographed lifecycle. The primitive owns timing and state; you own the rendering, so no component opinions leak into your design system. Each toast moves through `"entering"` to `"visible"` to `"leaving"` to removed on the shared animation clock: bind `state` to CSS classes or drift values for enter/exit motion without any timers of your own.

```tsx
import { createToast } from "solid-drift"

const { toasts, success, dismiss } = createToast()
success("Payment sent", { description: "0.5 SOL to alice.sol" })

<For each={toasts()}>
  {(t) => (
    <div
      class="toast"
      classList={{
        "toast-enter": t.state === "entering",
        "toast-leave": t.state === "leaving",
      }}
    >
      <strong>{t.title}</strong>
      {t.description && <p>{t.description}</p>}
      <button onClick={() => dismiss(t.id)}>Dismiss</button>
    </div>
  )}
</For>
```

| Option     | Default | Description                                                      |
| ---------- | ------- | ---------------------------------------------------------------- |
| `max`      | `5`     | Max toasts in the queue; older ones are dismissed first          |
| `enterMs`  | `250`   | Enter transition time in milliseconds                            |
| `leaveMs`  | `200`   | Leave transition time in milliseconds                            |
| `duration` | `4000`  | Default auto-dismiss time in milliseconds                        |

Push helpers: `toast(title, options?)`, `info(...)`, `success(...)`, `warning(...)`, `error(...)`. Each returns the toast id. Per-toast options: `kind`, `description`, `duration` (ms; `0` means sticky). `dismiss(id)` starts the leave transition for one toast; `clear()` dismisses all. SSR-safe: toasts pushed on the server start `"visible"`. Under reduced motion the enter and leave transitions are instant, but auto-dismiss timing still applies.

### `createSlotMachine(options)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/fun/createSlotMachine)

Gacha slot machine: reels launch fast, decelerate with momentum, and stop left to right. Spin-to-mint theater for reveals, loot boxes, and prize draws. Pass `landing` to `spin()` when the outcome is already decided (the minted NFT, the prize): the reels still spin with full drama and land exactly on your symbols. Omit it for a fair random spin.

```tsx
import { createSlotMachine } from "solid-drift"

const machine = createSlotMachine({
  symbols: ["🍒", "⭐", "💎", "🚀"],
  onTick: (reel) => navigator.vibrate?.(10), // haptic tick per symbol
  onDone: (result) => console.log("minted:", result),
})

<button onClick={() => machine.spin()}>SPIN</button>
<div>{machine.values().join(" ")}</div>
```

Options: `symbols` (required, at least 2), `reels` (default `3`), `duration` (ms for the first reel, default `1400`), `stagger` (extra ms per subsequent reel, default `500`), `minSpins` (full rotations before stopping, default `3`), `easing` (default `"easeOutQuart"`), `onTick(reel, symbol)`, `onDone(result)`. Returns `{ values, result, status, spin, stop, reset }`: `values()` is the visible symbol per reel, `result()` the final symbols of the last spin, `status()` is `"idle"`, `"spinning"`, or `"done"`. `stop()` halts at the current symbols; `reset()` returns to idle. SSR-safe and reduced-motion safe: `spin()` jumps straight to the result.

### `createRedPacket(options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/fun/createRedPacket)

Crypto red packet ceremony: tap to open, coins burst out with physics, the amount counts up. The primitive owns the ceremony state machine (`"sealed"`, `"opening"`, `"bursting"`, `"revealed"`) and the coin particle physics; you render the envelope and the coins. Each coin carries position, rotation, size, opacity, and its share of the total, split randomly like a real red packet grab.

```tsx
import { createRedPacket } from "solid-drift"

const packet = createRedPacket({ amount: 88, coins: 14 })

<button onClick={() => packet.open()}>
  {packet.status() === "sealed"
    ? "🧧 Tap to open"
    : `$${packet.revealed().toFixed(2)}`}
</button>
<For each={packet.coins()}>
  {(coin) => (
    <div
      class="coin"
      style={{
        transform: `translate(${coin.x}px, ${coin.y}px) rotate(${coin.rotation}deg)`,
        opacity: coin.opacity,
        width: `${coin.size}px`,
      }}
    />
  )}
</For>
```

Options: `coins` (default `12`), `amount` (total, default `88`), `spread` (burst size in px, default `160`), `gravity` (px/s^2, default `900`), `openDuration` (ms, default `500`), `burstDuration` (ms, default `1600`), `revealDuration` (ms, default `800`), `onOpen`, `onReveal(amount)`. Returns `{ status, coins, revealed, open, reset }`. SSR-safe and reduced-motion safe: `open()` jumps straight to revealed with no burst.

### `createConfetti(canvas, options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/fun/createConfetti)

Canvas confetti bursts: celebration physics with gravity, drag, sway, and tumbling paper flutter, rendered on the shared animation clock. Give it a canvas (a fullscreen fixed overlay with `pointer-events: none` is the classic setup) and call `burst()` from party moments: mints, wins, onboarding completions. Bursts accumulate, so rapid celebrations stack instead of replacing. The canvas is fitted to its CSS size times the device pixel ratio automatically.

```tsx
import { createConfetti } from "solid-drift"

let cvs!: HTMLCanvasElement
const confetti = createConfetti(() => cvs, {
  onDone: () => console.log("party over"),
})
<canvas ref={cvs} style={{ position: "fixed", inset: "0", "pointer-events": "none" }} />
<button onClick={() => confetti.burst()}>Celebrate</button>
<button onClick={() => confetti.burst({ x: 0.2, y: 0.8 })}>Side popper</button>
```

Options: `count` (particles per burst, default `120`), `colors` (default a festive palette), `spread` (launch cone in degrees around straight up, default `70`), `power` (launch speed in px/s, default `900`), `gravity` (px/s^2, default `1100`), `drag` (default `1.2`), `size` ([min, max] px, default `[6, 12]`), `shapes` (default `["rect", "circle"]`), `lifetime` (ms, default `2600`), `onDone` (called when the last particle fades). Returns `{ active, burst, clear }`: `burst(origin?)` fires from a normalized origin (default `{ x: 0.5, y: 0.6 }`), `clear()` removes every particle immediately. SSR-safe: `burst()` is a no-op on the server. Under reduced motion `burst()` skips the particles but still calls `onDone`, so chained logic (show the prize after the celebration) keeps working. Tip: pair with `useLowPowerMode` to drop the count on weak devices.

### `createEmojiBurst(canvas, options?)`

Emoji celebration burst: the same particle physics as confetti, but the particles are emoji glyphs that rise, tumble gently, and fade. Reactions, likes, level-ups, chat celebrations. Same canvas setup, same safety rules.

```tsx
import { createEmojiBurst } from "solid-drift"

let cvs!: HTMLCanvasElement
const burst = createEmojiBurst(() => cvs, { emoji: ["❤️", "🔥"] })
<canvas ref={cvs} style={{ position: "fixed", inset: "0", "pointer-events": "none" }} />
<button onClick={() => burst.burst()}>Send love</button>
```

Options: `emoji` (default `["🎉", "✨", "💥", "⭐", "💖", "🥳"]`), `count` (default `24`), `power` (default `650`), `gravity` (default `700`: floatier than confetti), `drag` (default `1.6`), `size` ([min, max] px, default `[24, 48]`), `spread` (default `90`), `lifetime` (default `1800`), `onDone`. Returns `{ active, burst, clear }`.

### `createScratch(canvas, options?)`

Scratch-off cover: a lottery-ticket foil over hidden content. The canvas paints an opaque cover (silver holographic foil by default, or your own art via `paint`) and pointer drags erase through it with `destination-out`. The cleared fraction is sampled from the alpha channel on a throttled cadence, and `onComplete` fires once past `threshold`. Layer it over the prize with absolute positioning, and set `touch-action: none` on the canvas so touch scratches do not scroll the page.

```tsx
import { createScratch } from "solid-drift"

let foil!: HTMLCanvasElement
const scratch = createScratch(() => foil, {
  onComplete: () => console.log("revealed!"),
})
<div style={{ position: "relative" }}>
  <div>YOU WON 50 STARS</div>
  <canvas ref={foil} style={{ position: "absolute", inset: "0", "touch-action": "none" }} />
</div>
```

Options: `threshold` (fraction cleared to complete, default `0.45`), `brush` (eraser radius in px, default `26`), `paint(ctx, w, h)` (custom cover art), `onComplete`. Returns `{ cleared, done, reset }`: `cleared()` is the 0..1 fraction erased, `reset()` repaints the cover. Scratching is direct manipulation, so it works identically under reduced motion. SSR-safe: `cleared()` stays 0.
