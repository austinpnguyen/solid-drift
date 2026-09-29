import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import { createSquashStretch, animate } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Toggle } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* A ball bouncing in a shaft. The bounce drives a motion signal, and
   createSquashStretch deforms the ball around it: it stretches along the
   flight direction and pancakes for a beat on each landing. The deform
   lands on the CSS `scale` property, so it composes with the translate
   that moves the ball. */

const SHAFT_H = 240;
const BALL = 56;
const FLOOR = SHAFT_H - BALL;

export function SquashStretchDemo() {
  const reduced = animationsDisabled();

  const [maxStretch, setMaxStretch] = createSignal(1.35);
  const [autoplay, setAutoplay] = createSignal(!reduced);
  const [y, setY] = createSignal(reduced ? FLOOR : 0);

  let ball!: HTMLDivElement;
  const [deform, setDeform] =
    createSignal<ReturnType<typeof createSquashStretch> | null>(null);

  /* Option changes need a fresh control bound to the same ball. */
  createEffect(() => {
    if (reduced) return;
    setDeform(
      createSquashStretch(() => ball, {
        source: y,
        maxStretch: maxStretch(),
        fullSpeed: 500,
        impactThreshold: 4000,
      }),
    );
  });

  /* Autoplay bounce: accelerate down, launch back up, repeat. Under
     reduced motion the ball rests at the bottom, statically. */
  let cancelled = false;
  let current: { stop(): void } | null = null;

  const cycle = (): void => {
    if (cancelled) return;
    const down = animate(y(), FLOOR, {
      duration: 380,
      easing: "easeInQuad",
      onUpdate: setY,
    });
    current = down;
    void down.finished.then(() => {
      if (cancelled) return;
      const up = animate(FLOOR, 0, {
        duration: 640,
        easing: "easeOutQuad",
        onUpdate: setY,
      });
      current = up;
      return up.finished;
    }).then(() => {
      current = null;
      if (!cancelled) cycle();
    });
  };

  createEffect(() => {
    if (reduced) return;
    if (autoplay()) {
      cancelled = false;
      const id = requestAnimationFrame(() => cycle());
      onCleanup(() => {
        cancelled = true;
        current?.stop();
        current = null;
        cancelAnimationFrame(id);
      });
    } else {
      cancelled = true;
      current?.stop();
      current = null;
      setY(FLOOR);
    }
  });

  onCleanup(() => {
    cancelled = true;
    current?.stop();
  });

  const sx = () => (deform()?.scaleX() ?? 1).toFixed(3);
  const sy = () => (deform()?.scaleY() ?? 1).toFixed(3);

  const snippet = `let ball!: HTMLDivElement;
const [y, setY] = createSignal(0);

createSquashStretch(() => ball, {
  source: y,           // any motion signal: stretches along its travel
  maxStretch: ${maxStretch().toFixed(2)},
  fullSpeed: 500,      // px/s that maps to full stretch
  impactThreshold: 4000,
});

// the deform lands on the CSS "scale" property,
// so it composes with your own transform:
<div ref={ball} style={{ transform: \`translateY(\${y()}px)\` }} />`;

  return (
    <DemoShell
      title="Squash and Stretch"
      description="A bouncing ball that stretches mid-flight and pancakes on landing, the classic cartoon deform driven by a motion signal."
      snippet={snippet}
      controls={
        <Show when={!reduced}>
          <Slider
            label="Max stretch"
            min={1}
            max={1.6}
            step={0.05}
            value={maxStretch()}
            onChange={setMaxStretch}
          />
          <Toggle
            label="Autoplay bounce"
            checked={autoplay()}
            onChange={setAutoplay}
          />
        </Show>
      }
    >
      <div class="stage-col" style={{ gap: "16px" }}>
        <div
          style={{
            position: "relative",
            width: "160px",
            height: `${SHAFT_H}px`,
            "border-radius": "12px",
            background: "var(--stage)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "0",
              right: "0",
              bottom: "0",
              height: "4px",
              background: "var(--line)",
            }}
          />
          <div
            ref={ball}
            style={{
              position: "absolute",
              left: `${(160 - BALL) / 2}px`,
              top: "0",
              width: `${BALL}px`,
              height: `${BALL}px`,
              "border-radius": "50%",
              background:
                "radial-gradient(circle at 35% 30%, #93c5fd, #3b82f6 70%)",
              "box-shadow": "0 8px 20px rgba(59, 130, 246, 0.35)",
              transform: `translateY(${y()}px)`,
              "will-change": "transform",
            }}
          />
        </div>
        <div class="stage-row">
          <span class="kbd">scaleX {sx()}</span>
          <span class="kbd">scaleY {sy()}</span>
        </div>
      </div>
    </DemoShell>
  );
}
