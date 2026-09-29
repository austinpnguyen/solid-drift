import { createSignal, Show } from "solid-js";
import { createHaptic } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Toggle, Button } from "../../framework/controls";

/* Tactile feedback through the Vibration API. On devices that cannot
   vibrate the buttons stay visible but disabled, and the note says so. */

function HapticStage(props: { enabled: boolean }) {
  const haptic = createHaptic({ enabled: props.enabled });
  const [last, setLast] = createSignal<string | null>(null);
  const supported = haptic.supported();

  const fire = (name: string, fn: () => void): void => {
    fn();
    setLast(name);
  };

  const presets: Array<[string, () => void]> = [
    ["Light", () => haptic.light()],
    ["Medium", () => haptic.medium()],
    ["Heavy", () => haptic.heavy()],
    ["Success", () => haptic.success()],
    ["Warning", () => haptic.warning()],
    ["Error", () => haptic.error()],
    ["SOS", () => haptic.morse("... --- ...")],
  ];

  return (
    <div class="stage-col">
      <div class="stage-row">
        {presets.map(([name, fn]) => (
          <button
            type="button"
            class="btn btn-ghost"
            disabled={!supported}
            onClick={() => fire(name, fn)}
          >
            {name}
          </button>
        ))}
      </div>
      <p>
        <span class="kbd">
          <Show when={last()} fallback="no buzz yet">
            {(name) => name()}
          </Show>
        </span>{" "}
        last fired
      </p>
      <Show when={!supported}>
        <p>
          Vibration needs a mobile device (or a browser that exposes
          navigator.vibrate). The buttons above are disabled here.
        </p>
      </Show>
    </div>
  );
}

export function HapticDemo() {
  const [enabled, setEnabled] = createSignal(true);

  const snippet = () =>
    `import { createHaptic } from "solid-drift";

const haptic = createHaptic({ enabled: ${enabled()} });

<button onClick={() => haptic.light()}>Confirm</button>
<button onClick={() => haptic.morse("... --- ...")}>SOS</button>`;

  return (
    <DemoShell
      title="Haptics"
      description="Tactile presets (light, medium, heavy, success, warning, error, morse) through the Vibration API."
      snippet={snippet()}
      controls={
        <Toggle label="Enabled" checked={enabled()} onChange={setEnabled} />
      }
    >
      <Show when={enabled()} keyed>
        {(on) => <HapticStage enabled={on} />}
      </Show>
    </DemoShell>
  );
}
