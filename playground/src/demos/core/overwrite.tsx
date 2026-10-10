import { createSignal, onCleanup } from "solid-js";
import { animate, killTweensOf } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* Overwrite: hover-spam a button, with and without overwrite management. */

export function OverwriteDemo() {
  let plainEl!: HTMLDivElement;
  let managedEl!: HTMLDivElement;

  const [interrupts, setInterrupts] = createSignal(0);

  const spam = (el: HTMLDivElement, useOverwrite: boolean) => {
    // Simulate 20 rapid hover triggers.
    for (let i = 0; i < 20; i++) {
      const target = i % 2 === 0 ? 1 : 0;
      animate(0, target, {
        id: useOverwrite ? "overwrite-demo" : `plain-${i}`,
        overwrite: useOverwrite ? "auto" : "none",
        duration: 400,
        onUpdate: (v) => {
          el.style.opacity = String(0.3 + v * 0.7);
          el.style.transform = `scale(${0.95 + v * 0.05})`;
        },
        onInterrupt: () => setInterrupts((n) => n + 1),
      });
    }
  };

  onCleanup(() => {
    killTweensOf("overwrite-demo");
  });

  const snippet = `// Without overwrite: 20 tweens fight, the end state is a coin flip.
animate(0, target, { duration: 400, onUpdate })

// With overwrite: only the latest tween survives.
animate(0, target, {
  id: "card-hover",
  overwrite: "auto", // kills the previous tween under "card-hover"
  duration: 400,
  onUpdate,
  onInterrupt: () => console.log("superseded"),
})`;

  const box = (ref: (el: HTMLDivElement) => void, label: string) => (
    <div
      ref={ref}
      style={{
        width: "120px",
        height: "120px",
        "border-radius": "16px",
        background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        color: "#fff",
        "font-weight": 600,
        "font-size": "0.85rem",
      }}
    >
      {label}
    </div>
  );

  return (
    <DemoShell
      title="Overwrite"
      description="Spam 20 rapid triggers. Without overwrite the tweens fight; with overwrite: auto only the latest survives."
      snippet={snippet}
      controls={
        <>
          <Button onClick={() => spam(plainEl, false)}>Spam (no overwrite)</Button>
          <Button onClick={() => spam(managedEl, true)}>Spam (overwrite auto)</Button>
          <span style={{ "font-size": "0.85rem", color: "var(--muted)" }}>
            interrupts: {interrupts()}
          </span>
        </>
      }
    >
      <div
        class="stage-row"
        style={{ gap: "2rem", "justify-content": "center", padding: "2rem" }}
      >
        <div style={{ "text-align": "center" }}>
          {box((el) => (plainEl = el), "none")}
          <p style={{ "font-size": "0.8rem", color: "var(--muted)", margin: "0.5rem 0 0" }}>
            overwrite: none
          </p>
        </div>
        <div style={{ "text-align": "center" }}>
          {box((el) => (managedEl = el), "auto")}
          <p style={{ "font-size": "0.8rem", color: "var(--muted)", margin: "0.5rem 0 0" }}>
            overwrite: auto
          </p>
        </div>
      </div>
    </DemoShell>
  );
}
