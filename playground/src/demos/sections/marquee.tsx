import { onMount } from "solid-js";
import { createMarquee } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";

/* Section demo: testimonial marquee. Infinite scrolling testimonials. */

const QUOTES = [
  { name: "Linh", text: "Shipped my landing page in a day." },
  { name: "Minh", text: "SSR-safe out of the box." },
  { name: "Tuan", text: "Productive in an hour." },
  { name: "Ha", text: "Streaming text looks so smooth." },
];

export function MarqueeSectionDemo() {
  let trackRef!: HTMLDivElement;
  const marquee = createMarquee({ speed: 60, direction: "left" });

  onMount(() => {
    marquee.setContentSize(trackRef.scrollWidth / 2);
  });

  const card = (q: (typeof QUOTES)[number]) => (
    <div
      style={{
        "flex-shrink": 0,
        width: "220px",
        border: "1px solid #e5e5e5",
        "border-radius": "1rem",
        padding: "1rem",
        background: "#fff",
        margin: "0 0.5rem",
      }}
    >
      <p style={{ "font-size": "0.9rem", "margin-bottom": "0.5rem" }}>
        "{q.text}"
      </p>
      <p style={{ "font-weight": 600, "font-size": "0.85rem" }}>{q.name}</p>
    </div>
  );

  return (
    <DemoShell
      title="Testimonial marquee"
      description="Infinite testimonial ticker (createMarquee). Hover to pause."
      snippet={`const marquee = createMarquee({ speed: 60 })\nonMount(() => marquee.setContentSize(track.scrollWidth / 2))\n<div style={{ transform: \`translateX(\${-marquee.offset()}px)\` }}>`}
      controls={
        <button
          class="demo-btn"
          onClick={() => (marquee.running() ? marquee.stop() : marquee.start())}
        >
          {marquee.running() ? "Pause" : "Play"}
        </button>
      }
    >
      <div
        onMouseEnter={marquee.stop}
        onMouseLeave={marquee.start}
        style={{ overflow: "hidden", padding: "1rem 0" }}
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
    </DemoShell>
  );
}
