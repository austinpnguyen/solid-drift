# Recipes

Practical combinations of multiple solid-drift primitives. Each recipe
solves a real UI problem by composing two or more primitives. Copy the
pattern, adapt the parameters.

## Animated price ticker with trend flash

Combine `createTicker` (digit roll) with `createSpring` (smooth scale
pulse) for a price display that rolls digits and gently pops on change.

```tsx
import { createSignal, createEffect } from "solid-js";
import { createTicker, createSpring } from "solid-drift";

function PriceDisplay() {
  const [price, setPrice] = createSignal(48210.5);
  let el!: HTMLSpanElement;
  const ticker = createTicker(price, () => el, { decimals: 2 });
  const [scale, setScale] = createSignal(1);
  const pop = createSpring(scale, { stiffness: 400, damping: 18 });

  createEffect(() => {
    // Re-run on every price change: quick scale pulse.
    price();
    setScale(1.08);
    requestAnimationFrame(() => setScale(1));
  });

  return (
    <span
      ref={el}
      style={{
        transform: `scale(${pop()})`,
        color: ticker.direction() === "up" ? "#16a34a"
             : ticker.direction() === "down" ? "#dc2626" : "inherit",
      }}
    />
  );
}
```

## Staggered list entrance on scroll into view

Combine `createInView` (trigger) with `createStagger` (cascade delays)
so list items entrance one after another when scrolled into view.

```tsx
import { createSignal, For } from "solid-js";
import { createInView, createStagger } from "solid-drift";

function StaggeredList(props: { items: string[] }) {
  const [visible, setVisible] = createSignal(false);
  let listRef!: HTMLUListElement;
  createInView(() => listRef, () => setVisible(true), { once: true });

  const at = createStagger(props.items.length, 80);

  return (
    <ul ref={listRef}>
      <For each={props.items}>
        {(item, i) => (
          <li
            style={{
              opacity: visible() ? 1 : 0,
              transform: `translateY(${visible() ? 0 : 24}px)`,
              transition: "opacity 400ms ease, transform 400ms ease",
              "transition-delay": `${at(i())}ms`,
            }}
          >
            {item}
          </li>
        )}
      </For>
    </ul>
  );
}
```

## Toast with spring enter and timed exit

Combine `createToast` (queue management) with `createSpring` (physics
enter/exit) for notifications that spring in and slide out.

```tsx
import { createSignal, Show } from "solid-js";
import { createToast, createSpring } from "solid-drift";

function ToastHost() {
  const toast = createToast();
  const [open, setOpen] = createSignal(false);
  const y = createSpring(() => (open() ? 0 : 80), {
    stiffness: 300,
    damping: 26,
  });
  const opacity = createSpring(() => (open() ? 1 : 0), {
    stiffness: 300,
    damping: 30,
  });

  const show = (message: string) => {
    toast.show(message);
    setOpen(true);
    setTimeout(() => setOpen(false), 3200);
  };

  return (
    <Show when={toast.current()}>
      <div
        role="status"
        style={{
          transform: `translateY(${y()}px)`,
          opacity: opacity(),
        }}
      >
        {toast.current()?.message}
      </div>
    </Show>
  );
}
```

## Draggable card with snap-back

Combine `createDrag` (pointer tracking) with `createSpring` (snap-back
physics) for a card that follows the finger and springs home on release.

```tsx
import { createSignal } from "solid-js";
import { createDrag, createSpring } from "solid-drift";

function DraggableCard() {
  const [pos, setPos] = createSignal({ x: 0, y: 0 });
  const [dragging, setDragging] = createSignal(false);
  let cardRef!: HTMLDivElement;

  // While dragging, follow the pointer directly; on release, the
  // spring takes over and animates back to origin.
  const x = createSpring(() => (dragging() ? pos().x : 0), {
    stiffness: 260,
    damping: 22,
  });
  const y = createSpring(() => (dragging() ? pos().y : 0), {
    stiffness: 260,
    damping: 22,
  });

  createDrag(() => cardRef, {
    onStart: () => setDragging(true),
    onMove: (dx, dy) => setPos({ x: dx, y: dy }),
    onEnd: () => setDragging(false),
  });

  return (
    <div
      ref={cardRef}
      style={{
        transform: `translate(${x()}px, ${y()}px)`,
        cursor: dragging() ? "grabbing" : "grab",
        "touch-action": "none",
      }}
    >
      Drag me
    </div>
  );
}
```

## Typing indicator that thinks, then types

Combine `createThinking` (animated dots) with `createTyping`
(character-by-character reveal) for an AI response sequence.

```tsx
import { createSignal, Show } from "solid-js";
import { createThinking, createTyping } from "solid-drift";

function AiResponse(props: { text: string }) {
  const [phase, setPhase] = createSignal<"thinking" | "typing" | "done">(
    "thinking",
  );
  let dotsRef!: HTMLSpanElement;
  let textRef!: HTMLSpanElement;

  createThinking(() => dotsRef);
  const typed = createTyping(
    () => (phase() === "typing" ? props.text : ""),
    { speed: 24 },
  );

  // Simulate: think for 1.2s, then type the response.
  setTimeout(() => setPhase("typing"), 1200);
  createEffect(() => {
    if (phase() === "typing" && typed() === props.text) setPhase("done");
  });

  return (
    <div>
      <Show when={phase() === "thinking"}>
        <span ref={dotsRef} aria-label="Thinking" />
      </Show>
      <Show when={phase() !== "thinking"}>
        <span ref={textRef}>{typed()}</span>
      </Show>
    </div>
  );
}
```

## Scroll progress bar with eased fill

Combine `createScrollProgress` (scroll position) with `createTween`
(smoothing) for a progress bar that eases toward the scroll position
instead of jumping.

```tsx
import { createTween, createScrollProgress } from "solid-drift";

function ScrollBar() {
  const raw = createScrollProgress();
  // Ease the bar toward the raw scroll value for a buttery feel.
  const smooth = createTween(raw, { duration: 180, easing: "easeOutCubic" });

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "3px",
        width: `${smooth() * 100}%`,
        background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
        "z-index": 50,
      }}
    />
  );
}
```

---

## Real API recipes

The recipes above use local signals. The ones below wire real external
APIs into the primitives: no mocks, copy the fetch/stream plumbing and
adapt the endpoint.

### Stream from the Anthropic SDK with markdown-safe rendering

`createChatModel` speaks the Anthropic Messages API natively. The catch
with streaming markdown: an unclosed code fence mid-stream breaks most
parsers. The fix is to render the streamed text through a parser that
tolerates truncation, and to close any dangling fence before parsing.

```tsx
import { createSignal, createMemo } from "solid-js";
import { createChatModel } from "solid-drift";
// npm install @anthropic-ai/sdk  (used server-side or via your proxy)

function AnthropicChat() {
  const [input, setInput] = createSignal("");

  const chat = createChatModel({
    provider: "anthropic",
    // Browser calls must go through your own /api/anthropic proxy route:
    // api.anthropic.com sends no CORS headers for browser origins.
    baseUrl: "/api/anthropic",
    model: "claude-sonnet-4-5",
    maxTokens: 1024,
    system: "You are a concise assistant.",
  });

  // Close a dangling code fence so the markdown parser never chokes
  // on a half-streamed block.
  const safeMarkdown = createMemo(() => {
    const text = chat.streamingText();
    const fences = (text.match(/```/g) || []).length;
    return fences % 2 === 1 ? text + "\n```" : text;
  });

  const send = () => {
    const text = input().trim();
    if (!text) return;
    setInput("");
    chat.send(text);
  };

  return (
    <div>
      <div aria-live="polite">
        {/* Render safeMarkdown() with your markdown renderer of choice.
            Inline code spans are fine mid-stream; only fences need the
            guard above. */}
        <MarkdownRenderer source={safeMarkdown()} />
      </div>
      {chat.status() === "streaming" && (
        <button onClick={chat.stop}>Stop</button>
      )}
      <input
        value={input()}
        onInput={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
      />
      <button onClick={send}>Send</button>
      {chat.error() && <p role="alert">{chat.error()?.message}</p>}
    </div>
  );
}
```

Server proxy route (SolidStart example, `src/routes/api/anthropic.ts`):
forward the request body to `https://api.anthropic.com/v1/messages`
with your `x-api-key` and `anthropic-version: 2023-06-01` headers, and
stream the response body straight back. `createChatModel` parses the
`content_block_delta` events itself.

### Stream from the Vercel AI SDK

If you already use the Vercel AI SDK (`ai` package), its
`streamText`/`useChat` transport is OpenAI-compatible. Point
`createChatModel` at your existing `/api/chat` route with the
`"openai"` provider kind: it parses the `data:` chunks and the
`[DONE]` terminator.

```tsx
import { createChatModel } from "solid-drift";

const chat = createChatModel({
  provider: "openai",
  baseUrl: "/api/chat", // your existing Vercel AI SDK route
  model: "gpt-4o-mini",
  apiKey: "", // not needed when the route is same-origin
});

// chat.streamingText() updates as chunks arrive; chat.messages()
// holds the finished history. Same markdown-fence guard as above
// applies when rendering streamingText().
```

The same dangling-fence guard from the Anthropic recipe applies: count
` ``` ` occurrences in `streamingText()` and append a closing fence when
odd before handing the text to your markdown renderer.

### Token price via viem with rolling digits

`createTicker` animates whatever number signal you feed it. Pair it
with viem's `getGasPrice`/`readContract` (or any price feed) polled on
an interval.

```tsx
import { createSignal, onMount, onCleanup } from "solid-js";
import { createPublicClient, http, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { createTicker } from "solid-drift";
// npm install viem

const client = createPublicClient({ chain: mainnet, transport: http() });

function EthPrice() {
  const [price, setPrice] = createSignal(0);
  let el!: HTMLSpanElement;
  const ticker = createTicker(price, () => el, { decimals: 2 });

  onMount(() => {
    let alive = true;
    const poll = async () => {
      // Example: read a Chainlink ETH/USD feed, or hit your price API.
      // Replace with your own source; the ticker only needs a number.
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      );
      const json = await res.json();
      if (alive) setPrice(json.ethereum.usd);
    };
    poll();
    const timer = setInterval(poll, 30_000);
    onCleanup(() => {
      alive = false;
      clearInterval(timer);
    });
  });

  return (
    <div>
      <span ref={el} aria-label={`ETH price $${ticker.display()}`}>
        ${ticker.display()}
      </span>
      <span
        aria-hidden
        style={{
          color:
            ticker.direction() === "up"
              ? "#16a34a"
              : ticker.direction() === "down"
                ? "#dc2626"
                : "inherit",
        }}
      >
        {ticker.direction() === "up"
          ? " ▲"
          : ticker.direction() === "down"
            ? " ▼"
            : ""}
      </span>
    </div>
  );
}
```

For locale-aware formatting, pass `locale` in the ticker options
(`createTicker(price, ref, { decimals: 2, locale: "de-DE" })`); digits
roll the same way, grouping separators follow the locale.

### Bottom sheet with swipe-to-close on mobile

`createBottomSheet` gives you snap points and drag physics;
`createSwipe` detects the fast downward flick that should dismiss the
sheet even from a mid snap point. Together they feel native.

```tsx
import { createSignal, Show } from "solid-js";
import { createBottomSheet, createSwipe } from "solid-drift";

function MobileSheet() {
  const [open, setOpen] = createSignal(false);
  let sheetRef!: HTMLDivElement;

  const sheet = createBottomSheet(() => sheetRef, {
    snapPoints: [0.4, 0.9],
    onOpenChange: (isOpen) => setOpen(isOpen),
  });

  // A fast downward swipe anywhere on the sheet dismisses it,
  // even if the drag physics would have settled at a snap point.
  createSwipe(() => sheetRef, {
    onSwipe: (details) => {
      if (details.direction === "down" && details.velocity > 0.6) {
        sheet.close();
      }
    },
  });

  return (
    <Show when={open()}>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: "90dvh",
          transform: `translateY(${sheet.y()}px)`,
          // Let vertical drags belong to the sheet; horizontal page
          // scroll still works.
          "touch-action": "pan-x",
        }}
      >
        {/* drag handle */}
        <div
          aria-hidden
          style={{
            width: "40px",
            height: "4px",
            "border-radius": "2px",
            background: "#ccc",
            margin: "8px auto",
          }}
        />
        {/* sheet content */}
      </div>
    </Show>
  );
}
```

Mobile notes: use `100dvh`/`90dvh` (not `vh`) so the sheet tracks the
iOS Safari toolbar as it collapses; set `touch-action: pan-x` on the
sheet so vertical drags are captured by the gesture while horizontal
swipes still scroll inner content. See the gesture family docs for the
full iOS Safari notes.
