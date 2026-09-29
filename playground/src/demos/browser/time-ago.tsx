import { createSignal, For, Show } from "solid-js";
import { createTimeAgo } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Select } from "../../framework/controls";

/* Relative timestamps that recompute on an interval. The dates are frozen
   at mount; only the "now" tick moves, so the labels drift like the real
   thing. */

interface Row {
  label: string;
  at: number;
}

const ROWS: Row[] = [
  { label: "45 seconds ago", at: Date.now() - 45_000 },
  { label: "5 minutes ago", at: Date.now() - 5 * 60_000 },
  { label: "3 hours ago", at: Date.now() - 3 * 3_600_000 },
  { label: "2 days ago", at: Date.now() - 2 * 86_400_000 },
];

function TimeAgoStage(props: { updateIntervalMs: number; locale: string }) {
  const rows = ROWS.map((row) => ({
    ...row,
    ago: createTimeAgo(() => row.at, {
      updateIntervalMs: props.updateIntervalMs,
      locale: props.locale,
    }),
  }));

  return (
    <div class="stage-col">
      <For each={rows}>
        {(row) => (
          <div class="stage-row">
            <span class="kbd">{row.label}</span>
            <span class="stage-box">{row.ago()}</span>
          </div>
        )}
      </For>
    </div>
  );
}

export function TimeAgoDemo() {
  const [updateIntervalMs, setUpdateIntervalMs] = createSignal(1000);
  const [locale, setLocale] = createSignal("en");

  const snippet = () =>
    `import { createTimeAgo } from "solid-drift";

const ago = createTimeAgo(() => postedAt(), {
  updateIntervalMs: ${updateIntervalMs()},
  locale: "${locale()}",
});

<p>{ago()}</p> // "5 minutes ago"`;

  return (
    <DemoShell
      title="Time ago"
      description="Relative timestamps (5 minutes ago, yesterday) that refresh on an interval."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <Slider
            label="Update interval (ms)"
            min={1000}
            max={30000}
            step={1000}
            value={updateIntervalMs()}
            onChange={setUpdateIntervalMs}
          />
          <Select
            label="Locale"
            options={["en", "vi", "fr", "de"]}
            value={locale()}
            onChange={setLocale}
          />
        </div>
      }
    >
      <Show
        when={{ updateIntervalMs: updateIntervalMs(), locale: locale() }}
        keyed
      >
        {(opts) => (
          <TimeAgoStage
            updateIntervalMs={opts.updateIntervalMs}
            locale={opts.locale}
          />
        )}
      </Show>
    </DemoShell>
  );
}
