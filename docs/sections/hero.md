# Hero section

A landing hero with a spring entrance: headline rises and fades in,
subcopy follows, CTAs pop with a stagger. Copy, paste, change the words.

[Live demo](https://austinpnguyen.github.io/solid-drift/#/sections/hero)

## Vanilla version

```tsx
import { createSignal, onMount, createEffect, onCleanup } from "solid-js";
import { createSpring, createTween, createStagger } from "solid-drift";

export function Hero() {
  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));

  const delays = createStagger(3, 110);

  // Each block gets its own spring/tween with a stagger delay.
  const items = [0, 1, 2].map((index) => {
    const [delayed, setDelayed] = createSignal(false);
    createEffect(() => {
      if (mounted()) {
        const t = setTimeout(() => setDelayed(true), delays(index));
        onCleanup(() => clearTimeout(t));
      } else {
        setDelayed(false);
      }
    });
    const rise = createSpring(() => (delayed() ? 0 : 36), {
      stiffness: 260,
      damping: 24,
    });
    const fade = createTween(() => (delayed() ? 1 : 0), { duration: 500 });
    return {
      transform: `translateY(${rise()}px)`,
      opacity: fade(),
    };
  });

  return (
    <header
      style={{
        "max-width": "72rem",
        margin: "0 auto",
        padding: "6rem 1.5rem",
        "text-align": "center",
      }}
    >
      <p style={items[0]}>
        <span
          style={{
            display: "inline-block",
            padding: "0.25rem 1rem",
            "border-radius": "9999px",
            background: "#f3f4f6",
            "font-size": "0.875rem",
          }}
        >
          New: v0.44.0 is out
        </span>
      </p>
      <h1
        style={{
          ...items[1],
          "font-size": "3.5rem",
          "font-weight": 800,
          "letter-spacing": "-0.02em",
          margin: "1.5rem 0",
        }}
      >
        Motion that feels alive
      </h1>
      <p style={{ ...items[2], "font-size": "1.25rem", color: "#525252" }}>
        Signal-native animation for SolidJS. Animate values, not elements.
      </p>
      <div style={{ ...items[2], marginTop: "2rem" }}>
        <a
          href="#"
          style={{
            display: "inline-block",
            padding: "0.75rem 1.75rem",
            "border-radius": "0.75rem",
            background: "#111",
            color: "#fff",
            "font-weight": 600,
            "margin-right": "1rem",
          }}
        >
          Get started
        </a>
        <a
          href="#"
          style={{
            display: "inline-block",
            padding: "0.75rem 1.75rem",
            "border-radius": "0.75rem",
            border: "1px solid #e5e5e5",
            "font-weight": 600,
          }}
        >
          Live demo
        </a>
      </div>
    </header>
  );
}
```

## Tailwind version

Same behavior, Tailwind classes for layout. The animated values still
bind via `style` because they change every frame.

```tsx
import { createSignal, onMount, createEffect, onCleanup } from "solid-js";
import { createSpring, createTween, createStagger } from "solid-drift";

export function Hero() {
  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));

  const delays = createStagger(3, 110);

  const items = [0, 1, 2].map((index) => {
    const [delayed, setDelayed] = createSignal(false);
    createEffect(() => {
      if (mounted()) {
        const t = setTimeout(() => setDelayed(true), delays(index));
        onCleanup(() => clearTimeout(t));
      } else {
        setDelayed(false);
      }
    });
    const rise = createSpring(() => (delayed() ? 0 : 36), {
      stiffness: 260,
      damping: 24,
    });
    const fade = createTween(() => (delayed() ? 1 : 0), { duration: 500 });
    return {
      transform: `translateY(${rise()}px)`,
      opacity: fade(),
    };
  });

  return (
    <header class="mx-auto max-w-6xl px-6 py-24 text-center">
      <p style={items[0]}>
        <span class="inline-block rounded-full bg-neutral-100 px-4 py-1 text-sm">
          New: v0.44.0 is out
        </span>
      </p>
      <h1
        class="mb-6 mt-6 text-6xl font-extrabold tracking-tight"
        style={items[1]}
      >
        Motion that feels alive
      </h1>
      <p class="text-xl text-neutral-600" style={items[2]}>
        Signal-native animation for SolidJS. Animate values, not elements.
      </p>
      <div class="mt-8 flex justify-center gap-4" style={items[2]}>
        <a
          href="#"
          class="rounded-xl bg-black px-7 py-3 font-semibold text-white transition-transform hover:scale-105"
        >
          Get started
        </a>
        <a
          href="#"
          class="rounded-xl border border-neutral-200 px-7 py-3 font-semibold transition-transform hover:scale-105"
        >
          Live demo
        </a>
      </div>
    </header>
  );
}
```

## Why it works

- One `mounted` signal drives everything; springs retarget when it
  flips, no orchestration code.
- `createStagger(3, 110)` gives each block a 110ms cascade delay.
- Under reduced motion the spring jumps to 0 and the tween to 1: the
  hero appears instantly, fully laid out.
