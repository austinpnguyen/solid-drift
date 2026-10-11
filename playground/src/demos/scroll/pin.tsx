import { onMount, onCleanup } from "solid-js";
import { createScrollPin, createSequence } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";

/* ScrollPin: pinned section with a scrub-driven sequence inside. */

export function ScrollPinDemo() {
  let pinEl!: HTMLDivElement;
  let titleEl!: HTMLDivElement;
  let card1El!: HTMLDivElement;
  let card2El!: HTMLDivElement;
  let card3El!: HTMLDivElement;

  onMount(() => {
    const seq = createSequence();
    seq.add({
      target: () => titleEl,
      props: { y: [40, 0], opacity: [0, 1] },
      duration: 1000,
    });
    seq.add({
      target: () => card1El,
      props: { y: [60, 0], opacity: [0, 1], scale: [0.9, 1] },
      duration: 1000,
      at: 500,
    });
    seq.add({
      target: () => card2El,
      props: { y: [60, 0], opacity: [0, 1], scale: [0.9, 1] },
      duration: 1000,
      at: 1000,
    });
    seq.add({
      target: () => card3El,
      props: { y: [60, 0], opacity: [0, 1], scale: [0.9, 1] },
      duration: 1000,
      at: 1500,
    });
    const total = seq.duration();

    const pin = createScrollPin(() => pinEl, {
      end: "+=1500",
      scrub: (p) => seq.seek(p * total),
    });

    onCleanup(() => {
      pin.dispose();
      seq.dispose();
    });
  });

  const snippet = `const seq = createSequence()
// ... add steps ...
createScrollPin(() => section, {
  end: "+=1500",
  scrub: (p) => seq.seek(p * seq.duration()),
})`;

  const card = (ref: (el: HTMLDivElement) => void, n: number, text: string) => (
    <div
      ref={ref}
      style={{
        background: "#fff",
        border: "1px solid #e5e5e5",
        "border-radius": "12px",
        padding: "1.5rem",
        "min-width": "200px",
        opacity: 0,
      }}
    >
      <div style={{ "font-size": "2rem", "margin-bottom": "0.5rem" }}>
        {["🎬", "✨", "🚀"][n]}
      </div>
      <div style={{ "font-weight": 600, "margin-bottom": "0.25rem" }}>{text}</div>
      <div style={{ "font-size": "0.85rem", color: "#737373" }}>
        Scrub-driven by scroll
      </div>
    </div>
  );

  return (
    <DemoShell
      title="ScrollPin"
      description="Scroll down: the section pins in place while scroll scrubs a sequence inside it."
      snippet={snippet}
    >
      <div style={{ height: "60vh", display: "flex", "align-items": "center", "justify-content": "center" }}>
        <p style={{ color: "var(--muted)" }}>Scroll down to the pinned section ↓</p>
      </div>
      <div
        ref={pinEl}
        style={{
          "min-height": "100vh",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "center",
          gap: "2rem",
          background: "linear-gradient(180deg, #f8fafc, #e0e7ff)",
          "border-radius": "16px",
          padding: "2rem",
        }}
      >
        <h2
          ref={titleEl}
          style={{ "font-size": "2rem", "font-weight": 800, margin: 0, opacity: 0 }}
        >
          Pinned storytelling
        </h2>
        <div style={{ display: "flex", gap: "1rem", "flex-wrap": "wrap", "justify-content": "center" }}>
          {card((el) => (card1El = el), 0, "Step one")}
          {card((el) => (card2El = el), 1, "Step two")}
          {card((el) => (card3El = el), 2, "Step three")}
        </div>
        <p style={{ color: "#64748b", "font-size": "0.9rem", margin: 0 }}>
          Keep scrolling: the pin holds while the sequence plays
        </p>
      </div>
      <div style={{ height: "80vh", display: "flex", "align-items": "center", "justify-content": "center" }}>
        <p style={{ color: "var(--muted)" }}>The pin released ↑</p>
      </div>
    </DemoShell>
  );
}
