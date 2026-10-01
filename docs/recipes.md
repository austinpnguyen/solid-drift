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
