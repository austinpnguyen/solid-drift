# Testimonial marquee section

An infinite scrolling row of testimonials. Pauses on hover, respects
reduced motion (static when the user prefers it).

[Live demo](https://austinpnguyen.github.io/solid-drift/#/sections/marquee)

## Vanilla version

```tsx
import { createSignal, onMount } from "solid-js";
import { createMarquee } from "solid-drift";

const QUOTES = [
  { name: "Linh", role: "Indie hacker", text: "Shipped my landing page in a day." },
  { name: "Minh", role: "Product engineer", text: "SSR-safe out of the box. No flicker." },
  { name: "Tuan", role: "Ex-Framer Motion", text: "The mapping guide got me productive in an hour." },
  { name: "Ha", role: "AI app dev", text: "Streaming text has never looked this smooth." },
];

export function TestimonialMarquee() {
  const [contentWidth, setContentWidth] = createSignal(0);
  let trackRef!: HTMLDivElement;

  const marquee = createMarquee({ speed: 60, direction: "left" });

  onMount(() => {
    // Measure one set of cards; the track renders the list twice
    // for a seamless wrap.
    setContentWidth(trackRef.scrollWidth / 2);
    marquee.setContentSize(contentWidth());
  });

  const card = (q: (typeof QUOTES)[number]) => (
    <div
      style={{
        "flex-shrink": 0,
        width: "320px",
        border: "1px solid #e5e5e5",
        "border-radius": "1rem",
        padding: "1.5rem",
        background: "#fff",
        margin: "0 0.75rem",
      }}
    >
      <p style={{ "font-size": "1.05rem", "margin-bottom": "1rem" }}>"{q.text}"</p>
      <p style={{ "font-weight": 600 }}>{q.name}</p>
      <p style={{ color: "#737373", "font-size": "0.875rem" }}>{q.role}</p>
    </div>
  );

  return (
    <section style={{ padding: "6rem 0", overflow: "hidden" }}>
      <h2 style={{ "text-align": "center", "font-size": "2.5rem", "font-weight": 700, "margin-bottom": "3rem" }}>
        Loved by developers
      </h2>
      <div
        onMouseEnter={marquee.stop}
        onMouseLeave={marquee.start}
        style={{ overflow: "hidden" }}
      >
        <div
          ref={trackRef}
          style={{
            display: "flex",
            transform: `translateX(${-marquee.offset()}px)`,
            width: "max-content",
          }}
        >
          {QUOTES.map(card)}
          {QUOTES.map(card)}
        </div>
      </div>
    </section>
  );
}
```

## Tailwind version

```tsx
import { createSignal, onMount } from "solid-js";
import { createMarquee } from "solid-drift";

const QUOTES = [ /* same as above */ ];

export function TestimonialMarquee() {
  const [contentWidth, setContentWidth] = createSignal(0);
  let trackRef!: HTMLDivElement;

  const marquee = createMarquee({ speed: 60, direction: "left" });

  onMount(() => {
    setContentWidth(trackRef.scrollWidth / 2);
    marquee.setContentSize(contentWidth());
  });

  const card = (q: (typeof QUOTES)[number]) => (
    <div class="mx-3 w-80 flex-shrink-0 rounded-2xl border border-neutral-200 bg-white p-6">
      <p class="mb-4 text-lg">"{q.text}"</p>
      <p class="font-semibold">{q.name}</p>
      <p class="text-sm text-neutral-500">{q.role}</p>
    </div>
  );

  return (
    <section class="overflow-hidden py-24">
      <h2 class="mb-12 text-center text-4xl font-bold">
        Loved by developers
      </h2>
      <div
        class="overflow-hidden"
        onMouseEnter={marquee.stop}
        onMouseLeave={marquee.start}
      >
        <div
          ref={trackRef}
          class="flex w-max"
          style={{ transform: `translateX(${-marquee.offset()}px)` }}
        >
          {QUOTES.map(card)}
          {QUOTES.map(card)}
        </div>
      </div>
    </section>
  );
}
```

## Why it works

- `createMarquee` advances `offset()` at a constant px/s on the shared
  clock; rendering the list twice and wrapping at half width makes the
  loop seamless.
- Hover pause is just `marquee.stop()` / `marquee.start()`: no state to
  manage.
- Under reduced motion the marquee is static: the content is still
  fully readable, just not scrolling.
