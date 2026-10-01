import { createSignal, createMemo, For } from "solid-js";
import { easings, createTween, type EasingName } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* Easing comparison: race four easings side by side. */

const COMPARE: EasingName[] = [
  "easeOutCubic",
  "easeInOutCubic",
  "easeOutBack",
  "easeOutElastic",
];

const W = 140;
const H = 100;
const PAD = 10;

export function EasingCompareDemo() {
  const [runId, setRunId] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);

  const play = () => {
    setRunId((id) => id + 1);
    setPlaying(true);
  };

  return (
    <DemoShell
      title="Easing comparison"
      description="Four easings racing side by side. Same duration, same distance: the curve is the only difference."
      snippet={COMPARE.map((n) => `createTween(t, { easing: "${n}" })`).join("\n")}
      controls={<Button onClick={play}>Race</Button>}
    >
      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(2, 1fr)",
          gap: "1rem",
        }}
      >
        <For each={COMPARE}>
          {(name) => <EasingLane name={name} runId={runId()} />}
        </For>
      </div>
    </DemoShell>
  );
}

function EasingLane(props: { name: EasingName; runId: number }) {
  const [target, setTarget] = createSignal(0);
  const tweened = createMemo(() => {
    const id = props.runId;
    const t = createTween(target, {
      duration: 1200,
      easing: props.name,
    });
    if (id > 0) queueMicrotask(() => setTarget(1));
    return t;
  });

  const value = () => tweened()();
  const fn = easings[props.name];

  const plotX = (u: number) => PAD + u * (W - 2 * PAD);
  const plotY = (v: number) => H - PAD - v * (H - 2 * PAD);

  let canvas: HTMLCanvasElement | undefined;

  const draw = () => {
    const el = canvas;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Curve.
    ctx.strokeStyle = "#d8d2c4";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const x = plotX(u);
      const y = plotY(fn(u));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Racing dot.
    const u = value();
    ctx.fillStyle = "#b3541e";
    ctx.beginPath();
    ctx.arc(plotX(u), plotY(fn(u)), 5, 0, Math.PI * 2);
    ctx.fill();
  };

  // Redraw on every frame.
  createMemo(() => {
    value();
    draw();
  });

  return (
    <div>
      <p style={{ "font-size": "0.8rem", "font-weight": 600, "margin-bottom": "0.25rem" }}>
        {props.name}
      </p>
      <canvas
        ref={canvas}
        width={W}
        height={H}
        style={{ width: "100%", height: "auto", background: "#f8f7f4", "border-radius": "8px" }}
      />
    </div>
  );
}
