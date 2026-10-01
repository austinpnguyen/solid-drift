import { createSignal, createMemo, For, onMount } from "solid-js";
import { easings, createTween, type EasingName } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

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
  const reduced = animationsDisabled();

  const play = () => {
    setRunId((id) => id + 1);
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
          {(name) => (
            <EasingLane name={name} runId={runId()} reduced={reduced} />
          )}
        </For>
      </div>
    </DemoShell>
  );
}

function EasingLane(props: { name: EasingName; runId: number; reduced: boolean }) {
  const [target, setTarget] = createSignal(0);

  // Rebuild the tween on every race. Reset to 0 first so the button
  // works on repeat clicks.
  const tweened = createMemo(() => {
    const id = props.runId;
    setTarget(0);
    const t = createTween(target, {
      duration: props.reduced ? 0 : 1200,
      easing: props.name,
    });
    if (id > 0) queueMicrotask(() => setTarget(1));
    return t;
  });

  const value = () => tweened()();
  const fn = easings[props.name];

  const plotX = (u: number) => PAD + u * (W - 2 * PAD);
  // Headroom for overshoot: easeOutElastic peaks at ~1.37, easeOutBack at ~1.1.
  const V_MIN = -0.2;
  const V_MAX = 1.5;
  const plotY = (v: number) =>
    H - PAD - ((v - V_MIN) / (V_MAX - V_MIN)) * (H - 2 * PAD);

  let canvas: HTMLCanvasElement | undefined;

  // Scale the backing store for sharp rendering on hidpi displays.
  onMount(() => {
    const el = canvas;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = W * dpr;
    el.height = H * dpr;
    draw();
  });

  const draw = () => {
    const el = canvas;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // setTransform is idempotent: ensures 1 CSS px = dpr device px.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
      <p style={{ "font-size": "0.8rem", "font-weight": 600, margin: "0 0 0.25rem 0" }}>
        {props.name}
      </p>
      <canvas
        ref={canvas}
        width={W}
        height={H}
        role="img"
        aria-label={`${props.name} easing curve`}
        style={{ width: "100%", height: "auto", background: "var(--stage)", "border-radius": "8px" }}
      />
    </div>
  );
}
