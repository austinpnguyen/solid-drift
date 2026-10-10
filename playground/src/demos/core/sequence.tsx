import { createSignal, onCleanup } from "solid-js";
import { createSequence } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button, Slider } from "../../framework/controls";

/* Sequence: choreographed timeline with overlap, labels, and a seek scrubber. */

export function SequenceDemo() {
  let titleEl!: HTMLDivElement;
  let subEl!: HTMLDivElement;
  let ctaEl!: HTMLDivElement;
  let badgeEl!: HTMLDivElement;
  let cardEl!: HTMLDivElement;

  const [progress, setProgress] = createSignal(0);
  const [status, setStatus] = createSignal("idle");

  const seq = createSequence();
  seq.addLabel("start", 0);
  seq.add({
    target: () => badgeEl,
    props: { y: [16, 0], opacity: [0, 1] },
    duration: 400,
    at: "start",
  });
  seq.add({
    target: () => titleEl,
    props: { y: [32, 0], opacity: [0, 1] },
    duration: 600,
    at: "-=200",
  });
  seq.add({
    target: () => subEl,
    props: { y: [24, 0], opacity: [0, 1] },
    duration: 500,
    at: "-=350",
  });
  seq.add({
    target: () => ctaEl,
    props: { y: [16, 0], opacity: [0, 1], scale: [0.95, 1] },
    duration: 450,
    at: "-=300",
  });
  seq.add({
    target: () => cardEl,
    props: { y: [40, 0], opacity: [0, 1], rotation: [-2, 0] },
    duration: 700,
    at: "-=250",
  });

  const total = seq.duration;

  onCleanup(() => {
    seq.dispose();
  });

  const play = async () => {
    setStatus("playing");
    await seq.play();
    setStatus("done");
    setProgress(100);
  };

  const onScrub = (v: number) => {
    setProgress(v);
    seq.seek((v / 100) * total());
    setStatus("idle");
  };

  const snippet = `const intro = createSequence()
intro.addLabel("start", 0)
intro.add({
  target: () => titleEl,
  props: { y: [32, 0], opacity: [0, 1] },
  duration: 600, at: "-=200", // overlap!
})
await intro.play()
// scrub: intro.seek(progress * intro.duration())`;

  return (
    <DemoShell
      title="Sequence"
      description="Choreographed timeline with overlap, labels, and nesting. Drag the scrubber to seek to any moment."
      snippet={snippet}
      controls={
        <>
          <Button onClick={play}>Play</Button>
          <Button onClick={() => seq.reverse()}>Reverse</Button>
          <Slider
            label="Scrub"
            min={0}
            max={100}
            value={progress()}
            onChange={onScrub}
          />
          <span style={{ "font-size": "0.85rem", color: "var(--muted)" }}>
            {status()}
          </span>
        </>
      }
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          "min-height": "280px",
          background: "var(--stage)",
          "border-radius": "12px",
          overflow: "hidden",
          padding: "2rem",
          "text-align": "center",
        }}
      >
        <div
          ref={badgeEl}
          style={{
            display: "inline-block",
            padding: "0.25rem 1rem",
            "border-radius": "9999px",
            background: "#f3f4f6",
            "font-size": "0.875rem",
            opacity: 0,
          }}
        >
          New: solid-drift is out
        </div>
        <h2
          ref={titleEl}
          style={{
            "font-size": "2.5rem",
            "font-weight": 800,
            "letter-spacing": "-0.02em",
            margin: "1rem 0",
            opacity: 0,
          }}
        >
          Motion that feels alive
        </h2>
        <p ref={subEl} style={{ color: "#525252", opacity: 0 }}>
          Signal-native animation for SolidJS.
        </p>
        <div ref={ctaEl} style={{ margin: "1.5rem 0", opacity: 0 }}>
          <Button onClick={() => {}}>Get started</Button>
        </div>
        <div
          ref={cardEl}
          style={{
            display: "inline-block",
            padding: "1rem 2rem",
            background: "#fff",
            "border-radius": "12px",
            border: "1px solid #e5e5e5",
            "font-size": "0.875rem",
            opacity: 0,
          }}
        >
          Overlapped entrance, zero hand-rolled timers
        </div>
      </div>
    </DemoShell>
  );
}
