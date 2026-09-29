import { createEffect, createSignal } from "solid-js";
import { createMagnetic } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider } from "../../framework/controls";

/* A button that is pulled toward the pointer when it comes close, then
   springs back to rest when the pointer leaves. The pull is read live
   from the returned accessors. */

export function MagneticDemo() {
  const [strength, setStrength] = createSignal(0.35);
  const [radius, setRadius] = createSignal(140);

  let btn!: HTMLButtonElement;
  const [mag, setMag] =
    createSignal<ReturnType<typeof createMagnetic> | null>(null);

  /* Option changes need a fresh control bound to the same button. */
  createEffect(() => {
    setMag(
      createMagnetic(() => btn, { strength: strength(), radius: radius() }),
    );
  });

  const x = () => (mag()?.x() ?? 0).toFixed(1);
  const y = () => (mag()?.y() ?? 0).toFixed(1);

  const snippet = `let btn!: HTMLButtonElement;
const { x, y } = createMagnetic(() => btn, {
  strength: ${strength().toFixed(2)},
  radius: ${radius()},
});

<button
  ref={btn}
  style={{ transform: \`translate(\${x()}px, \${y()}px)\` }}
>
  Pull me
</button>`;

  return (
    <DemoShell
      title="Magnetic Button"
      description="Move your pointer near the button and it gets pulled toward it, springing back when the pointer leaves. Works with touch drags too."
      snippet={snippet}
      controls={
        <>
          <Slider
            label="Pull strength"
            min={0}
            max={1}
            step={0.05}
            value={strength()}
            onChange={setStrength}
          />
          <Slider
            label="Attraction radius (px)"
            min={60}
            max={240}
            step={10}
            value={radius()}
            onChange={setRadius}
          />
        </>
      }
    >
      <div class="stage-col" style={{ width: "100%", gap: "16px" }}>
        <div
          style={{
            width: "100%",
            "min-height": "200px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "border-radius": "12px",
            background: "var(--stage)",
          }}
        >
          <button
            ref={btn}
            type="button"
            class="btn btn-primary"
            style={{
              transform: `translate(${x()}px, ${y()}px)`,
              "font-size": "16px",
              padding: "14px 28px",
            }}
          >
            Pull me
          </button>
        </div>
        <div class="stage-row">
          <span class="kbd">x {x()}px</span>
          <span class="kbd">y {y()}px</span>
        </div>
      </div>
    </DemoShell>
  );
}
