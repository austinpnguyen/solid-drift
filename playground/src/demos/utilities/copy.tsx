import { createSignal, Show } from "solid-js";
import { createCopy } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button, TextInput } from "../../framework/controls";

/* Copy text with transient "Copied!" feedback. The button label reads the
   real `copied()` flag from the primitive, so it always tells the truth. */

function CopyStage(props: { resetDelay: number; text: string }) {
  const clipboard = createCopy({ resetDelay: props.resetDelay });

  return (
    <div class="stage-col">
      <div class="stage-row">
        <Button onClick={() => void clipboard.copy(props.text)}>
          {clipboard.copied() ? "Copied!" : "Copy"}
        </Button>
        <span class="kbd">
          <Show when={clipboard.copied()} fallback="idle">
            copied
          </Show>
        </span>
      </div>
      <Show when={clipboard.error()}>
        {(err) => <p>Error: {err().message}</p>}
      </Show>
    </div>
  );
}

export function CopyDemo() {
  const [text, setText] = createSignal("https://austinnguyen.com");
  const [resetDelay, setResetDelay] = createSignal(2000);

  const snippet = () =>
    `import { createCopy } from "solid-drift";

const clipboard = createCopy({ resetDelay: ${resetDelay()} });

<button onClick={() => clipboard.copy(text)}>
  {clipboard.copied() ? "Copied!" : "Copy"}
</button>`;

  return (
    <DemoShell
      title="Copy to clipboard"
      description="Copy text with a built-in copied flag for transient feedback."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <TextInput label="Text to copy" value={text()} onInput={setText} />
          <Slider
            label="Reset delay (ms)"
            min={0}
            max={5000}
            step={250}
            value={resetDelay()}
            onChange={setResetDelay}
          />
        </div>
      }
    >
      <Show when={resetDelay()} keyed>
        {(delay) => <CopyStage resetDelay={delay} text={text()} />}
      </Show>
    </DemoShell>
  );
}
