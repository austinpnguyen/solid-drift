import { createEffect, createSignal } from "solid-js";
import { createWobble } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* Jelly wobble: press the badge (or the button) and it oscillates with
   decaying rotation and counter-phase scale, like poking jelly. Poking
   the badge itself works because the ref wires pointerdown to wobble. */

export function WobbleDemo() {
  const [rotation, setRotation] = createSignal(7);
  const [frequency, setFrequency] = createSignal(5);

  let badge!: HTMLDivElement;
  const [wob, setWob] =
    createSignal<ReturnType<typeof createWobble> | null>(null);

  /* Option changes need a fresh control bound to the same badge. */
  createEffect(() => {
    setWob(
      createWobble(() => badge, {
        rotation: rotation(),
        frequency: frequency(),
      }),
    );
  });

  const poke = () => {
    if (animationsDisabled()) return;
    wob()?.wobble();
  };

  const snippet = `let badge!: HTMLDivElement;
const { rotate, scaleX, scaleY, wobble } = createWobble(() => badge, {
  rotation: ${rotation()},
  frequency: ${frequency()},
});

// poking the badge itself also wobbles it:
// the ref wires pointerdown to wobble()
<div
  ref={badge}
  onClick={() => wobble()}
  style={{
    transform: \`rotate(\${rotate()}deg) scale(\${scaleX()}, \${scaleY()})\`,
  }}
/>`;

  return (
    <DemoShell
      title="Wobble"
      description="A jelly badge that wobbles when poked: decaying rotation with counter-phase scale. Poke the badge itself or use the button."
      snippet={snippet}
      controls={
        <>
          <Slider
            label="Rotation (deg)"
            min={0}
            max={20}
            value={rotation()}
            onChange={setRotation}
          />
          <Slider
            label="Frequency (Hz)"
            min={1}
            max={12}
            value={frequency()}
            onChange={setFrequency}
          />
          <Button onClick={poke} kind="primary">
            Wobble
          </Button>
        </>
      }
    >
      <div class="stage-col" style={{ gap: "20px" }}>
        <div
          ref={badge}
          style={{
            width: "110px",
            height: "110px",
            "border-radius": "32px",
            background: "linear-gradient(135deg, #f59e0b, #ef4444)",
            "box-shadow": "0 12px 32px rgba(239, 68, 68, 0.35)",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            color: "white",
            "font-weight": "800",
            "font-size": "15px",
            "letter-spacing": "0.08em",
            cursor: "pointer",
            "user-select": "none",
            "touch-action": "manipulation",
            transform: `rotate(${(wob()?.rotate() ?? 0).toFixed(2)}deg) scale(${(wob()?.scaleX() ?? 1).toFixed(3)}, ${(wob()?.scaleY() ?? 1).toFixed(3)})`,
            "will-change": "transform",
          }}
        >
          POKE
        </div>
        <span class="kbd">
          rotate {(wob()?.rotate() ?? 0).toFixed(1)}°
        </span>
      </div>
    </DemoShell>
  );
}
