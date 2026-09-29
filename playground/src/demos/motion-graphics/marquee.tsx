import { createEffect, createSignal, For } from "solid-js";
import { createMarquee, type MarqueeDirection } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Select, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* Infinite marquee. The primitive advances an offset at speed px/s and
   wraps it at the content size; rendering the content twice and
   translating by -offset loops it seamlessly. Reduced motion stays static. */

const ITEMS = ["Fast", "Smooth", "Seamless", "Infinite", "Looping"];

export function MarqueeDemo() {
  const [speed, setSpeed] = createSignal(80);
  const [direction, setDirection] = createSignal<MarqueeDirection>("left");
  const [marquee, setMarquee] =
    createSignal<ReturnType<typeof createMarquee> | null>(null);
  const still = animationsDisabled();

  let strip!: HTMLDivElement;

  // Direction and speed are captured at creation, so rebuild on change.
  // The content strip is doubled, so the loop unit is half the width.
  createEffect(() => {
    if (still) return;
    const m = createMarquee({
      speed: speed(),
      direction: direction(),
    });
    m.setContentSize(strip.scrollWidth / 2);
    setMarquee(m);
  });

  const toggle = () => {
    const m = marquee();
    if (!m) return;
    if (m.running()) m.stop();
    else m.start();
  };

  const snippet = () => `import { createEffect } from "solid-js"
import { createMarquee } from "solid-drift"

const marquee = createMarquee({
  speed: ${speed()},
  direction: ${JSON.stringify(direction())},
})
let strip!: HTMLDivElement
createEffect(() => {
  marquee.setContentSize(strip.scrollWidth / 2)
})
<div style={{ overflow: "hidden" }}>
  <div
    ref={strip}
    style={{
      display: "flex",
      transform: \`translateX(\${-marquee.offset()}px)\`,
      "will-change": "transform",
    }}
  >
    {items}{items}
  </div>
</div>`;

  const running = () => marquee()?.running() ?? false;

  return (
    <DemoShell
      title="Marquee"
      description="An infinite scroller: the offset advances at speed px/s and wraps at the content size, so a doubled strip loops seamlessly."
      snippet={snippet()}
      controls={
        <>
          <Slider
            label="Speed (px/s)"
            min={20}
            max={200}
            value={speed()}
            onChange={setSpeed}
          />
          <Select
            label="Direction"
            options={["left", "right"]}
            value={direction()}
            onChange={(v) => setDirection(v as MarqueeDirection)}
          />
          <Button onClick={toggle}>{running() ? "Pause" : "Resume"}</Button>
        </>
      }
    >
      <div
        style={{
          overflow: "hidden",
          "max-width": "100%",
          "border-radius": "12px",
          border: "1px solid var(--line)",
          padding: "14px 0",
          "background-color": "var(--panel)",
        }}
      >
        <div
          ref={strip}
          style={{
            display: "flex",
            gap: "40px",
            "width": "max-content",
            transform: `translateX(${-((marquee()?.offset() ?? 0))}px)`,
            "will-change": "transform",
            "font-size": "18px",
            "font-weight": "600",
            "white-space": "nowrap",
            "padding-left": "40px",
          }}
        >
          <For each={[...ITEMS, ...ITEMS]}>
            {(item) => <span>{item}</span>}
          </For>
        </div>
      </div>
    </DemoShell>
  );
}
