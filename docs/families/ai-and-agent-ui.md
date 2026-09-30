# AI and agent UI

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when building AI chat, voice, streaming, or agent interfaces.

### `createStreamReveal(ref, options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/ai/createStreamReveal)

Streaming text for chat and agent UIs: push characters as they arrive and each batch reveals with the kinetic treatment (rise, deblur, settle). Batches flush on a short cadence, or early when the queue grows past `maxBatch`, so fast streams never fall behind.

```tsx
let out!: HTMLDivElement;
const stream = createStreamReveal(() => out, { batchMs: 120, maxBatch: 24 });
const res = await fetch("/chat", { method: "POST", body: q });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  stream.push(decoder.decode(value, { stream: true }));
}
await stream.complete(); // flush the tail, then done
<div ref={out} aria-live="polite" />
```

Returns `{ push, complete, reset, status, pending }`. `status()` is `"idle"`, `"streaming"`, or `"done"`; `pending()` counts queued characters. Under reduced motion pushed text appears immediately with no per-unit animation; on the server `push` is a no-op and `status()` is `"done"`.

### `createTokenStream(options?)`

Streamed text with citation chips: AI answers cite sources as markers like `[1]`, and `push()` parses them out of the stream so each renders as a tappable chip next to the text. The buffer is re-parsed on every push, so a marker split across two chunks still resolves. Pure signals, no DOM.

```tsx
const stream = createTokenStream({
  citations: { "1": { label: "1", url: "https://example.com/source" } },
});
stream.push("Revenue grew 12% [1] last quarter.");
<For each={stream.segments()}>
  {(seg) => (
    <Show
      when={seg.kind === "citation"}
      fallback={<span>{(seg as { text: string }).text}</span>}
    >
      <a href={(seg as { citation: TokenCitation }).citation.url} class="chip">
        {(seg as { citation: TokenCitation }).citation.label}
      </a>
    </Show>
  )}
</For>;
```

Returns `{ push, complete, reset, segments, text, status }`. `segments()` is an ordered list of `{ kind: "text", text }` and `{ kind: "citation", key, citation }`; `text()` is the raw stream with markers intact for copying. Options: `citations` (marker to definition map), `pattern` (default `/\[(\d+)\]/`, first capture group is the key), `keepUnknown` (default true; unknown markers render as text, or are dropped when false). Pair with `createStreamReveal` when the text itself should animate in.

### `createAgentState(options?)`

A tiny state machine for agent UIs: `idle`, `thinking`, `streaming`, `tool`, `done`, `error`, with legal-transition gating and enter/exit hooks. Pure signals, no DOM, so it works on the server and in tests.

```ts
const agent = createAgentState({
  allowed: [
    { from: "idle", to: "thinking" },
    { from: "thinking", to: "streaming" },
    { from: "streaming", to: "tool-call" },
    { from: "tool-call", to: "streaming" },
    { from: "streaming", to: "done" },
  ],
  onEnter: (s) => console.log("agent:", s),
});
agent.set("thinking");
agent.state(); // "thinking"
agent.prev(); // "idle"
```

Agent UI recipe: `thinking` pairs with `createWobble` on typing dots, `streaming` drives `createStreamReveal`, `tool-call` overlays a `createTransition`, and `done`/`error` tint a status pill with `createColorShift`. Returns `{ state, prev, set, reset, is }`. Illegal moves are ignored. State is logic, not motion, so it behaves identically under reduced motion.

### `createApprovalGate(options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/ai/createApprovalGate)

Human in the loop for agent flows. An agent that mints, transfers, or publishes should not run unattended: `propose()` parks the flow in `"pending"`, the host renders an approve/deny UI, and the agent resumes only after a decision.

```ts
const gate = createApprovalGate({ timeoutMs: 60_000 });
gate.propose({ title: "Mint 1 NFT", description: "Costs 0.05 ETH" });
// ... the user approves in the UI ...
gate.approve();
gate.status(); // "approved"
```

Returns `{ status, request, reason, propose, approve, deny, reset }`. `status()` is `"idle"`, `"pending"`, `"approved"`, or `"denied"`; `request()` is the pending proposal; `deny(reason?)` records why. Decisions are no-ops unless pending, and `propose()` replaces a pending request. `timeoutMs` auto-denies when nobody decides in time (default 0, never). Pure signals, SSR-safe.

### `parseDriftSpec(input)`

Validates a DriftSpec, the JSON motion spec a coding agent can generate: `{ version: 1, scenes: [{ primitive, target?, options?, duration? }] }`. Supported primitives: `kineticType`, `streamReveal`, `camera`, `colorShift`, `transition`, `beat`. Throws a `DriftSpecError` naming the exact path (`scenes[0].options.duration`) on the first problem.

```ts
import { parseDriftSpec } from "solid-drift";

const spec = parseDriftSpec({
  version: 1,
  scenes: [
    {
      primitive: "kineticType",
      target: "title",
      options: { duration: 600, stagger: 40, from: { y: 40, variance: 0.5, seed: 7 } },
    },
    {
      primitive: "colorShift",
      options: {
        stops: [
          { at: 0, color: "#0a1220" },
          { at: 1, color: "#d9a441" },
        ],
        duration: 1200,
      },
      duration: 1200, // step budget: move on even if the shift is still running
    },
  ],
});
```

Prompt hint for generating specs: "Return ONLY a JSON DriftSpec: `{ version: 1, scenes: [...] }`. Each scene is `{ primitive, target?, options?, duration? }`. `primitive` is one of kineticType, streamReveal, camera, colorShift, transition, beat. `target` is a key into the refs map I provide. `options` match that primitive's options exactly. Keep scenes short; put a `duration` budget on any scene that should not block." Validation is pure and runs anywhere, including the server.

### `createSpecPlayer(spec, refs)`

Plays a validated DriftSpec: each scene runs its primitive against the matching ref from the `refs` map (`{ title: () => el }`), then the player advances. A scene `duration` acts as a budget, so a long ambient loop never stalls the reel.

```ts
const player = createSpecPlayer(spec, { title: () => titleEl });
await player.play(); // scenes in order, ends "done"
player.stop(); // halt mid-reel; the play() promise resolves
```

Returns `{ scene, status, play, stop }`. `scene()` is the live scene index (-1 before the first play). Under reduced motion `play()` applies every scene's final state instantly and ends `"done"`.

### Streaming

Token-by-token chat over OpenAI, Anthropic, Meta's Llama API, or your own provider, plus a low-level fetch-based SSE client for any event stream.

```tsx
import { createChatModel } from "solid-drift"

const chat = createChatModel({
  provider: "openai",
  apiKey: () => localStorage.getItem("openai_key") ?? "",
  model: "test-model-fast",
  system: "You are a concise assistant.",
})

// In your component:
<For each={chat.messages()}>
  {(m) => <div class={m.role}>{m.content}</div>}
</For>
<button onClick={() => chat.send(input())} disabled={chat.status() === "streaming"}>
  Send
</button>
```

- `createChatModel(options)` returns `{ messages, streamingText, status, error, send, stop, reset }`. `send(content)` appends the user message and streams the reply into a live assistant message, so UI bound to `messages()` renders token by token; `status()` is `idle`, `streaming`, or `error`. `stop()` aborts and keeps the partial reply; `send()` while streaming is ignored.
- `provider` is `"openai"`, `"anthropic"`, `"meta"`, or a custom `{ kind: "custom", stream, parseDelta }`. OpenAI and Meta (Llama API via `/compat/v1`, OpenAI-compatible) use Bearer auth and `data:` chunks terminated by `[DONE]`; Anthropic uses `x-api-key` plus `anthropic-version: 2023-06-01`, a top-level `system` prompt, and `content_block_delta` text deltas (required `maxTokens` defaults to 1024).
- Honest limitation: api.anthropic.com does not send CORS headers for browser origins, so from a browser Anthropic must go through your own server route or proxy; point `baseUrl` at it. For production with any provider, prefer a server route that holds the key and set `baseUrl` to it so keys never ship to the browser.
- `createSSE(url, options?)` is a fetch-based event-stream client (`{ status, events, lastEvent, error, connect, disconnect }`): unlike `EventSource` it supports any method and custom headers, parses the full SSE framing (named events, multi-line data, comments, chunk splits), and leaves reconnection manual via `connect()`. SSR-safe: nothing connects until `connect()` (or `autoConnect`) runs on the client.

### Voice

A full voice loop: mic metering, speech-to-text, a voice state machine, canvas waveforms, text-to-speech (browser or cloud), thinking indicators, and a voice-enabled prompt input.

```tsx
import { createVoiceState, createSpeech, createTTS, createPrompt, createChatModel } from "solid-drift"

const voice = createVoiceState()
const chat = createChatModel({ provider: "openai", apiKey: getKey, model: "test-model-fast" })
const tts = createTTS()
const prompt = createPrompt({
  onSubmit: async (text) => {
    voice.toThinking()
    await chat.send(text)
    voice.toSpeaking()
    const msgs = chat.messages()
    tts.speak(msgs[msgs.length - 1]?.content ?? "")
    voice.toIdle()
  },
})

<input
  value={prompt.value()}
  onInput={(e) => prompt.setValue(e.currentTarget.value)}
  onKeyDown={(e) => e.key === "Enter" && prompt.submit()}
/>
<button onClick={() => { voice.toListening(); prompt.toggleMic(); }}>Mic</button>
```

- `createVoiceState()` is the turn state machine: `state()` is `idle`, `listening`, `thinking`, or `speaking`, with `toIdle`/`toListening`/`toThinking`/`toSpeaking` transitions.
- `createMicLevel(options?)` returns `{ level, active, supported, analyser, error, start, stop }`: a 0..1 smoothed RMS meter from `getUserMedia` plus an `AnalyserNode` (call `start()` from a user gesture). The exposed `analyser` wires straight into `createWaveform`.
- `createSpeech(options?)` wraps the Web Speech API (`SpeechRecognition` with `webkitSpeechRecognition` fallback): `{ supported, listening, transcript, interim, error, start, stop, reset }`. Final results accumulate into `transcript()`; `continuous` sessions auto-restart if the browser ends them mid-turn.
- `createWaveform(canvas, options)` draws the analyser's time-domain wave (`mode: "line"`) or spectrum (`mode: "bars"`) on a canvas, DPR-aware, on the shared clock; under reduced motion it redraws at most every 250ms.
- `createTTS(options?)` speaks via `speechSynthesis` by default (`{ supported, speaking, voices, speak, cancel }`, async voice loading, `speak()` cancels the current utterance first) and upgrades to any cloud voice through `provider: { speak(text, { signal }) }`.
- `createThinking(options?)` cycles `"Thinking"`, `"Thinking."`, ... through `phrases` at `interval` ms: `{ text, running, start, stop }`. [Try it](https://austinpnguyen.github.io/solid-drift/#/ai/createThinking)
- `createPrompt(options?)` is the voice-enabled input: `{ value, setValue, listening, interim, supported, toggleMic, submit, clear }`. Mic finals are appended to the value as they arrive; `submit()` fires `onSubmit` and clears by default. Everything is SSR-safe: unsupported primitives report `supported: false` and their actions no-op on the server.
