import { createSignal } from "solid-js";
import { createScrollProgress, createTween } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";

/* Section demo: scroll storytelling. Chapters advance with scroll. */

const CHAPTERS = [
  { title: "The problem", body: "Animations were imperative and brittle." },
  { title: "The insight", body: "Values are signals; signals compose." },
  { title: "The result", body: "Springs follow your state, effortlessly." },
];

export function ScrollStorySectionDemo() {
  const progress = createScrollProgress();
  const smooth = createTween(progress, { duration: 200 });

  const [manual, setManual] = createSignal(1);

  return (
    <DemoShell
      title="Scroll story section"
      description="Chapters advance with the slider. In production, wire activeIndex to createScrollProgress (see docs/sections/scroll-story.md)."
      snippet={`const progress = createScrollProgress()\nconst smooth = createTween(progress, { duration: 200 })\nconst active = Math.floor(smooth() * CHAPTERS.length)`}
      controls={
        <label style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
          <span>Preview</span>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={manual()}
            onInput={(e) => setManual(parseInt(e.currentTarget.value))}
          />
        </label>
      }
    >
      <div style={{ padding: "2rem 1rem", "text-align": "center" }}>
        {CHAPTERS.map((chapter, i) => {
          // Use manual slider for the demo; the real section uses scroll.
          const distance = () => Math.abs(manual() - i);
          return (
            <div
              style={{
                padding: "1.5rem",
                margin: "0.5rem 0",
                "border-radius": "1rem",
                background: distance() === 0 ? "#111" : "#f3f4f6",
                color: distance() === 0 ? "#fff" : "#111",
                opacity: Math.max(0.4, 1 - distance() * 0.5),
                transform: `translateY(${(i - manual()) * 12}px)`,
                transition: "transform 300ms ease, opacity 300ms ease, background-color 300ms ease",
              }}
            >
              <h3 style={{ "font-weight": 700 }}>{chapter.title}</h3>
              <p style={{ "font-size": "0.9rem" }}>{chapter.body}</p>
            </div>
          );
        })}
        <p style={{ "font-size": "0.8rem", color: "#737373", "margin-top": "1rem" }}>
          Live scroll progress: {(smooth() * 100).toFixed(0)}%
        </p>
      </div>
    </DemoShell>
  );
}
