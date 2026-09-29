import { createEffect, createSignal } from "solid-js";
import { createKineticType } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";

/* Kinetic typography: every character flies in with position, blur, scale
   and opacity, staggered for that showreel title feel. One master clock
   drives every unit, so a long headline costs a single rAF task. */

const HEADLINE = "Drift makes headlines move";

export function KineticTypeDemo() {
  const [duration, setDuration] = createSignal(550);
  const [stagger, setStagger] = createSignal(45);

  let title!: HTMLHeadingElement;
  let kinetic!: ReturnType<typeof createKineticType>;

  // play() splits the element into units and starts the master clock.
  // Rebuilding on option change replays the headline with new timing.
  createEffect(() => {
    kinetic = createKineticType(() => title, {
      unit: "chars",
      duration: duration(),
      stagger: stagger(),
    });
    void kinetic.play();
  });

  const snippet = () => `import { onMount } from "solid-js"
import { createKineticType } from "solid-drift"

let title!: HTMLHeadingElement
const kinetic = createKineticType(() => title, {
  unit: "chars",
  duration: ${duration()},
  stagger: ${stagger()},
})
onMount(() => kinetic.play())
<h1 ref={title}>${HEADLINE}</h1>
<button onClick={() => kinetic.replay()}>Replay</button>`;

  return (
    <DemoShell
      title="Kinetic Type"
      description="Each character flies in with blur, scale and position on one master clock, staggered for that showreel title feel."
      snippet={snippet()}
      controls={
        <>
          <Slider
            label="Duration (ms per char)"
            min={200}
            max={1200}
            value={duration()}
            onChange={setDuration}
          />
          <Slider
            label="Stagger (ms)"
            min={5}
            max={120}
            value={stagger()}
            onChange={setStagger}
          />
          <Button onClick={() => void kinetic.replay()}>Replay</Button>
        </>
      }
    >
      <div class="stage-row">
        <h1
          ref={title}
          style={{
            "font-size": "30px",
            "font-weight": "700",
            "text-align": "center",
            "max-width": "100%",
            margin: "0",
          }}
        >
          {HEADLINE}
        </h1>
      </div>
    </DemoShell>
  );
}
