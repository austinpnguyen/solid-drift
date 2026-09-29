# Analytics

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when you need lightweight, consent-aware analytics.

### Analytics

```tsx
import { createTracker, useConsent, createFunnel } from "solid-drift";

const consent = useConsent({ storageKey: "my-app:consent" });
// consent.grant(), consent.deny(), consent.reset()

const tracker = createTracker({
  sink: (events) => fetch("/api/events", {
    method: "POST",
    body: JSON.stringify(events),
  }),
  consent: consent.granted, // holds events until granted
  batchMs: 5000,
});
tracker.track("signup", { plan: "pro" });
tracker.identify(userId);
tracker.page("pricing");

const funnel = createFunnel({
  name: "checkout",
  steps: ["cart", "details", "payment", "done"],
  tracker,
  windowMs: 30 * 60 * 1000,
});
funnel.enter();
funnel.advance(); // cart -> details
```

- `createTracker({ sink?, batchMs?, batchSize?, consent?, blockProps?, sampleRate?, now?, maxQueue? })`: `{ track, identify, page, queue, flush, reset, enabled, setEnabled }`. Events batch by time (`batchMs`, default 5000) or size (`batchSize`, default 50) and go to `sink`; the default sink keeps them in the in-memory `queue()` for inspection. The library never sends data anywhere itself. While `consent` is false, events are held (not dropped) and flush when consent is granted. `blockProps` strips sensitive keys, `sampleRate` downsamples, `identify` attaches a user id, `page` tracks a `$page` event.
- `useConsent({ storageKey?, storage? })`: `{ consent, granted, grant, deny, reset }`. Consent state (`"unknown"`, `"granted"`, `"denied"`) persisted to localStorage when `storageKey` is given. `granted()` plugs straight into the tracker's `consent` option.
- `createFunnel({ name, steps, tracker?, windowMs?, now? })`: `{ step, current, completed, history, enter, advance, abandon, reset }`. Emits `funnel_enter`, `funnel_step`, `funnel_complete` (with `durationMs`), and `funnel_abandon` (with `reason` and last step) through the tracker. `advance()` goes to the next step, `advance("payment")` jumps forward; advancing after `windowMs` auto-abandons with reason `"expired"`.
