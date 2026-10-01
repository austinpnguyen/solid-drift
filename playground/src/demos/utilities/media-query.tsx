import { For } from "solid-js";
import { createMediaQuery } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";

/* Live boolean signals for CSS media queries. Resize the browser or flip
   your OS theme to watch the badges change in real time. */

const QUERIES = [
  "(max-width: 860px)",
  "(prefers-reduced-motion: reduce)",
  "(pointer: coarse)",
];

export function MediaQueryDemo() {
  const matches = QUERIES.map((q) => ({ query: q, on: createMediaQuery(q) }));

  const snippet = `import { createMediaQuery } from "solid-drift";

const isNarrow = createMediaQuery("(max-width: 860px)");
const reducedMotion = createMediaQuery("(prefers-reduced-motion: reduce)");
const coarsePointer = createMediaQuery("(pointer: coarse)");

const columns = () => (isNarrow() ? 1 : 3);`;

  return (
    <DemoShell
      title="Media query"
      description="Boolean signals that track CSS media queries and update live as the viewport changes."
      snippet={snippet}
    >
      <div class="stage-col">
        <For each={matches}>
          {({ query, on }) => (
            <div class="stage-row">
              <span class="kbd">{query}</span>
              <span class="stage-badge">{on() ? "true" : "false"}</span>
            </div>
          )}
        </For>
        <p>
          These update live. Try resizing the window, turning on reduced
          motion in your OS settings, or opening this on a phone.
        </p>
      </div>
    </DemoShell>
  );
}
