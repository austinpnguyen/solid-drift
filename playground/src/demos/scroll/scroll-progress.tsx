import { createScrollProgress } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";

/* createScrollProgress: a 0..1 signal tracking scroll progress. */

const PARAGRAPHS = [
  "Scroll inside the box below. The bar above fills as the element moves through the viewport.",
  "With an element target, progress is 0 when the element's top edge touches the bottom of the viewport.",
  "It reaches 1 when the element's bottom edge touches the top: the element's full traversal through the viewport.",
  "Updates are rAF-throttled: no matter how many scroll or resize events fire, progress is measured at most once per frame.",
  "Listeners are passive and removed on cleanup.",
  "Pass a ref callback to track one element, or nothing at all to track page scroll.",
  "This demo tracks the scrollable box itself with () => scroller.",
];

export function ScrollProgressDemo() {
  let scroller: HTMLDivElement | undefined;

  // The library re-measures once the ref accessor resolves, so no need
  // to wait for mount before creating the primitive.
  const progress = createScrollProgress(() => scroller);

  const snippet = () =>
    `let scroller: HTMLDivElement | undefined\n` +
    `const progress = createScrollProgress(() => scroller)\n\n` +
    `<div ref={scroller} style={{ height: "220px", overflow: "auto" }}>\n` +
    `  {/* long content */}\n` +
    `</div>\n` +
    `<div\n` +
    `  style={{\n` +
    `    width: \`\${progress() * 100}%\`,\n` +
    `  }}\n` +
    `/>`;

  return (
    <DemoShell
      title="createScrollProgress"
      description="A 0..1 signal tracking scroll progress: the whole page by default, or one element when given a ref callback."
      snippet={snippet()}
    >
      <div class="stage-col">
        <div
          style={{
            width: "100%",
            height: "8px",
            "border-radius": "4px",
            background: "var(--demo-track, #e8e4da)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress() * 100}%`,
              height: "100%",
              background: "currentColor",
            }}
          />
        </div>
        <div
          ref={scroller}
          style={{
            height: "220px",
            width: "100%",
            "overflow-y": "auto",
            "border-radius": "8px",
            padding: "12px 16px",
            background: "var(--demo-well, #f4f1e9)",
            "font-size": "14px",
            "line-height": "1.6",
          }}
        >
          {PARAGRAPHS.map((p) => (
            <p style={{ margin: "0 0 24px" }}>{p}</p>
          ))}
        </div>
        <span class="kbd">progress = {progress().toFixed(2)}</span>
      </div>
    </DemoShell>
  );
}
