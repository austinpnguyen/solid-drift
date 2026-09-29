import { createEffect, createSignal } from "solid-js";
import { createTyping } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, TextInput, Button } from "../../framework/controls";

/* Typewriter effect with human-like timing jitter and a blinking cursor.
   The primitive owns the DOM and the clock; the demo just feeds it text
   and speed. Under reduced motion the library shows the full text at once. */

export function TypingDemo() {
  const [text, setText] = createSignal("Motion is the message.");
  const [speed, setSpeed] = createSignal(45);

  let el!: HTMLDivElement;
  let typing!: ReturnType<typeof createTyping>;

  // Recreate the primitive when text or speed changes so the running demo
  // always matches the controls. The old instance is cleaned up for us.
  createEffect(() => {
    typing = createTyping(() => el, {
      text: text(),
      speed: speed(),
      autostart: true,
    });
  });

  const snippet = () => `import { createTyping } from "solid-drift"

let el!: HTMLDivElement
const typing = createTyping(() => el, {
  text: ${JSON.stringify(text())},
  speed: ${speed()},
})
<div ref={el} />
<button onClick={() => typing.replay()}>Replay</button>`;

  return (
    <DemoShell
      title="Typing"
      description="Types out text character by character with human-like timing jitter, extra pauses after punctuation, and a blinking cursor that parks when done."
      snippet={snippet()}
      controls={
        <>
          <TextInput label="Text" value={text()} onInput={setText} />
          <Slider
            label="Speed (ms per char)"
            min={10}
            max={150}
            value={speed()}
            onChange={setSpeed}
          />
          <Button onClick={() => typing.replay()}>Replay</Button>
        </>
      }
    >
      <div class="stage-row">
        <div
          ref={el}
          style={{
            "font-size": "22px",
            "font-family": "var(--mono)",
            "min-height": "34px",
            "max-width": "100%",
            "text-align": "center",
            "overflow-wrap": "anywhere",
          }}
        />
      </div>
    </DemoShell>
  );
}
