import { createSignal, onMount } from "solid-js";
import { createMorph } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button, Slider } from "../../framework/controls";

/* SVG morphing: a square melts into a circle. Both paths are resampled
   to N points and interpolated per point on the shared clock.
   The slider scrubs the morph via seek(). */

const SQUARE = "M20,20 L180,20 L180,180 L20,180 Z";
const CIRCLE = "M100,20 a80,80 0 1,0 0.1,0 Z";

export function MorphDemo() {
  let path!: SVGPathElement;
  const [scrub, setScrub] = createSignal(0);
  let morph: ReturnType<typeof createMorph> | null = null;

  onMount(() => {
    morph = createMorph(() => path, { to: CIRCLE, duration: 900 });
  });

  const play = () => {
    morph?.seek(0);
    setScrub(0);
    void morph?.play().then(() => setScrub(1));
  };

  const onScrub = (v: number) => {
    setScrub(v);
    morph?.seek(v);
  };

  const snippet = `import { createMorph } from "solid-drift"

const morph = createMorph(() => pathEl, {
  to: "M100,20 a80,80 0 1,0 0.1,0 Z",
  duration: 900,
})
await morph.play()
morph.seek(0.5) // scrub`;

  return (
    <DemoShell
      title="Morph"
      description="A square melts into a circle. Both paths resample to N points and interpolate per point. Scrub the slider to drive it manually."
      snippet={snippet}
      controls={
        <>
          <Button onClick={play} kind="primary">
            Play morph
          </Button>
          <Slider
            label="Scrub"
            min={0}
            max={1}
            step={0.01}
            value={scrub()}
            onChange={onScrub}
          />
        </>
      }
    >
      <div style={{ width: "100%", display: "flex", "justify-content": "center" }}>
        <svg viewBox="0 0 200 200" style={{ width: "220px", height: "220px" }}>
          <path
            ref={path}
            d={SQUARE}
            fill="#3b82f6"
            stroke="#1d4ed8"
            stroke-width="2"
          />
        </svg>
      </div>
    </DemoShell>
  );
}
