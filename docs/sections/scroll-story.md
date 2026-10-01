# Scroll storytelling section

A pinned narrative: as the user scrolls, the story advances through
chapters with a progress indicator. Each chapter fades and slides in
driven by scroll progress.

[Live demo](https://austinpnguyen.github.io/solid-drift/#/sections/scroll-story)

## Vanilla version

```tsx
import { createMemo } from "solid-js";
import {
  createScrollProgress,
  createTween,
} from "solid-drift";

const CHAPTERS = [
  { title: "The problem", body: "Animations were imperative and brittle." },
  { title: "The insight", body: "Values are signals; signals compose." },
  { title: "The result", body: "Springs follow your state, effortlessly." },
];

export function ScrollStory() {
  const progress = createScrollProgress();
  // Smooth the raw scroll value so chapters ease between states.
  const smooth = createTween(progress, { duration: 200 });

  const activeIndex = createMemo(() =>
    Math.min(
      CHAPTERS.length - 1,
      Math.floor(smooth() * CHAPTERS.length),
    ),
  );

  return (
    <section style={{ position: "relative" }}>
      {/* Progress rail */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "50%",
          right: "2rem",
          transform: "translateY(-50%)",
          width: "4px",
          height: "120px",
          "border-radius": "2px",
          background: "#e5e5e5",
        }}
      >
        <div
          style={{
            width: "100%",
            height: `${smooth() * 100}%`,
            "border-radius": "2px",
            background: "#111",
          }}
        />
      </div>

      {CHAPTERS.map((chapter, i) => {
        const distance = createMemo(() => Math.abs(activeIndex() - i));
        const opacity = createMemo(() =>
          distance() === 0 ? 1 : Math.max(0, 1 - distance() * 0.7),
        );
        const y = createMemo(() => (i - activeIndex()) * 60);

        return (
          <div
            style={{
              "min-height": "100vh",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              opacity: opacity(),
              transform: `translateY(${y()}px)`,
            }}
          >
            <div style={{ "max-width": "32rem", "text-align": "center" }}>
              <h2 style={{ "font-size": "2.5rem", "font-weight": 700 }}>
                {chapter.title}
              </h2>
              <p style={{ "font-size": "1.25rem", color: "#525252" }}>
                {chapter.body}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

## Tailwind version

```tsx
import { createMemo } from "solid-js";
import { createScrollProgress, createTween } from "solid-drift";

const CHAPTERS = [
  { title: "The problem", body: "Animations were imperative and brittle." },
  { title: "The insight", body: "Values are signals; signals compose." },
  { title: "The result", body: "Springs follow your state, effortlessly." },
];

export function ScrollStory() {
  const progress = createScrollProgress();
  const smooth = createTween(progress, { duration: 200 });

  const activeIndex = createMemo(() =>
    Math.min(CHAPTERS.length - 1, Math.floor(smooth() * CHAPTERS.length)),
  );

  return (
    <section class="relative">
      <div
        aria-hidden
        class="fixed right-8 top-1/2 h-32 w-1 -translate-y-1/2 rounded bg-neutral-200"
      >
        <div
          class="w-full rounded bg-black"
          style={{ height: `${smooth() * 100}%` }}
        />
      </div>

      {CHAPTERS.map((chapter, i) => {
        const distance = createMemo(() => Math.abs(activeIndex() - i));
        return (
          <div
            class="flex min-h-screen items-center justify-center"
            style={{
              opacity: Math.max(0, 1 - distance() * 0.7),
              transform: `translateY(${(i - activeIndex()) * 60}px)`,
            }}
          >
            <div class="max-w-lg text-center">
              <h2 class="text-4xl font-bold">{chapter.title}</h2>
              <p class="mt-4 text-xl text-neutral-600">{chapter.body}</p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

## Why it works

- `createScrollProgress()` returns 0..1 for page scroll; the tween
  smooths it so chapters glide instead of jumping.
- Each chapter's opacity and offset derive from its distance to the
  active index: pure signal composition, no scroll listeners in your
  code.
- The progress rail is a fixed element driven by the same signal.
