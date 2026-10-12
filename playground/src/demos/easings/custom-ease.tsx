import { createSignal, onMount } from "solid-js";
import { createCustomEase, animate } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* CustomEase: draw a curve, get an easing. Type SVG path data for the
   0..1 box (or pick a preset), see the curve plotted, then play a box
   across the stage with your easing. */

const PRESETS: Record<string, string> = {
  Snap: "M0,0 C0.2,0 0.4,1 1,1",
  Smooth: "M0,0 C0.4,0 0.6,1 1,1",
  Bounce: "M0,0 C0.3,0 0.3,1.2 0.6,0.8 C0.8,0.5 0.9,1 1,1",
  Linear: "M0,0 L1,1",
};

const W = 320;
const H = 160;
const PAD = 16;

export function CustomEaseDemo() {
  let box!: HTMLDivElement;
  const [pathD, setPathD] = createSignal(PRESETS.Snap);
  const [error, setError] = createSignal("");
  const [playing, setPlaying] = createSignal(false);

  const plotX = (u: number) => PAD + u * (W - 2 * PAD);
  // SVG y is down; easing y=0 at bottom.
  const plotY = (v: number) => H - PAD - v * (H - 2 * PAD);

  function curvePoints(): string {
    try {
      const ease = createCustomEase(pathD());
      const pts: string[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        pts.push(`${plotX(t).toFixed(1)},${plotY(ease(t)).toFixed(1)}`);
      }
      if (error()) setError("");
      return "M" + pts.join(" L");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return "";
    }
  }

  const play = () => {
    let ease;
    try {
      ease = createCustomEase(pathD());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setPlaying(true);
    animate(0, 1, {
      duration: 1200,
      easing: ease,
      onUpdate: (t) => {
        box.style.transform = `translateX(${(t * 260).toFixed(1)}px)`;
      },
      onComplete: () => {
        setPlaying(false);
        box.style.transform = "";
      },
    });
  };

  onMount(() => {
    // Validate the default preset on load.
    curvePoints();
  });

  const snippet = `import { createCustomEase } from "solid-drift"

const snap = createCustomEase("M0,0 C0.2,0 0.4,1 1,1")
animate(0, 100, { easing: snap, duration: 600, onUpdate })`;

  return (
    <DemoShell
      title="Custom Ease"
      description="Draw a curve as SVG path data in the 0..1 box and get a real easing. X must increase monotonically."
      snippet={snippet}
      controls={
        <>
          {Object.entries(PRESETS).map(([name, d]) => (
            <Button
              kind={pathD() === d ? "primary" : "ghost"}
              onClick={() => setPathD(d)}
            >
              {name}
            </Button>
          ))}
          <Button onClick={play} kind="primary">
            Play
          </Button>
        </>
      }
    >
      <div style={{ width: "100%", display: "flex", "flex-direction": "column", gap: "12px", "align-items": "center" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "320px", "max-width": "100%", height: "auto", background: "var(--stage)", "border-radius": "12px" }}
        >
          {/* axes */}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--line)" stroke-width="1" />
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--line)" stroke-width="1" />
          {/* the curve */}
          <path d={curvePoints()} fill="none" stroke="#3b82f6" stroke-width="2.5" />
        </svg>
        <input
          type="text"
          value={pathD()}
          onInput={(e) => setPathD(e.currentTarget.value)}
          spellcheck={false}
          style={{
            width: "100%",
            "max-width": "420px",
            padding: "8px 12px",
            "border-radius": "8px",
            border: "1px solid var(--line)",
            "font-family": "monospace",
            "font-size": "0.8rem",
          }}
          aria-label="SVG path data for the easing curve"
        />
        {error() && (
          <p style={{ color: "#ef4444", "font-size": "0.8rem", margin: 0 }}>{error()}</p>
        )}
        <div
          style={{
            width: "100%",
            "max-width": "420px",
            height: "56px",
            background: "var(--stage)",
            "border-radius": "12px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            ref={box}
            style={{
              position: "absolute",
              top: "12px",
              left: "12px",
              width: "32px",
              height: "32px",
              "border-radius": "8px",
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            }}
          />
        </div>
      </div>
    </DemoShell>
  );
}
