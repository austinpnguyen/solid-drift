import { createSignal, onCleanup } from "solid-js";
import { createTicker, type TickerControls } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* Animated price ticker fed by a local random walk: per-digit roll and
   a green/red flash on up/down ticks. */

const REDUCED = animationsDisabled();

export function TickerDemo() {
  const [price, setPrice] = createSignal(48210.5);
  const [decimals, setDecimals] = createSignal(2);
  const [duration, setDuration] = createSignal(400);
  const [running, setRunning] = createSignal(false);

  let el!: HTMLSpanElement;
  let timer: ReturnType<typeof setInterval> | null = null;

  /* decimals and duration are fixed at creation, so a control change
     rebuilds the ticker against the same source and host. */
  let ticker: TickerControls = createTicker(price, () => el, {
    decimals: decimals(),
    duration: duration(),
  });
  const rebuild = () => {
    ticker = createTicker(price, () => el, {
      decimals: decimals(),
      duration: duration(),
    });
  };

  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    setRunning(false);
  };
  onCleanup(stopTimer);

  const tick = () => {
    /* Random walk of roughly plus or minus 0.3 percent. */
    const drift = (Math.random() - 0.48) * 0.006;
    setPrice((p) => Math.max(1, p * (1 + drift)));
  };

  const start = () => {
    stopTimer();
    setRunning(true);
    if (REDUCED) return; /* single tick, no looping animation */
    timer = setInterval(tick, 900);
  };

  const snippet = () => `let el!: HTMLSpanElement;
const [price, setPrice] = createSignal(48210.5);
const ticker = createTicker(price, () => el, {
  decimals: ${decimals()},
  duration: ${duration()},
});

// each price update rolls the digits and flashes on direction:
setPrice(48302.17);

// ticker.display()  -> "${ticker.display()}"
// ticker.direction() -> "${ticker.direction()}" // "up" | "down" | "flat"

<span ref={el} />`;

  return (
    <DemoShell
      title="Price Ticker"
      description="Per-digit roll with a direction flash on every update."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <Slider
            label="Decimals"
            min={0}
            max={4}
            value={decimals()}
            onChange={(v) => {
              setDecimals(v);
              rebuild();
            }}
          />
          <Slider
            label="Roll duration (ms)"
            min={100}
            max={1200}
            step={50}
            value={duration()}
            onChange={(v) => {
              setDuration(v);
              rebuild();
            }}
          />
          <div class="stage-row">
            <Button onClick={start} kind="primary">
              Start
            </Button>
            <Button onClick={stopTimer} kind="ghost">
              Stop
            </Button>
            <Button onClick={tick} kind="ghost">
              Tick once
            </Button>
          </div>
        </div>
      }
    >
      <div class="stage-col">
        <div class="stage-panel" style={{ "text-align": "center" }}>
          <span
            ref={el}
            style={{
              "font-size": "2rem",
              "font-weight": "700",
              "font-variant-numeric": "tabular-nums",
            }}
          />
        </div>
        <div class="stage-row">
          <span class="kbd">display: {ticker.display()}</span>
          <span class="kbd">direction: {ticker.direction()}</span>
          <span class="kbd">feed: {running() ? "on" : "off"}</span>
        </div>
      </div>
    </DemoShell>
  );
}
