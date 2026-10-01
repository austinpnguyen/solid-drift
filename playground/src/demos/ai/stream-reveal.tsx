import { createSignal, onCleanup } from "solid-js";
import { createStreamReveal, type StreamRevealControls } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Select, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* Simulated LLM token stream: a canned paragraph fed to
   createStreamReveal in chunks, revealing calmly on a steady cadence. */

const PARAGRAPH =
  "A stream reveal smooths irregular token bursts into readable motion. " +
  "Tokens are queued as they arrive, then flushed in batches, so each " +
  "character or word enters with a soft rise and blur settle instead of " +
  "flickering one token at a time.";

export function StreamRevealDemo() {
  const [unit, setUnit] = createSignal<"chars" | "words">("chars");
  const [batchMs, setBatchMs] = createSignal(120);
  const [maxBatch, setMaxBatch] = createSignal(24);
  const [duration, setDuration] = createSignal(450);

  let out!: HTMLDivElement;
  let timer: ReturnType<typeof setInterval> | null = null;

  /* The unit and timing options are fixed at creation, so changing a
     control rebuilds the stream, bound to the same host element. */
  let stream: StreamRevealControls = createStreamReveal(() => out, {
    unit: unit(),
    batchMs: batchMs(),
    maxBatch: maxBatch(),
    duration: duration(),
  });
  const rebuild = () => {
    stream = createStreamReveal(() => out, {
      unit: unit(),
      batchMs: batchMs(),
      maxBatch: maxBatch(),
      duration: duration(),
    });
  };

  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  onCleanup(stopTimer);

  const generate = () => {
    stopTimer();
    stream.reset();
    /* When reduced motion is requested the library skips batching and
       the text appears as it is pushed, so we reveal everything at once. */
    if (animationsDisabled()) {
      stream.push(PARAGRAPH);
      stream.complete();
      return;
    }
    let cursor = 0;
    const step = unit() === "words" ? 2 : 35;
    timer = setInterval(() => {
      if (unit() === "words") {
        const words = PARAGRAPH.split(" ");
        stream.push(words.slice(cursor, cursor + step).join(" ") + " ");
        cursor += step;
        if (cursor >= words.length) {
          stopTimer();
          stream.complete();
        }
      } else {
        stream.push(PARAGRAPH.slice(cursor, cursor + step));
        cursor += step;
        if (cursor >= PARAGRAPH.length) {
          stopTimer();
          stream.complete();
        }
      }
    }, 250);
  };

  const reset = () => {
    stopTimer();
    stream.reset();
  };

  const snippet = () => `let out!: HTMLDivElement;
const stream = createStreamReveal(() => out, {
  unit: "${unit()}",
  batchMs: ${batchMs()},
  maxBatch: ${maxBatch()},
  duration: ${duration()},
});

// as tokens arrive:
stream.push(chunk);
// when the stream ends:
stream.complete();
// status: "idle" | "streaming" | "done"
<div ref={out} aria-live="polite" />`;

  return (
    <DemoShell
      title="Stream Reveal"
      description="Simulated LLM tokens revealing with calm, batched entrances."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <div class="stage-row">
            <Select
              label="Unit"
              options={["chars", "words"]}
              value={unit()}
              onChange={(v) => {
                setUnit(v as "chars" | "words");
                rebuild();
              }}
            />
          </div>
          <Slider
            label="Batch cadence (ms)"
            min={40}
            max={400}
            step={10}
            value={batchMs()}
            onChange={(v) => {
              setBatchMs(v);
              rebuild();
            }}
          />
          <Slider
            label="Max batch"
            min={4}
            max={60}
            value={maxBatch()}
            onChange={(v) => {
              setMaxBatch(v);
              rebuild();
            }}
          />
          <Slider
            label="Entrance duration (ms)"
            min={100}
            max={1000}
            step={50}
            value={duration()}
            onChange={(v) => {
              setDuration(v);
              rebuild();
            }}
          />
          <div class="stage-row">
            <Button onClick={generate} kind="primary">
              Generate
            </Button>
            <Button onClick={reset} kind="ghost">
              Reset
            </Button>
          </div>
        </div>
      }
    >
      <div class="stage-col">
        <div class="stage-panel" style={{ "min-height": "120px" }}>
          <div ref={out} aria-live="polite" style={{ "line-height": "1.7" }} />
        </div>
        <span class="kbd">status: {stream.status()}</span>
      </div>
    </DemoShell>
  );
}
