import { createSignal, onCleanup, onMount } from "solid-js";
import { createPathDraw } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";

/* SVG path drawing. The primitive reads the path length itself and drives
   stroke-dashoffset from full length to zero, eased on the shared clock.
   Under reduced motion the path renders fully drawn. */

const WAVE = "M10 70 C 40 20, 60 20, 90 60 S 140 100, 190 40";

export function PathDrawDemo() {
  const [duration, setDuration] = createSignal(1400);

  let path!: SVGPathElement;
  let draw: ReturnType<typeof createPathDraw> | null = null;

  // autoStart draws on creation. The primitive is built imperatively (not
  // inside a reactive effect); changing the duration stops the old draw
  // and builds a new one with the new timing.
  const build = () => {
    draw?.stop();
    draw = createPathDraw(() => path, { duration: duration() });
  };

  onMount(() => {
    build();
    onCleanup(() => draw?.stop());
  });

  const onDurationChange = (v: number) => {
    setDuration(v);
    build();
  };

  const replay = () => {
    draw?.reset();
    draw?.start();
  };

  const snippet = () => `import { createPathDraw } from "solid-drift"

let path!: SVGPathElement
const draw = createPathDraw(() => path, {
  duration: ${duration()},
})
<svg viewBox="0 0 200 100">
  <path
    ref={path}
    d="${WAVE}"
    fill="none"
    stroke="currentColor"
    stroke-width="4"
    stroke-linecap="round"
  />
</svg>
<button onClick={() => { draw.reset(); draw.start() }}>Replay</button>`;

  return (
    <DemoShell
      title="Path Draw"
      description="An SVG stroke draws itself on by animating stroke-dashoffset from the path length to zero, eased on the shared clock."
      snippet={snippet()}
      controls={
        <>
          <Slider
            label="Duration (ms)"
            min={400}
            max={3000}
            step={100}
            value={duration()}
            onChange={onDurationChange}
          />
          <Button onClick={replay}>Replay</Button>
        </>
      }
    >
      <div class="stage-row">
        <svg
          viewBox="0 0 200 100"
          style={{ width: "100%", "max-width": "340px", height: "auto" }}
        >
          <path
            ref={path}
            d={WAVE}
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
          />
        </svg>
      </div>
    </DemoShell>
  );
}
