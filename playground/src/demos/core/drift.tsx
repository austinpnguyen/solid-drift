import { createSignal, Show } from "solid-js";
import { drift } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* The `drift` directive: binds animated values straight to an element's style. */

export function DriftDemo() {
  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [opacity, setOpacity] = createSignal(1);
  const [scale, setScale] = createSignal(1);

  const reduced = animationsDisabled();

  // drift's implementation reads its argument as an accessor, so pass one.
  const props = () => ({ x: x(), y: y(), opacity: opacity(), scale: scale() });

  const snippet = () =>
    `import { drift } from "solid-drift"\n\n` +
    `const [x, setX] = createSignal(0)\n` +
    `const [y, setY] = createSignal(0)\n` +
    `const [opacity, setOpacity] = createSignal(1)\n` +
    `const [scale, setScale] = createSignal(1)\n\n` +
    `<div\n` +
    `  use:drift={() => ({\n` +
    `    x: x(),\n` +
    `    y: y(),\n` +
    `    opacity: opacity(),\n` +
    `    scale: scale(),\n` +
    `  })}\n` +
    `>\n` +
    `  styled by signals\n` +
    `</div>`;

  const liveBox = (
    <div class="stage-box" use:drift={props}>
      use:drift
    </div>
  );

  const staticBox = (
    <div
      class="stage-box"
      style={{
        transform: `translate3d(${x()}px, ${y()}px, 0) scale(${scale()})`,
        opacity: opacity(),
      }}
    >
      use:drift
    </div>
  );

  return (
    <DemoShell
      title="drift directive"
      description="A directive that binds signals straight to an element's style. Move the sliders and the box follows with no animation code."
      snippet={snippet()}
      controls={
        <>
          <Slider label="x (px)" min={-100} max={100} value={x()} onChange={setX} />
          <Slider label="y (px)" min={-100} max={100} value={y()} onChange={setY} />
          <Slider
            label="opacity"
            min={0}
            max={1}
            step={0.01}
            value={opacity()}
            onChange={setOpacity}
          />
          <Slider
            label="scale"
            min={0.5}
            max={1.5}
            step={0.01}
            value={scale()}
            onChange={setScale}
          />
        </>
      }
    >
      <div class="stage-col">
        {/* The directive has no reduced-motion handling of its own, so when
            reduced motion is on we render the same end state with plain
            inline styles and skip the directive entirely. */}
        <Show when={!reduced} fallback={staticBox}>
          {liveBox}
        </Show>
      </div>
    </DemoShell>
  );
}
