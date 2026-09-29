import { createSignal, createMemo } from "solid-js";
import { createTween, type EasingName } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Toggle, Select } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* createTween: a signal that tweens toward its source over a fixed duration. */

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

  const snippet = () =>
    `const [on, setOn] = createSignal(false)\n` +
    `const v = createTween(() => (on() ? 1 : 0), {\n` +
    `  duration: ${duration()},\n` +
    `  easing: "${easing()}",\n` +
    `})\n\n` +
    `<div\n` +
    `  style={{\n` +
    `    opacity: v(),\n` +
    `    transform: \`translateX(\${v() * 150}px)\`,\n` +
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
      <div class="stage-col">
        <div
          class="stage-box"
          style={{
            opacity: shown(),
            transform: `translateX(${shown() * 150}px)`,
          }}
        >
          v = {shown().toFixed(2)}
        </div>
      </div>
    </DemoShell>
  );
}
