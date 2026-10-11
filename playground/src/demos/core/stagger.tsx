import { createSignal, createMemo } from "solid-js";
import { createStagger } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* createStagger: a delay lookup so list items entrance one after another. */

const COUNT = 9;

type FromMode = "first" | "last" | "center";

export function StaggerDemo() {
  const [delay, setDelay] = createSignal(120);
  const [shown, setShown] = createSignal(true);
  const [from, setFrom] = createSignal<FromMode>("first");
  const [gridMode, setGridMode] = createSignal(false);

  const stagger = createMemo(() =>
    createStagger(COUNT, delay(), {
      from: from(),
      grid: gridMode() ? [3, 3] : undefined,
    }),
  );
  const reduced = animationsDisabled();

  const replay = () => {
    setShown(false);
    // Next frame, flip back on so each box transitions in again.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShown(true));
    });
  };

  const snippet = () =>
    `const at = createStagger(${COUNT}, ${delay()}, { from: "${from()}"${gridMode() ? ', grid: [3, 3]' : ''} })\n\n` +
    `<For each={items}>\n` +
    `  {(item, i) => (\n` +
    `    <div style={{ transitionDelay: \`\${at(i())}ms\` }}>\n` +
    `      {item}\n` +
    `    </div>\n` +
    `  )}\n` +
    `</For>`;

  return (
    <DemoShell
      title="createStagger"
      description="A delay lookup for cascading motion. Try from center or 3x3 grid mode."
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
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {(["first", "last", "center"] as FromMode[]).map((m) => (
              <Button
                onClick={() => setFrom(m)}
                kind={from() === m ? "primary" : "ghost"}
              >
                {m}
              </Button>
            ))}
          </div>
          <Button
            onClick={() => setGridMode((g) => !g)}
            kind={gridMode() ? "primary" : "ghost"}
          >
            {gridMode() ? "Grid 3x3 on" : "Grid 3x3 off"}
          </Button>
          <Button onClick={replay}>Replay</Button>
        </>
      }
    >
      <div
        class="stage-row"
        style={{
          "flex-wrap": "wrap",
          "max-width": gridMode() ? "240px" : "none",
          margin: gridMode() ? "0 auto" : undefined,
        }}
      >
        {Array.from({ length: COUNT }, (_, i) => (
          <div
            class="stage-box"
            style={{
              width: "64px",
              height: "64px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              color: "#fff",
              "font-weight": "700",
              "font-size": "1.25rem",
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
