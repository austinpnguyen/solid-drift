import { createSignal, For, Show } from "solid-js";
import { createOfflineQueue } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Toggle, Button } from "../../framework/controls";

/* An offline-first outbox. Flip the Online toggle off, enqueue a few fake
   mutations, then flip it back on and watch the queue replay in order. */

interface Mutation {
  label: string;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function OfflineQueueDemo() {
  const [online, setOnline] = createSignal(true);
  const [sent, setSent] = createSignal(0);
  const [counter, setCounter] = createSignal(0);

  const outbox = createOfflineQueue<Mutation>({
    send: async (payload) => {
      await wait(300);
      if (!online()) throw new Error("device is offline");
      setSent((n) => n + 1);
    },
    online,
    maxAttempts: 5,
    retryDelayMs: 1000,
  });

  const enqueue = (): void => {
    setCounter((n) => n + 1);
    outbox.enqueue({ label: `Draft ${counter()}` });
  };

  const snippet = `import { createOfflineQueue } from "solid-drift";

const outbox = createOfflineQueue({
  send: async (payload) => {
    await wait(300);
    if (!online()) throw new Error("device is offline");
  },
  online: () => online(), // wired to the toggle
  maxAttempts: 5,
  retryDelayMs: 1000,
});

outbox.enqueue({ label: "Draft 1" });
outbox.flush();`;

  return (
    <DemoShell
      title="Offline queue"
      description="Mutations that wait while offline and replay in order on reconnect."
      snippet={snippet}
      controls={
        <Toggle label="Online" checked={online()} onChange={setOnline} />
      }
    >
      <div class="stage-col">
        <div class="stage-row">
          <span class="kbd">status: {outbox.status()}</span>
          <span class="kbd">pending: {outbox.pending()}</span>
          <span class="kbd">sent: {sent()}</span>
        </div>
        <div class="stage-row">
          <Button onClick={enqueue}>Enqueue</Button>
          <Button kind="ghost" onClick={() => void outbox.flush()}>
            Flush now
          </Button>
          <Button kind="ghost" onClick={() => outbox.clear()}>
            Clear
          </Button>
        </div>
        <Show when={outbox.queue().length > 0} fallback={<p>Queue is empty.</p>}>
          <div class="stage-col">
            <For each={outbox.queue()}>
              {(m) => (
                <div class="stage-row">
                  <span class="kbd">{m.payload.label}</span>
                  <span class="kbd">attempts: {m.attempts}</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    onClick={() => outbox.remove(m.id)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={outbox.dead().length > 0}>
          <div class="stage-col">
            <p>Dead (exhausted attempts):</p>
            <For each={outbox.dead()}>
              {(m) => (
                <div class="stage-row">
                  <span class="kbd">{m.payload.label}</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    onClick={() => outbox.retryDead(m.id)}
                  >
                    Retry
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </DemoShell>
  );
}
