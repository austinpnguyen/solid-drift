import { createEffect, createSignal, Show } from "solid-js";
import { createConfetti } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* Confetti on a canvas particle layer. One burst spawns count particles
   that launch, sway, and fade on the shared clock. Rapid bursts stack.
   Under reduced motion no particles fire; the demo shows a static note. */

export function ConfettiDemo() {
  const [count, setCount] = createSignal(120);
  const still = animationsDisabled();

  let canvas!: HTMLCanvasElement;
  let confetti!: ReturnType<typeof createConfetti>;

  // Particle count is captured at creation, so rebuild on change.
  createEffect(() => {
    if (still) return;
    confetti = createConfetti(() => canvas, { count: count() });
  });

  const celebrate = () => {
    if (still) return;
    confetti.burst();
  };

  const snippet = () => `import { createConfetti } from "solid-drift"

let canvas!: HTMLCanvasElement
const confetti = createConfetti(() => canvas, {
  count: ${count()},
})
<canvas ref={canvas} />
<button onClick={() => confetti.burst()}>Celebrate</button>`;

  return (
    <DemoShell
      title="Confetti"
      description="A celebration burst of confetti particles on a canvas layer. Rapid bursts stack instead of replacing each other."
      snippet={snippet()}
      controls={
        <Slider
          label="Particles per burst"
          min={20}
          max={300}
          step={10}
          value={count()}
          onChange={setCount}
        />
      }
    >
      <Show
        when={!still}
        fallback={
          <div class="stage-col">
            <p style={{ color: "var(--muted)" }}>
              Reduced motion is on: confetti skipped. Celebration complete.
            </p>
          </div>
        }
      >
        <div class="stage-col">
          <canvas
            ref={canvas}
            width={640}
            height={220}
            style={{
              width: "100%",
              height: "220px",
              "border-radius": "12px",
              "background-color": "var(--panel)",
              border: "1px solid var(--line)",
            }}
          />
          <Button onClick={celebrate}>Celebrate</Button>
        </div>
      </Show>
    </DemoShell>
  );
}
