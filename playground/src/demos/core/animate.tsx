import { createSignal } from "solid-js";
import { animate, type AnimationControls } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button, TextInput } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* animate: an imperative one-shot animation from one number to another. */

export function AnimateDemo() {
  const [from, setFrom] = createSignal(0);
  const [to, setTo] = createSignal(100);
  const [duration, setDuration] = createSignal(800);
  const [value, setValue] = createSignal(0);
  const [done, setDone] = createSignal(false);
  const [running, setRunning] = createSignal(false);

  let controls: AnimationControls | null = null;

  const play = () => {
    controls?.stop();
    setRunning(true);
    setDone(false);
    const ctl = animate(from(), to(), {
      duration: duration(),
      onUpdate: (v: number) => setValue(v),
      onComplete: () => setDone(true), // fires only on real completion
    });
    controls = ctl;
    // `finished` resolves on completion or stop, so it always ends "running".
    ctl.finished.then(() => setRunning(false));
  };

  const reduced = animationsDisabled();
  // With reduced motion the library skips straight to the end value,
  // so play() lands on the final state immediately.

  const progress = () => {
    const span = to() - from();
    if (span === 0) return 1;
    return Math.min(Math.max((value() - from()) / span, 0), 1);
  };

  const snippet = () =>
    `const [value, setValue] = createSignal(${from()})\n\n` +
    `const ctl = animate(${from()}, ${to()}, {\n` +
    `  duration: ${duration()},\n` +
    `  onUpdate: (v) => setValue(v),\n` +
    `  onComplete: () => console.log("finished"),\n` +
    `})\n\n` +
    `await ctl.finished // resolves when the animation completes`;

  return (
    <DemoShell
      title="animate"
      description="An imperative one-shot animation from one number to another, with per-frame updates and a promise that resolves when it finishes."
      snippet={snippet()}
      controls={
        <>
          <TextInput
            label="from"
            value={String(from())}
            onInput={(v) => {
              const n = Number(v);
              if (Number.isFinite(n)) setFrom(n);
            }}
          />
          <TextInput
            label="to"
            value={String(to())}
            onInput={(v) => {
              const n = Number(v);
              if (Number.isFinite(n)) setTo(n);
            }}
          />
          <Slider
            label="duration (ms)"
            min={100}
            max={2000}
            step={50}
            value={duration()}
            onChange={setDuration}
          />
          <Button onClick={play} kind="primary">
            Play
          </Button>
        </>
      }
    >
      <div class="stage-col">
        <div
          class="stage-box"
          style={{
            width: `${60 + progress() * 120}px`,
          }}
        />
        <span class="kbd">value = {value().toFixed(1)}</span>
        <div
          style={{
            width: "100%",
            "max-width": "280px",
            height: "8px",
            "border-radius": "4px",
            background: "var(--demo-track, #e8e4da)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress() * 100}%`,
              height: "100%",
              background: "currentColor",
            }}
          />
        </div>
        <span class="kbd">
          {running() ? "running" : done() ? "finished" : reduced ? "ready" : "idle"}
        </span>
      </div>
    </DemoShell>
  );
}
