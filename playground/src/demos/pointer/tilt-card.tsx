import { createEffect, createSignal } from "solid-js";
import { createTiltCard } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider } from "../../framework/controls";

/* Holographic trading-card tilt: the card leans in 3D under the pointer
   while a glare spot and a rainbow foil sweep across it. The library is
   reduced-motion safe on its own, so no tilt or shine appears when the
   user asks for reduced motion. */

export function TiltCardDemo() {
  const [maxAngle, setMaxAngle] = createSignal(12);
  const [hoverScale, setHoverScale] = createSignal(1.04);

  let card!: HTMLDivElement;
  const [tilt, setTilt] =
    createSignal<ReturnType<typeof createTiltCard> | null>(null);

  /* Option changes need a fresh control bound to the same card. */
  createEffect(() => {
    setTilt(
      createTiltCard(() => card, {
        maxAngle: maxAngle(),
        scale: hoverScale(),
        perspective: 900,
      }),
    );
  });

  const rx = () => (tilt()?.rotateX() ?? 0).toFixed(1);
  const ry = () => (tilt()?.rotateY() ?? 0).toFixed(1);
  const shine = () => (tilt()?.shine() ?? 0).toFixed(2);
  const glareX = () => ((tilt()?.glareX() ?? 0.5) * 100).toFixed(1);
  const glareY = () => ((tilt()?.glareY() ?? 0.5) * 100).toFixed(1);
  const holo = () => (tilt()?.holoAngle() ?? 0).toFixed(0);

  const snippet = `let card!: HTMLDivElement;
const tilt = createTiltCard(() => card, {
  maxAngle: ${maxAngle()},
  scale: ${hoverScale().toFixed(2)},
  perspective: 900,
});

<div ref={card} style={{ transform: tilt.transform() }}>
  {/* card art */}
  {/* glare overlay, follows the pointer */}
  <div
    style={{
      background: \`radial-gradient(circle at \${tilt.glareX() * 100}% \${tilt.glareY() * 100}%, rgba(255,255,255,0.55), transparent 60%)\`,
      opacity: tilt.shine(),
    }}
  />
  {/* rainbow foil overlay */}
  <div
    style={{
      background: \`linear-gradient(\${tilt.holoAngle()}deg, #ff0080, #ff8000, #ffff00, #00ff80, #0080ff, #8000ff)\`,
      "mix-blend-mode": "color-dodge",
      opacity: tilt.shine() * 0.5,
    }}
  />
</div>`;

  return (
    <DemoShell
      title="Tilt Card"
      description="A holographic card that leans in 3D under the pointer, with a glare spot and rainbow foil that track it. Touch works too: drag across the card."
      snippet={snippet}
      controls={
        <>
          <Slider
            label="Max tilt angle"
            min={0}
            max={30}
            value={maxAngle()}
            onChange={setMaxAngle}
          />
          <Slider
            label="Hover scale"
            min={1}
            max={1.2}
            step={0.01}
            value={hoverScale()}
            onChange={setHoverScale}
          />
        </>
      }
    >
      <div class="stage-col">
        <div
          ref={card}
          style={{
            width: "220px",
            height: "300px",
            "max-width": "100%",
            "border-radius": "20px",
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
            "touch-action": "pan-y",
            "will-change": "transform",
            background:
              "linear-gradient(135deg, #0ea5e9, #6366f1 45%, #a855f7 70%, #ec4899)",
            "box-shadow": "0 20px 60px rgba(99, 102, 241, 0.35)",
            transform: tilt()?.transform() ?? "perspective(900px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "0",
              padding: "20px",
              color: "white",
              display: "flex",
              "flex-direction": "column",
              "justify-content": "space-between",
            }}
          >
            <div>
              <div
                style={{
                  "font-size": "11px",
                  "letter-spacing": "0.22em",
                  opacity: "0.85",
                }}
              >
                SOLID DRIFT
              </div>
              <div style={{ "font-size": "30px", "font-weight": "800" }}>
                Holo Card
              </div>
            </div>
            <div style={{ "font-size": "13px", opacity: "0.85" }}>
              Move your pointer across the card
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              inset: "0",
              "pointer-events": "none",
              background: `radial-gradient(circle at ${glareX()}% ${glareY()}%, rgba(255,255,255,0.55), transparent 60%)`,
              opacity: shine(),
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "0",
              "pointer-events": "none",
              background: `linear-gradient(${holo()}deg, #ff0080, #ff8000, #ffff00, #00ff80, #0080ff, #8000ff)`,
              "mix-blend-mode": "color-dodge",
              opacity: Number(shine()) * 0.5,
            }}
          />
        </div>
        <div class="stage-row">
          <span class="kbd">rotateX {rx()}°</span>
          <span class="kbd">rotateY {ry()}°</span>
          <span class="kbd">shine {shine()}</span>
        </div>
      </div>
    </DemoShell>
  );
}
