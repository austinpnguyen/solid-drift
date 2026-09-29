import { createSignal, createMemo } from "solid-js";
import { createSpring } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* createSpring: a signal that chases a target with real spring physics. */

export function SpringDemo() {
  const [target, setTarget] = createSignal(0);
  const [stiffness, setStiffness] = createSignal(170);
  const [damping, setDamping] = createSignal(26);

  // Options are read once when the primitive is created, so rebuild it
  // when the sliders move. The next toggle uses the new settings.
  const x = createMemo(() =>
    createSpring(target, { stiffness: stiffness(), damping: damping() }),
  );

  const toggle = () => setTarget((t) => (t === 0 ? 300 : 0));
  const reduced = animationsDisabled();
  const shown = () => (reduced ? target() : x()());

  const snippet = () =>
    `const [target, setTarget] = createSignal(0)\n` +
    `const x = createSpring(target, {\n` +
    `  stiffness: ${stiffness()},\n` +
    `  damping: ${damping()},\n` +
    `})\n\n` +
    `<button onClick={() => setTarget((t) => (t === 0 ? 300 : 0))}>\n` +
    `  Toggle\n` +
    `</button>\n` +
    `<div style={{ transform: \`translateX(\${x()}px)\` }} />`;

  return (
    <DemoShell
      title="createSpring"
      description="A signal that chases its target with spring physics. Change the options, then toggle: mid-flight retargets keep their velocity, so motion stays smooth."
      snippet={snippet()}
      controls={
        <>
          <Slider
            label="stiffness"
            min={20}
            max={400}
            value={stiffness()}
            onChange={setStiffness}
          />
          <Slider
            label="damping"
            min={2}
            max={60}
            value={damping()}
            onChange={setDamping}
          />
          <Button onClick={toggle}>
            Move to {target() === 0 ? 300 : 0}
          </Button>
        </>
      }
    >
      <div class="stage-col">
        <div class="stage-box" style={{ transform: `translateX(${shown()}px)` }}>
          x = {Math.round(shown())}
        </div>
      </div>
    </DemoShell>
  );
}
