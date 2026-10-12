import { createSignal, onMount } from "solid-js";
import { createMotionPath } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button, Slider } from "../../framework/controls";

/* Motion path: a dot flies along a curve, rotating with the tangent.
   The slider scrubs the flight via seek(). */

const PATH = "M10,140 C 70,20 120,20 160,100 S 260,160 330,60";

export function MotionPathDemo() {
  let dot!: HTMLDivElement;
  const [scrub, setScrub] = createSignal(0);
  const [rotate, setRotate] = createSignal(true);
  let flight: ReturnType<typeof createMotionPath> | null = null;

  const build = () => {
    flight = createMotionPath(() => dot, {
      path: PATH,
      duration: 2400,
      autoRotate: rotate(),
    });
  };

  onMount(() => {
    build();
    flight?.seek(0);
  });

  const play = () => {
    flight?.seek(0);
    setScrub(0);
    void flight?.play().then(() => setScrub(1));
  };

  const onScrub = (v: number) => {
    setScrub(v);
    flight?.seek(v);
  };

  const toggleRotate = () => {
    setRotate((r) => !r);
    const p = flight?.progress() ?? 0;
    build();
    flight?.seek(p);
    setScrub(p);
  };

  const snippet = `import { createMotionPath } from "solid-drift"

const flight = createMotionPath(() => dot, {
  path: "M10,140 C 70,20 120,20 160,100 S 260,160 330,60",
  duration: 2400,
  autoRotate: true,
})
await flight.play()
flight.seek(0.5) // scrub`;

  return (
    <DemoShell
      title="Motion Path"
      description="A dot flies along an SVG curve, rotating with the tangent. Scrub the slider to drive it manually."
      snippet={snippet}
      controls={
        <>
          <Button onClick={play} kind="primary">
            Play flight
          </Button>
          <Button onClick={toggleRotate} kind="ghost">
            {rotate() ? "autoRotate: on" : "autoRotate: off"}
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
        <div style={{ position: "relative", width: "340px", height: "170px", "max-width": "100%" }}>
          <svg
            viewBox="0 0 340 170"
            style={{ width: "340px", height: "170px", display: "block", "max-width": "100%" }}
          >
            <path
              d={PATH}
              fill="none"
              stroke="var(--line)"
              stroke-width="2"
              stroke-dasharray="6 6"
            />
          </svg>
          <div
            ref={dot}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "18px",
              height: "18px",
              "border-radius": "50%",
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            }}
          />
        </div>
      </div>
    </DemoShell>
  );
}
