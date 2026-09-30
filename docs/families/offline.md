# Offline

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when mutations must survive flaky networks.

### Offline queue

```tsx
import { createOfflineQueue } from "solid-drift";

const outbox = createOfflineQueue({
  send: (payload) =>
    fetch("/api/messages", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  storageKey: "my-app:outbox", // persist across reloads
});
outbox.enqueue({ text: "hello" }); // sends now, or when back online
```

`createOfflineQueue({ send, online?, maxAttempts?, retryDelayMs?, storageKey?, capacity?, onDrain?, onDead? })`: `{ queue, dead, pending, status, error, enqueue, flush, remove, retryDead, clear }`. `enqueue()` sends immediately when online, otherwise waits for reconnect; the queue replays in order with exponential backoff (`retryDelayMs`, default 1000, doubled per attempt). Mutations that exhaust `maxAttempts` (default 5) are parked in `dead()` for the UI to surface, and `retryDead(id)` puts one back. `status()` is `"online"`, `"offline"`, or `"flushing"`. Online state defaults to the window `online`/`offline` events (assumes online on the server); pass your own `online` accessor to override. `storageKey` persists the queue to localStorage (payloads must be JSON-serializable). SSR-safe. [Try it](https://austinpnguyen.github.io/solid-drift/#/offline/createOfflineQueue)
