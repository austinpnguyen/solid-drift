import { createSignal, createEffect, createMemo, onMount } from "solid-js";
import { easings, createTween, type EasingName } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Select, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* The `easings` map: plot a curve, then ride a dot along it. */

const NAMES = Object.keys(easings) as EasingName[];
const W = 320;
const H = 160;
const PAD = 16;
const PLAY_MS = 1200;

export function EasingCurvesDemo() {
  const [name, setName] = createSignal<EasingName>("easeOutCubic");
  const [playing, setPlaying] = createSignal(false);
  const [runId, setRunId] = createSignal(0);
  const reduced = animationsDisabled();

  let canvas: HTMLCanvasElement | undefined;

  // A fresh 0..1 tween on every Play press, driven by a linear tween
  // while the curve itself comes from the selected easing.
  const ride = createMemo(() => {
    const id = runId();
    const [target, setTarget] = createSignal(0);
    const tweened = createTween(target, {
      duration: PLAY_MS,
      easing: "linear",
      onComplete: () => setPlaying(false),
    });
    if (id > 0) queueMicrotask(() => setTarget(1));
    return tweened;
  });

  const t = () => ride()();

  const plotX = (u: number) => PAD + u * (W - 2 * PAD);
  const plotY = (v: number) => H - PAD - v * (H - 2 * PAD);

  const draw = () => {
    const el = canvas;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const fn = easings[name()];

    ctx.clearRect(0, 0, W, H);

    // Axes.
    ctx.strokeStyle = "#d8d2c4";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, PAD);
    ctx.lineTo(PAD, H - PAD);
    ctx.lineTo(W - PAD, H - PAD);
    ctx.stroke();

    // The curve.
    ctx.strokeStyle = "#3b3a36";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      const x = plotX(u);
      const y = plotY(fn(u));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // The dot riding the curve.
    if (playing() || t() > 0) {
      const u = t();
      ctx.fillStyle = "#b3541e";
      ctx.beginPath();
      ctx.arc(plotX(u), plotY(fn(u)), 6, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  createEffect(() => {
    name();
    t();
    playing();
    draw();
  });

  onMount(() => draw());

  const play = () => {
    if (reduced) return;
    setPlaying(true);
    setRunId((n) => n + 1);
  };

  const snippet = () =>
    `import { easings } from "solid-drift"\n\n` +
    `const fn = easings["${name()}"]\n` +
    `fn(0.5) // ${easings[name()](0.5).toFixed(3)}\n\n` +
    `// Draw the 0..1 curve:\n` +
    `ctx.beginPath()\n` +
    `for (let i = 0; i <= 100; i++) {\n` +
    `  const u = i / 100\n` +
    `  ctx.lineTo(u * width, (1 - fn(u)) * height)\n` +
    `}`;

  return (
    <DemoShell
      title="Easing curves"
      description="Every easing in the library, drawn as a curve. Press Play to ride a dot along it for 1.2 seconds."
      snippet={snippet()}
      controls={
        <>
          <Select
            label="easing"
            options={NAMES}
            value={name()}
            onChange={(n) => {
              setName(n as EasingName);
              setPlaying(false);
            }}
          />
          {!reduced && (
            <Button onClick={play} kind="primary">
              Play
            </Button>
          )}
        </>
      }
    >
      <div class="stage-col">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          style={{ width: "100%", "max-width": "340px", height: "auto" }}
          aria-label={`Easing curve for ${name()}`}
        />
        <span class="kbd">
          {name()} · fn(0.5) = {easings[name()](0.5).toFixed(3)}
        </span>
      </div>
    </DemoShell>
  );
}
