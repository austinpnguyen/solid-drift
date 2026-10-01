import { createSignal } from "solid-js";
import { validatePost, type SocialPlatform } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* Validate a draft post against real platform limits before the network
   silently truncates or rejects it. */

const PLATFORMS: SocialPlatform[] = [
  "x",
  "threads",
  "linkedin",
  "facebook",
  "instagram",
  "tiktok",
  "bluesky",
  "mastodon",
];

const LONG_EXAMPLE =
  "A deliberately over-long post for the demo. ".repeat(8) +
  "At 280 characters X rejects it, Bluesky too, but LinkedIn accepts it.";

export function ValidatePostDemo() {
  const [text, setText] = createSignal("Hello from solid-drift.");
  const [selected, setSelected] = createSignal<SocialPlatform[]>([
    "x",
    "threads",
    "instagram",
  ]);

  const toggle = (p: SocialPlatform) =>
    setSelected((list) =>
      list.includes(p) ? list.filter((q) => q !== p) : [...list, p],
    );

  const result = () =>
    validatePost({ text: text() }, selected().length ? selected() : ["x"]);

  const charCount = () => Array.from(text()).length;

  const snippet = () => `import { validatePost } from "solid-drift";

const draft = { text: ${JSON.stringify(text())} };
const validation = validatePost(draft, [${selected()
    .map((p) => `"${p}"`)
    .join(", ")}]);

// valid: ${result().valid}
// issues: ${JSON.stringify(result().issues.map((i: { message: string }) => i.message))}`;

  return (
    <DemoShell
      title="Validate Post"
      description="Check a draft against platform character limits."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <label class="ctl">
            <span class="ctl-label">
              Post text <b>{charCount()} chars</b>
            </span>
            <textarea
              value={text()}
              rows={4}
              style={{ width: "100%", "font-family": "inherit" }}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </label>
          <div class="stage-row">
            <Button
              onClick={() => setText(LONG_EXAMPLE)}
              kind="ghost"
            >
              Over-long example
            </Button>
            <Button onClick={() => setText("")} kind="ghost">
              Clear
            </Button>
          </div>
          <span class="ctl-label">Platforms</span>
          <div class="stage-row" style={{ "flex-wrap": "wrap" }}>
            {PLATFORMS.map((p) => (
              <button
                type="button"
                class={`btn btn-sm ${
                  selected().includes(p) ? "btn-primary" : "btn-ghost"
                }`}
                aria-pressed={selected().includes(p)}
                onClick={() => toggle(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div class="stage-col">
        <div class="stage-panel">
          <div class="stage-row">
            <span class="kbd">valid</span>
            <b style={{ color: result().valid ? "var(--success)" : "var(--error)" }}>
              {String(result().valid)}
            </b>
          </div>
          {result().issues.length > 0 ? (
            <ul style={{ margin: "8px 0 0", "padding-left": "20px" }}>
              {result().issues.map((issue: { message: string }) => (
                <li style={{ "margin-bottom": "4px" }}>{issue.message}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: "8px 0 0", opacity: 0.7 }}>
              No issues. Ready to publish.
            </p>
          )}
        </div>
      </div>
    </DemoShell>
  );
}
