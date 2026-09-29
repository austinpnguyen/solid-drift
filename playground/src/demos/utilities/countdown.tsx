import { createSignal, Show } from "solid-js";
import { createCountdown } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Toggle, Button } from "../../framework/controls";

/* A live countdown to a fixed wall-clock moment. The target is captured
   once in the outer component so start, stop, and reset always resume
   against the same moment. */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function CountdownStage(props: { interval: number; autoStart: boolean }) {
  const c = createCountdown(TARGET, {
    interval: props.interval,
    autoStart: props.autoStart,
  });

  return (
    <div class="stage-col">
      <div class="stage-row">
        <div class="stage-box">
          <span class="kbd">
            {pad(c.days())}d {pad(c.hours())}h {pad(c.minutes())}m{" "}
            {pad(c.seconds())}s
          </span>
        </div>
        <span class="kbd">
          <Show when={c.done()} fallback={c.running() ? "running" : "paused"}>
            done
          </Show>
        </span>
      </div>
      <div class="stage-row">
        <Button onClick={() => (c.running() ? c.stop() : c.start())}>
          {c.running() ? "Pause" : "Start"}
        </Button>
        <Button kind="ghost" onClick={() => c.reset()}>
          Reset
        </Button>
      </div>
      <p>
        <span class="kbd">{c.remaining()}</span> ms remaining
      </p>
    </div>
  );
}

const TARGET = Date.now() + 90_000;

export function CountdownDemo() {
  const [interval, setInterval] = createSignal(1000);
  const [autoStart, setAutoStart] = createSignal(true);

  const snippet = () =>
    `import { createCountdown } from "solid-drift";

const sale = createCountdown(Date.now() + 90_000, {
  interval: ${interval()},
  autoStart: ${autoStart()},
});

<p>
  {sale.days()}d {sale.hours()}h {sale.minutes()}m {sale.seconds()}s
</p>`;

  return (
    <DemoShell
      title="Countdown"
      description="Countdown to a wall-clock moment with start, pause, and reset."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <Slider
            label="Tick interval (ms)"
            min={100}
            max={2000}
            step={100}
            value={interval()}
            onChange={setInterval}
          />
          <Toggle
            label="Auto start"
            checked={autoStart()}
            onChange={setAutoStart}
          />
        </div>
      }
    >
      <Show when={{ interval: interval(), autoStart: autoStart() }} keyed>
        {(opts) => (
          <CountdownStage interval={opts.interval} autoStart={opts.autoStart} />
        )}
      </Show>
    </DemoShell>
  );
}
