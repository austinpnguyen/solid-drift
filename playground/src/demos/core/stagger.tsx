import { createSignal } from "solid-js";
import { createStagger } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* createStagger: a delay lookup so list items entrance one after another. */

const COUNT = 6;

export function StaggerDemo() {
  const [delay, setDelay] = createSignal(120);
  const [shown, setShown] = createSignal(true);

  const stagger = () => createStagger(COUNT, delay());
  const reduced = animationsDisabled();

  const replay = () => {
    setShown(false);
    // Next frame, flip back on so each box transitions in again.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShown(true));
    });
  };

  const snippet = () =>
    `const at = createStagger(${COUNT}, ${delay()}) // ${delay()}ms apart\n\n` +
    `<For each={items}>\n` +
    `  {(item, i) => (\n` +
    `    <div\n` +
    `      style={{\n` +
    `        transition: "opacity 300ms, transform 300ms",\n` +
    `        transitionDelay: \`\${at(i())}ms\`,\n` +
    `        opacity: shown() ? 1 : 0,\n` +
    `      }}\n` +
    `    >\n` +
    `      {item}\n` +
    `    </div>\n` +
    `  )}\n` +
    `</For>`;

  return (
    <DemoShell
      title="createStagger"
      description="A delay lookup for cascading motion: each item waits index times delayMs before it starts."
      snippet={snippet()}
      controls={
        <>
          <Slider
            label="delay (ms)"
            min={0}
            max={400}
            step={10}
            value={delay()}
            onChange={setDelay}
          />
          <Button onClick={replay}>Replay</Button>
        </>
      }
    >
      <div class="stage-row" style={{ "flex-wrap": "wrap" }}>
        {Array.from({ length: COUNT }, (_, i) => (
          <div
            class="stage-box"
            style={{
              width: "64px",
              height: "64px",
              "justify-content": "center",
              opacity: shown() ? 1 : 0,
              transform: `translateY(${shown() ? 0 : 16}px)`,
              transition: reduced
                ? "none"
                : "opacity 300ms ease, transform 300ms ease",
              "transition-delay": reduced ? "0ms" : `${stagger()(i)}ms`,
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </DemoShell>
  );
}
