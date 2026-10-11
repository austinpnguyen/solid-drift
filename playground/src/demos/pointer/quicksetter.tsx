import { onCleanup } from "solid-js";
import { createQuickSetter, createQuickTo } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";

/* QuickSetter: cursor follower with direct per-frame writes vs damped glide. */

export function QuickSetterDemo() {
  let directEl!: HTMLDivElement;
  let smoothEl!: HTMLDivElement;
  let stageEl!: HTMLDivElement;

  const setDirectX = createQuickSetter(() => directEl, "x");
  const setDirectY = createQuickSetter(() => directEl, "y");
  const setSmoothX = createQuickTo(() => smoothEl, "x", { damping: 10 });
  const setSmoothY = createQuickTo(() => smoothEl, "y", { damping: 10 });

  const onMove = (e: PointerEvent) => {
    const rect = stageEl.getBoundingClientRect();
    const x = e.clientX - rect.left - 28;
    const y = e.clientY - rect.top - 28;
    setDirectX(x);
    setDirectY(y);
    setSmoothX(x);
    setSmoothY(y);
  };

  onCleanup(() => {
    stageEl?.removeEventListener("pointermove", onMove as EventListener);
  });

  const dot = (ref: (el: HTMLDivElement) => void, color: string, label: string) => (
    <div style={{ position: "absolute", top: 0, left: 0, "pointer-events": "none" }}>
      <div
        ref={ref}
        style={{
          width: "56px",
          height: "56px",
          "border-radius": "50%",
          background: color,
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          color: "#fff",
          "font-size": "0.7rem",
          "font-weight": 600,
        }}
      >
        {label}
      </div>
    </div>
  );

  const snippet = `// Direct: writes every pointermove, batched to one style write per frame.
const setX = createQuickSetter(() => el, "x");
el.addEventListener("pointermove", (e) => setX(e.clientX));

// Smoothed: glides toward the target with exponential damping.
const setSmoothX = createQuickTo(() => el, "x", { damping: 10 });`;

  return (
    <DemoShell
      title="QuickSetter"
      description="Move your pointer over the stage. Blue follows directly (one write per frame); purple glides with damping."
      snippet={snippet}
    >
      <div
        ref={stageEl}
        onPointerMove={onMove}
        style={{
          position: "relative",
          width: "100%",
          height: "280px",
          background: "var(--stage)",
          "border-radius": "12px",
          overflow: "hidden",
          cursor: "crosshair",
          "touch-action": "none",
        }}
      >
        {dot((el) => (directEl = el), "#3b82f6", "direct")}
        {dot((el) => (smoothEl = el), "#8b5cf6", "smooth")}
        <p
          style={{
            position: "absolute",
            bottom: "1rem",
            width: "100%",
            "text-align": "center",
            color: "var(--muted)",
            "font-size": "0.85rem",
            margin: 0,
            "pointer-events": "none",
          }}
        >
          Move your pointer here
        </p>
      </div>
    </DemoShell>
  );
}
