import { createSignal, createMemo } from "solid-js";
import { createTween, createElementSize, type EasingName } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Toggle, Select } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* createTween: a signal that tweens toward its source over a fixed duration.
   Travel is measured from the stage with the library's own
   createElementSize, so the box never runs off on narrow screens. */

const BOX = 72;
const PAD = 24;

const EASING_NAMES: EasingName[] = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeOutExpo",
  "easeOutBack",
  "easeOutElastic",
  "easeOutBounce",
];

export function TweenDemo() {
  const [on, setOn] = createSignal(false);
  const [duration, setDuration] = createSignal(600);
  const [easing, setEasing] = createSignal<EasingName>("easeOutCubic");

  // Duration and easing are read once when the primitive is created, so
  // rebuild it when the controls change. The next toggle uses the new set.
  const v = createMemo(() =>
    createTween(() => (on() ? 1 : 0), {
      duration: duration(),
      easing: easing(),
    }),
  );

  const reduced = animationsDisabled();
  const shown = () => (reduced ? (on() ? 1 : 0) : v()());

  const [stage, setStage] = createSignal<HTMLDivElement>();
  const size = createElementSize(stage);
  const travel = () => Math.max(0, Math.round(size.width() - BOX - PAD));

  const snippet = () =>
    `const [on, setOn] = createSignal(false)\n` +
    `const v = createTween(() => (on() ? 1 : 0), {\n` +
    `  duration: ${duration()},\n` +
    `  easing: "${easing()}",\n` +
    `})\n\n` +
    `// travel is the measured stage width minus the box\n` +
    `<div\n` +
    `  style={{\n` +
    `    opacity: v(),\n` +
    `    transform: \`translateX(\${v() * ${travel()}}px)\`,\n` +
    `  }}\n` +
    `/>`;

  return (
    <DemoShell
      title="createTween"
      description="A signal that tweens toward its source over a fixed duration. Pick an easing, then flip the toggle."
      snippet={snippet()}
      controls={
        <>
          <Slider
            label="duration (ms)"
            min={100}
            max={2000}
            step={50}
            value={duration()}
            onChange={setDuration}
          />
          <Select
            label="easing"
            options={EASING_NAMES}
            value={easing()}
            onChange={(name) => setEasing(name as EasingName)}
          />
          <Toggle label="target 1" checked={on()} onChange={setOn} />
        </>
      }
    >
      <div class="stage-col" style={{ width: "100%" }}>
        <div
          ref={setStage}
          style={{ width: "100%", height: `${BOX}px`, position: "relative" }}
        >
          <div
            class="stage-box"
            style={{
              opacity: shown(),
              transform: `translateX(${shown() * travel()}px)`,
              "will-change": "transform, opacity",
            }}
          />
        </div>
        <span class="kbd">v = {shown().toFixed(2)}</span>
      </div>
    </DemoShell>
  );
}
