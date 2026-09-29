import { createSignal } from "solid-js";
import { createThinking, type ThinkingControls } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button, TextInput } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* Animated "thinking" indicator for voice reply latency: cycles trailing
   dots, then moves through phrases. */

const REDUCED = animationsDisabled();

export function ThinkingDemo() {
  const [interval, setIntervalMs] = createSignal(400);
  const [phraseText, setPhraseText] = createSignal("Thinking, Searching");

  const parsePhrases = (): string[] =>
    phraseText()
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

  /* Options are fixed at creation, so changing a control rebuilds it. */
  let thinking: ThinkingControls = createThinking({
    phrases: parsePhrases(),
    interval: interval(),
  });
  const rebuild = () => {
    thinking.stop();
    thinking = createThinking({ phrases: parsePhrases(), interval: interval() });
  };

  const snippet = () => `const thinking = createThinking({
  phrases: [${parsePhrases()
    .map((p) => `"${p}"`)
    .join(", ")}],
  interval: ${interval()},
});

thinking.start();
thinking.stop();

<p>{thinking.text()}</p> // "${parsePhrases()[0] ?? "Thinking"}", "${
    (parsePhrases()[0] ?? "Thinking") + "."
  }", ...`;

  return (
    <DemoShell
      title="Thinking Indicator"
      description="Voice-style thinking label that cycles dots, then phrases."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <TextInput
            label="Phrases (comma separated)"
            value={phraseText()}
            placeholder="Thinking, Searching"
            onInput={(v) => {
              setPhraseText(v);
              rebuild();
            }}
          />
          <Slider
            label="Interval (ms)"
            min={100}
            max={1200}
            step={50}
            value={interval()}
            onChange={(v) => {
              setIntervalMs(v);
              rebuild();
            }}
          />
          <div class="stage-row">
            <Button
              onClick={() => thinking.start()}
              kind="primary"
            >
              Start
            </Button>
            <Button onClick={() => thinking.stop()} kind="ghost">
              Stop
            </Button>
          </div>
        </div>
      }
    >
      <div class="stage-col">
        <div class="stage-box" style={{ "min-height": "64px" }}>
          {REDUCED ? (
            <p aria-live="polite" style={{ "font-size": "1.25rem" }}>
              {thinking.running() ? parsePhrases()[0] ?? "Thinking" : ""}
            </p>
          ) : (
            <p aria-live="polite" style={{ "font-size": "1.25rem" }}>
              {thinking.text()}
            </p>
          )}
        </div>
        <span class="kbd">running: {String(thinking.running())}</span>
      </div>
    </DemoShell>
  );
}
