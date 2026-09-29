import { createPress, createHover } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";

/* Raw press and hover state. No animation lives in the primitives: the
   host decides how to respond. Keyboard parity is built in, so focus the
   button and press Enter or Space to see the pressed state. */

export function PressHoverDemo() {
  let btn!: HTMLButtonElement;
  const { pressed } = createPress(() => btn);
  const { hovering } = createHover(() => btn);

  const snippet = `let btn!: HTMLButtonElement;
const { pressed } = createPress(() => btn);
const { hovering } = createHover(() => btn);

<button
  ref={btn}
  style={{
    transform: pressed()
      ? "scale(0.94)"
      : hovering()
        ? "scale(1.05)"
        : "scale(1)",
  }}
>
  pressed: {String(pressed())}, hovering: {String(hovering())}
</button>`;

  return (
    <DemoShell
      title="Press and Hover"
      description="The button shrinks while pressed and grows while hovered, driven by plain press and hover state. Keyboard works too: tab to the button and hold Enter or Space."
      snippet={snippet}
    >
      <div class="stage-col" style={{ gap: "16px" }}>
        <button
          ref={btn}
          type="button"
          class="btn btn-primary"
          style={{
            "font-size": "16px",
            padding: "14px 32px",
            transform: pressed()
              ? "scale(0.94)"
              : hovering()
                ? "scale(1.05)"
                : "scale(1)",
            transition: "transform 140ms ease-out",
            "background-color": pressed()
              ? "#1d4ed8"
              : hovering()
                ? "#3b82f6"
                : "var(--accent)",
          }}
        >
          Hold me
        </button>
        <div class="stage-row">
          <span class="kbd">pressed {String(pressed())}</span>
          <span class="kbd">hovering {String(hovering())}</span>
        </div>
      </div>
    </DemoShell>
  );
}
