import { createSignal, For } from "solid-js";
import { createInView } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Toggle } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* createInView: a boolean signal that reports element visibility. */

const LABELS = ["First", "Second", "Third"];
const COLORS = ["#f6e8e8", "#e8f0f6", "#ecf6e8"];

function RevealCard(props: { once: boolean; label: string; color: string }) {
  let card: HTMLDivElement | undefined;
  const inView = createInView(() => card, { once: props.once });
  const reduced = animationsDisabled();
  const shown = () => (reduced ? true : inView());

  return (
    <div
      ref={card}
      class="stage-panel"
      style={{
        "min-height": "90px",
        "justify-content": "center",
        background: props.color,
        opacity: shown() ? 1 : 0,
        transform: `translateY(${shown() ? 0 : 24}px)`,
        transition: reduced ? "none" : "opacity 500ms ease, transform 500ms ease",
      }}
    >
      {props.label} card {shown() ? "revealed" : "waiting"}
    </div>
  );
}

function CardList(props: { once: boolean }) {
  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "120px" }}>
      {LABELS.map((label, i) => (
        <RevealCard once={props.once} label={label} color={COLORS[i]} />
      ))}
    </div>
  );
}

export function InViewDemo() {
  const [once, setOnce] = createSignal(true);

  const snippet = () =>
    `let card: HTMLDivElement | undefined\n` +
    `const inView = createInView(() => card, {\n` +
    `  threshold: 0.15,\n` +
    `  once: ${once()},\n` +
    `})\n\n` +
    `<div\n` +
    `  ref={card}\n` +
    `  style={{\n` +
    `    opacity: inView() ? 1 : 0,\n` +
    `    transform: \`translateY(\${inView() ? 0 : 24}px)\`,\n` +
    `  }}\n` +
    `/>`;

  return (
    <DemoShell
      title="createInView"
      description="A boolean signal reporting whether an element is visible, built on IntersectionObserver. Scroll the stage to reveal each card."
      snippet={snippet()}
      controls={
        <Toggle
          label="once (latch on first sight)"
          checked={once()}
          onChange={setOnce}
        />
      }
    >
      <div
        style={{
          height: "220px",
          width: "100%",
          "overflow-y": "auto",
          padding: "8px",
        }}
      >
        {/* `once` is read when the primitive is created. For is keyed by
            item identity, so flipping the key remounts the cards with the
            new option. */}
        <For each={once() ? ["once"] : ["live"]}>
          {(key) => <CardList once={key === "once"} />}
        </For>
      </div>
    </DemoShell>
  );
}
