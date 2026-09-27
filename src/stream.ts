import { createSignal, onCleanup, type Accessor } from "solid-js";

/* ------------------------------------------------------------------ */
/* Shared SSE parsing                                                  */
/* ------------------------------------------------------------------ */

/** One parsed Server-Sent Event. */
export interface SSEEvent {
  /** Event name; defaults to "message" when the stream sets none. */
  event: string;
  /** Payload: data lines joined with newlines. */
  data: string;
  /** Last `id:` field seen, if any. */
  id?: string;
}

/**
 * Feed raw text chunks through the SSE framing rules and call
 * `onEvent` for each dispatched event. Handles events split across
 * chunk boundaries, multi-line `data:` payloads, and `:` comments.
 */
export function createSSEParser(
  onEvent: (event: SSEEvent) => void,
): (chunk: string) => void {
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  let id: string | undefined;

  const dispatch = (): void => {
    if (data.length === 0 && event === "message") {
      event = "message";
      id = undefined;
      return;
    }
    onEvent({ event, data: data.join("\n"), ...(id ? { id } : {}) });
    event = "message";
    data = [];
    id = undefined;
  };

  return (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") {
        dispatch();
        continue;
      }
      if (line.startsWith(":")) continue; // comment / keep-alive
      const colon = line.indexOf(":");
      let field = line;
      let value = "";
      if (colon >= 0) {
        field = line.slice(0, colon);
        value = line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
      }
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
      else if (field === "id") id = value;
      // "retry:" is noted but reconnection stays manual: call connect().
    }
  };
}

type FetchFn = typeof fetch;

/** Connection state of a stream. */
export type StreamStatus = "idle" | "connecting" | "open" | "closed" | "error";

/**
 * Read a fetch Response body as SSE, dispatching parsed events.
 * Resolves when the stream ends cleanly; rejects on HTTP errors.
 */
async function pumpSSE(
  response: Response,
  onEvent: (event: SSEEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Stream request failed: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 200)}` : ""}`,
    );
  }
  const feed = createSSEParser(onEvent);
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) return;
      feed(decoder.decode(value, { stream: true }));
    }
  } finally {
    feed(decoder.decode());
    reader.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* createSSE                                                           */
/* ------------------------------------------------------------------ */

export interface SSEOptions {
  /** HTTP method. Default "GET". */
  method?: string;
  /** Extra headers, or a function returning them per connection. */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** JSON-encoded request body (for POST-style SSE endpoints). */
  body?: unknown;
  /** Only surface events with this name. */
  event?: string;
  /** Called for each parsed event (after the name filter). */
  onEvent?: (event: SSEEvent) => void;
  /** Called when the stream opens (first byte accepted). */
  onOpen?: () => void;
  /** Called when the stream ends cleanly. */
  onDone?: () => void;
  /** Called on connection or HTTP errors. */
  onError?: (error: Error) => void;
  /** Connect immediately on creation. Default true. */
  autoConnect?: boolean;
  /** Fetch implementation (for tests or custom transports). */
  fetchFn?: FetchFn;
}

export interface SSEControls {
  /** Connection state. */
  status: Accessor<StreamStatus>;
  /** All parsed events received on this connection. */
  events: Accessor<SSEEvent[]>;
  /** The most recent event, if any. */
  lastEvent: Accessor<SSEEvent | null>;
  /** The last error, if any. */
  error: Accessor<Error | null>;
  /** Open (or re-open) the stream. */
  connect: () => void;
  /** Close the stream and abort the request. */
  disconnect: () => void;
}

/**
 * A fetch-based Server-Sent Events client.
 *
 * Unlike `EventSource`, this works with any HTTP method and custom
 * headers, so it can reach authenticated or POST-style SSE endpoints.
 * There is no automatic reconnection: a dropped stream moves to
 * "closed" (or "error") and `connect()` re-opens it manually.
 *
 * SSR-safe: nothing connects until `connect()` runs (or
 * `autoConnect` fires on the client).
 *
 * ```ts
 * const sse = createSSE("https://api.example.com/events", {
 *   headers: { Authorization: `Bearer ${token}` },
 *   onEvent: (ev) => console.log(ev.event, ev.data),
 * });
 * sse.disconnect();
 * ```
 */
export function createSSE(
  url: string | (() => string),
  options: SSEOptions = {},
): SSEControls {
  const {
    method = "GET",
    headers,
    body,
    event: eventFilter,
    onEvent,
    onOpen,
    onDone,
    onError,
    autoConnect = true,
    fetchFn,
  } = options;

  const [status, setStatus] = createSignal<StreamStatus>("idle");
  const [events, setEvents] = createSignal<SSEEvent[]>([]);
  const [lastEvent, setLastEvent] = createSignal<SSEEvent | null>(null);
  const [error, setError] = createSignal<Error | null>(null);

  let controller: AbortController | null = null;

  const disconnect = (): void => {
    controller?.abort();
    controller = null;
    if (status() === "connecting" || status() === "open") {
      setStatus("closed");
    }
  };

  const connect = (): void => {
    disconnect();
    const target = typeof url === "function" ? url() : url;
    const fetchImpl: FetchFn =
      fetchFn ?? (typeof fetch !== "undefined" ? fetch : null as never);
    if (!fetchImpl) {
      const err = new Error("createSSE: no fetch implementation available");
      setError(err);
      setStatus("error");
      onError?.(err);
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    setError(null);
    setStatus("connecting");
    const resolvedHeaders =
      typeof headers === "function" ? headers() : (headers ?? {});
    const init: RequestInit = { method, headers: resolvedHeaders, signal };
    if (body !== undefined) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
      (init.headers as Record<string, string>)["Content-Type"] ??=
        "application/json";
    }
    void (async () => {
      try {
        const response = await fetchImpl(target, init);
        if (signal.aborted) return;
        setStatus("open");
        onOpen?.();
        await pumpSSE(
          response,
          (ev) => {
            if (eventFilter && ev.event !== eventFilter) return;
            setEvents((prev) => [...prev, ev]);
            setLastEvent(ev);
            onEvent?.(ev);
          },
          signal,
        );
        if (signal.aborted) return;
        setStatus("closed");
        onDone?.();
      } catch (err) {
        if (signal.aborted) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus("error");
        onError?.(e);
      }
    })();
  };

  onCleanup(disconnect);

  if (autoConnect && typeof window !== "undefined") connect();

  return { status, events, lastEvent, error, connect, disconnect };
}

/* ------------------------------------------------------------------ */
/* createChatModel                                                     */
/* ------------------------------------------------------------------ */

/** A single chat turn. */
export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
}

/** Built-in provider kinds. */
export type ChatProviderKind = "openai" | "anthropic" | "meta";

/**
 * Custom streaming provider. `stream` opens the request and returns
 * the raw Response; `parseDelta` maps each SSE data payload to text
 * (appended to the reply) or a done flag.
 */
export interface CustomChatProvider {
  kind: "custom";
  stream: (
    messages: ChatMessage[],
    context: { signal: AbortSignal; fetchFn: FetchFn },
  ) => Promise<Response>;
  parseDelta: (data: string, event?: string) => { text?: string; done?: boolean };
}

export interface ChatModelOptions {
  /**
   * Provider. Built-in kinds:
   * - `"openai"`: chat completions, `data:` chunks, `[DONE]` terminator.
   * - `"anthropic"`: messages API, `content_block_delta` text deltas.
   *   Note: api.anthropic.com does not send CORS headers for browser
   *   origins, so from a browser you must call it through your own
   *   server route or proxy (set `baseUrl` to that proxy).
   * - `"meta"`: Llama API, OpenAI-compatible via /compat/v1.
   * - custom `{ kind: "custom", stream, parseDelta }`.
   */
  provider: ChatProviderKind | CustomChatProvider;
  /** API key, or a function returning it. Sent as Bearer (openai/meta) or x-api-key (anthropic). */
  apiKey?: string | (() => string | undefined);
  /** Model name, e.g. "gpt-4o-mini", "claude-sonnet-4-20250514". */
  model: string;
  /** Override the API root. Defaults per provider kind. */
  baseUrl?: string;
  /** System prompt, sent as a system message (top-level `system` for anthropic). */
  system?: string;
  /** Sampling temperature, passed through when set. */
  temperature?: number;
  /** Max output tokens. Default 1024. Required by the anthropic API. */
  maxTokens?: number;
  /** Extra headers merged into the request. */
  headers?: Record<string, string>;
  /** Fetch implementation (for tests or custom transports). */
  fetchFn?: FetchFn;
  /** Called with the finished assistant message. */
  onFinish?: (message: ChatMessage) => void;
  /** Called on request or stream errors. */
  onError?: (error: Error) => void;
}

export interface ChatModelControls {
  /** Full conversation, including the in-progress reply. */
  messages: Accessor<ChatMessage[]>;
  /** The reply text streamed so far (empty when idle). */
  streamingText: Accessor<string>;
  /** `idle`, `streaming`, or `error`. */
  status: Accessor<"idle" | "streaming" | "error">;
  /** The last error, if any. */
  error: Accessor<Error | null>;
  /** Send a user message and stream the reply. Ignored while streaming. */
  send: (content: string) => Promise<void>;
  /** Abort the in-flight reply, keeping the partial text. */
  stop: () => void;
  /** Clear the conversation and abort any in-flight reply. */
  reset: () => void;
}

let chatMessageCounter = 0;
const nextMessageId = (): string => `msg_${++chatMessageCounter}_${Date.now()}`;

const defaultBaseUrl = (kind: ChatProviderKind): string => {
  if (kind === "anthropic") return "https://api.anthropic.com";
  if (kind === "meta") return "https://api.llama.com/compat/v1";
  return "https://api.openai.com/v1";
};

interface BuiltinRequest {
  url: string;
  init: RequestInit;
  parseDelta: (data: string, event?: string) => { text?: string; done?: boolean };
}

function buildBuiltinRequest(
  kind: ChatProviderKind,
  options: ChatModelOptions,
  history: ChatMessage[],
  signal: AbortSignal,
  fetchImpl: FetchFn,
): { url: string; init: RequestInit; parseDelta: BuiltinRequest["parseDelta"] } {
  const base = (options.baseUrl ?? defaultBaseUrl(kind)).replace(/\/$/, "");
  const key = typeof options.apiKey === "function" ? options.apiKey() : options.apiKey;
  const extraHeaders = options.headers ?? {};
  const temperature = options.temperature;
  const maxTokens = options.maxTokens ?? 1024;

  if (kind === "anthropic") {
    const systemText =
      options.system ??
      history.find((m) => m.role === "system")?.content;
    const apiMessages = history
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "x-api-key": key } : {}),
        "anthropic-version": "2023-06-01",
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: maxTokens,
        ...(systemText ? { system: systemText } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        messages: apiMessages,
        stream: true,
      }),
      signal,
    };
    return {
      url: `${base}/v1/messages`,
      init,
      parseDelta: (data, event) => {
        if (event === "message_stop") return { done: true };
        if (event === "error") {
          let message = "Anthropic stream error";
          try {
            const parsed = JSON.parse(data) as {
              error?: { message?: string };
            };
            if (parsed.error?.message) message = parsed.error.message;
          } catch {
            if (data.trim()) message = `Anthropic stream error: ${data.slice(0, 200)}`;
          }
          throw new Error(message);
        }
        if (event !== "content_block_delta") return {};
        try {
          const parsed = JSON.parse(data) as {
            delta?: { type?: string; text?: string };
          };
          if (parsed.delta?.type === "text_delta" && parsed.delta.text) {
            return { text: parsed.delta.text };
          }
        } catch {
          // Ignore malformed delta payloads.
        }
        return {};
      },
    };
  }

  // openai + meta: OpenAI-compatible chat completions.
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        ...(options.system
          ? [{ role: "system", content: options.system }]
          : history
              .filter((m) => m.role === "system")
              .map((m) => ({ role: m.role, content: m.content }))),
        ...history
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
      ],
      ...(temperature !== undefined ? { temperature } : {}),
      stream: true,
    }),
    signal,
  };
  return {
    url: `${base}/chat/completions`,
    init,
    parseDelta: (data) => {
      if (data.trim() === "[DONE]") return { done: true };
      let parsed: {
        choices?: Array<{ delta?: { content?: string } }>;
        error?: { message?: string };
      };
      try {
        parsed = JSON.parse(data);
      } catch {
        return {}; // ignore malformed chunks
      }
      if (parsed.error?.message) throw new Error(parsed.error.message);
      const text = parsed.choices?.[0]?.delta?.content;
      return text ? { text } : {};
    },
  };
}

/**
 * Streaming chat over OpenAI, Anthropic, Meta (Llama API), or a
 * custom provider.
 *
 * `send()` appends the user message, opens the provider stream, and
 * appends text deltas to a live assistant message as they arrive, so
 * UI bound to `messages()` renders the reply token by token. Pairs
 * well with `createTyping` for a typewriter reveal.
 *
 * Keys stay in your hands: pass `apiKey` directly, or a function
 * reading it from your own store. For production, prefer calling
 * through your own server route and pointing `baseUrl` at it so
 * keys never ship to the browser.
 *
 * SSR-safe: nothing connects until `send()` is called.
 *
 * ```ts
 * const chat = createChatModel({
 *   provider: "openai",
 *   apiKey: () => localStorage.getItem("openai_key") ?? "",
 *   model: "gpt-4o-mini",
 *   system: "You are a concise assistant.",
 *   onFinish: (msg) => console.log("done:", msg.content.length),
 * });
 * await chat.send("What is a signal?");
 * ```
 */
export function createChatModel(options: ChatModelOptions): ChatModelControls {
  const [messages, setMessages] = createSignal<ChatMessage[]>(
    options.system
      ? [{ id: nextMessageId(), role: "system", content: options.system }]
      : [],
  );
  const [streamingText, setStreamingText] = createSignal("");
  const [status, setStatus] = createSignal<"idle" | "streaming" | "error">("idle");
  const [error, setError] = createSignal<Error | null>(null);

  let controller: AbortController | null = null;

  const stop = (): void => {
    controller?.abort();
    controller = null;
    if (status() === "streaming") setStatus("idle");
  };

  const reset = (): void => {
    stop();
    setError(null);
    setStreamingText("");
    setMessages(
      options.system
        ? [{ id: nextMessageId(), role: "system", content: options.system }]
        : [],
    );
  };

  const send = async (content: string): Promise<void> => {
    if (status() === "streaming") return;
    const fetchImpl: FetchFn =
      options.fetchFn ??
      (typeof fetch !== "undefined" ? fetch : (null as never));
    if (!fetchImpl) {
      const err = new Error("createChatModel: no fetch implementation available");
      setError(err);
      setStatus("error");
      options.onError?.(err);
      return;
    }
    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: "user",
      content,
    };
    const assistantMessage: ChatMessage = {
      id: nextMessageId(),
      role: "assistant",
      content: "",
    };
    const history = [...messages(), userMessage];
    setMessages([...history, assistantMessage]);
    setStreamingText("");
    setError(null);
    setStatus("streaming");

    controller = new AbortController();
    const signal = controller.signal;
    const assistantId = assistantMessage.id;

    const appendText = (text: string): void => {
      setStreamingText((prev) => prev + text);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + text } : m,
        ),
      );
    };

    try {
      let response: Response;
      let parseDelta: (data: string, event?: string) => {
        text?: string;
        done?: boolean;
      };
      const provider = options.provider;
      if (typeof provider === "object" && provider.kind === "custom") {
        response = await provider.stream(history, { signal, fetchFn: fetchImpl });
        parseDelta = provider.parseDelta;
      } else {
        const kind = provider as ChatProviderKind;
        const built = buildBuiltinRequest(kind, options, history, signal, fetchImpl);
        parseDelta = built.parseDelta;
        response = await fetchImpl(built.url, built.init);
      }
      if (signal.aborted) return;
      let finished = false;
      await pumpSSE(
        response,
        (ev) => {
          if (finished) return;
          let parsed: { text?: string; done?: boolean };
          try {
            parsed = parseDelta(ev.data, ev.event);
          } catch (e) {
            throw e instanceof Error ? e : new Error(String(e));
          }
          if (parsed.text) appendText(parsed.text);
          if (parsed.done) finished = true;
        },
        signal,
      );
      if (signal.aborted) return;
      setStatus("idle");
      const final = messages().find((m) => m.id === assistantId);
      if (final) options.onFinish?.(final);
    } catch (err) {
      if (signal.aborted) {
        setStatus("idle");
        return;
      }
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setStatus("error");
      options.onError?.(e);
    } finally {
      controller = null;
    }
  };

  onCleanup(stop);

  return { messages, streamingText, status, error, send, stop, reset };
}
