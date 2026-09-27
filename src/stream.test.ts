import { describe, expect, it, vi, afterEach } from "vitest";
import { createRoot } from "solid-js";
import {
  createSSE,
  createSSEParser,
  createChatModel,
  type ChatMessage,
  type SSEEvent,
} from "./stream.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const flush = async (): Promise<void> => {
  await sleep(0);
  await sleep(0);
};

const streamResponse = (chunks: string[], status = 200): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    }),
    {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: { "Content-Type": "text/event-stream" },
    },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Build a fetch mock with plain (url, init) params, typed to satisfy fetch. */
const mockFetch = (
  impl: (url: string, init: RequestInit) => Promise<Response>,
) =>
  vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      impl(String(input), init ?? {}),
  );

describe("createSSEParser", () => {
  it("parses named events, data lines, ids, and skips comments", () => {
    const seen: SSEEvent[] = [];
    const feed = createSSEParser((ev) => seen.push(ev));
    feed(": keep-alive comment\n");
    feed('event: update\ndata: {"n": 1}\n\n');
    feed("data: line one\ndata: line two\n\n");
    feed("id: 42\ndata: hello\n\n");
    expect(seen).toHaveLength(3);
    expect(seen[0]).toMatchObject({ event: "update", data: '{"n": 1}' });
    expect(seen[1]).toMatchObject({ event: "message", data: "line one\nline two" });
    expect(seen[2]).toMatchObject({ event: "message", data: "hello", id: "42" });
  });

  it("handles events split across chunk boundaries", () => {
    const seen: SSEEvent[] = [];
    const feed = createSSEParser((ev) => seen.push(ev));
    feed('event: up\ndata: {"pa');
    feed('rtial": true}\n\ndata: whole\n\n');
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ event: "up", data: '{"partial": true}' });
    expect(seen[1]).toMatchObject({ event: "message", data: "whole" });
  });

  it("strips one leading space after the colon and trailing CR", () => {
    const seen: SSEEvent[] = [];
    const feed = createSSEParser((ev) => seen.push(ev));
    feed("data:  spaced\r\n\r\n");
    expect(seen[0].data).toBe(" spaced");
  });
});

describe("createSSE", () => {
  it("does not connect on the server (no window)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    createRoot((dispose) => {
      const sse = createSSE("https://example.com/events", { fetchFn: fetchMock });
      expect(sse.status()).toBe("idle");
      expect(fetchMock).not.toHaveBeenCalled();
      dispose();
    });
  });

  it("connects manually and parses events", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(['event: price\ndata: {"v": 10}\n\n', "data: tick\n\n"]),
    );
    let controls!: ReturnType<typeof createSSE>;
    const dispose = createRoot((d) => {
      controls = createSSE("https://example.com/events", {
        autoConnect: false,
        fetchFn: fetchMock,
      });
      return d;
    });
    controls.connect();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(controls.status()).toBe("closed");
    expect(controls.events()).toHaveLength(2);
    expect(controls.events()[0]).toMatchObject({ event: "price", data: '{"v": 10}' });
    expect(controls.lastEvent()).toMatchObject({ event: "message", data: "tick" });
    dispose();
  });

  it("filters by event name when the event option is set", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(["event: a\ndata: 1\n\n", "event: b\ndata: 2\n\n"]),
    );
    let controls!: ReturnType<typeof createSSE>;
    const dispose = createRoot((d) => {
      controls = createSSE("https://example.com/e", {
        autoConnect: false,
        event: "b",
        fetchFn: fetchMock,
      });
      return d;
    });
    controls.connect();
    await flush();
    expect(controls.events()).toHaveLength(1);
    expect(controls.events()[0]).toMatchObject({ event: "b", data: "2" });
    dispose();
  });

  it("reports HTTP errors through status, error, and onError", async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 401));
    const onError = vi.fn();
    let controls!: ReturnType<typeof createSSE>;
    const dispose = createRoot((d) => {
      controls = createSSE("https://example.com/e", {
        autoConnect: false,
        fetchFn: fetchMock,
        onError,
      });
      return d;
    });
    controls.connect();
    await flush();
    expect(controls.status()).toBe("error");
    expect(controls.error()?.message).toContain("401");
    expect(onError).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("sends method, headers, and a JSON body", async () => {
    let seenInit: RequestInit | undefined;
    const fetchMock = mockFetch(async (_url: string, init: RequestInit) => {
      seenInit = init;
      return streamResponse(["data: ok\n\n"]);
    });
    let controls!: ReturnType<typeof createSSE>;
    const dispose = createRoot((d) => {
      controls = createSSE("https://example.com/e", {
        autoConnect: false,
        method: "POST",
        headers: () => ({ Authorization: "Bearer k" }),
        body: { since: 7 },
        fetchFn: fetchMock,
      });
      return d;
    });
    controls.connect();
    await flush();
    expect(seenInit?.method).toBe("POST");
    expect((seenInit?.headers as Record<string, string>)["Authorization"]).toBe("Bearer k");
    expect(seenInit?.body).toBe(JSON.stringify({ since: 7 }));
    expect(controls.status()).toBe("closed");
    dispose();
  });

  it("disconnect aborts the in-flight request", async () => {
    const seen: { signal: AbortSignal | null } = { signal: null };
    const fetchMock = mockFetch(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          seen.signal = init.signal as AbortSignal;
          seen.signal.addEventListener("abort", () =>
            resolve(streamResponse(["data: late\n\n"])),
          );
        }),
    );
    let controls!: ReturnType<typeof createSSE>;
    const dispose = createRoot((d) => {
      controls = createSSE("https://example.com/e", {
        autoConnect: false,
        fetchFn: fetchMock,
      });
      return d;
    });
    controls.connect();
    await sleep(0);
    expect(controls.status()).toBe("connecting"); // fetch still pending
    controls.disconnect();
    expect(seen.signal?.aborted).toBe(true);
    expect(controls.status()).toBe("closed");
    await flush(); // the late abort must not flip status back
    expect(controls.status()).toBe("closed");
    dispose();
  });
});

describe("createChatModel", () => {
  it("streams OpenAI deltas into the assistant message and finishes on [DONE]", async () => {
    let seenUrl = "";
    let seenBody: Record<string, unknown> = {};
    let seenHeaders: Record<string, string> = {};
    const fetchMock = mockFetch(async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenHeaders = init.headers as Record<string, string>;
      seenBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return streamResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    });
    const onFinish = vi.fn();
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: "openai",
        apiKey: "sk-test",
        model: "gpt-4o-mini",
        fetchFn: fetchMock,
        onFinish,
      });
      return d;
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await chat.send("Hi");
    expect(seenUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect(seenHeaders["Authorization"]).toBe("Bearer sk-test");
    expect(seenBody["model"]).toBe("gpt-4o-mini");
    expect(seenBody["stream"]).toBe(true);
    expect(chat.status()).toBe("idle");
    const msgs = chat.messages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ role: "user", content: "Hi" });
    expect(msgs[1]).toMatchObject({ role: "assistant", content: "Hello" });
    expect(chat.streamingText()).toBe("Hello");
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect((onFinish.mock.calls[0][0] as ChatMessage).content).toBe("Hello");
    dispose();
  });

  it("maps anthropic requests: headers, top-level system, text deltas, message_stop", async () => {
    let seenUrl = "";
    let seenBody: Record<string, unknown> = {};
    let seenHeaders: Record<string, string> = {};
    const fetchMock = mockFetch(async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenHeaders = init.headers as Record<string, string>;
      seenBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return streamResponse([
        'event: message_start\ndata: {"type":"message_start"}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hey"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]);
    });
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: "anthropic",
        apiKey: () => "anth-key",
        model: "claude-sonnet-4-20250514",
        system: "Be brief.",
        fetchFn: fetchMock,
      });
      return d;
    });
    await chat.send("Hello");
    expect(seenUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(seenHeaders["x-api-key"]).toBe("anth-key");
    expect(seenHeaders["anthropic-version"]).toBe("2023-06-01");
    expect(seenBody["system"]).toBe("Be brief.");
    expect(seenBody["max_tokens"]).toBe(1024);
    const apiMessages = seenBody["messages"] as Array<{ role: string }>;
    expect(apiMessages.every((m) => m.role !== "system")).toBe(true);
    expect(apiMessages[apiMessages.length - 1]).toMatchObject({ role: "user", content: "Hello" });
    const assistant = chat.messages().filter((m) => m.role === "assistant");
    expect(assistant).toHaveLength(1);
    expect(assistant[0].content).toBe("Hey there");
    expect(chat.status()).toBe("idle");
    dispose();
  });

  it("posts meta requests to the Llama API compat endpoint", async () => {
    let seenUrl = "";
    const fetchMock = mockFetch(async (url: string) => {
      seenUrl = url;
      return streamResponse(["data: [DONE]\n\n"]);
    });
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: "meta",
        apiKey: "llama-key",
        model: "Llama-3.3-8B-Instruct",
        fetchFn: fetchMock,
      });
      return d;
    });
    await chat.send("Hi");
    expect(seenUrl).toBe("https://api.llama.com/compat/v1/chat/completions");
    expect(chat.status()).toBe("idle");
    dispose();
  });

  it("supports a custom provider", async () => {
    const fetchMock = mockFetch(async () =>
      streamResponse(["data: chunk1\n\n", "data: chunk2\n\n", "data: END\n\n"]),
    );
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: {
          kind: "custom",
          stream: async (_messages, { signal }) =>
            fetchMock("https://custom.example/stream", { signal }),
          parseDelta: (data) =>
            data === "END" ? { done: true } : { text: `[${data}]` },
        },
        model: "custom-model",
      });
      return d;
    });
    await chat.send("ping");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const assistant = chat.messages().filter((m) => m.role === "assistant");
    expect(assistant[0].content).toBe("[chunk1][chunk2]");
    expect(chat.status()).toBe("idle");
    dispose();
  });

  it("surfaces HTTP errors and keeps the partial conversation", async () => {
    const fetchMock = vi.fn(async () => streamResponse([], 429));
    const onError = vi.fn();
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: "openai",
        apiKey: "sk-test",
        model: "gpt-4o-mini",
        fetchFn: fetchMock,
        onError,
      });
      return d;
    });
    await chat.send("Hi");
    expect(chat.status()).toBe("error");
    expect(chat.error()?.message).toContain("429");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(chat.messages().map((m) => m.role)).toEqual(["user", "assistant"]);
    dispose();
  });

  it("stop() aborts the stream and keeps the partial reply", async () => {
    const seen: { signal: AbortSignal | null } = { signal: null };
    const fetchMock = mockFetch(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          seen.signal = init.signal as AbortSignal;
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"part"}}]}\n\n'),
              );
              seen.signal?.addEventListener("abort", () => controller.close());
            },
          });
          // Resolve on next tick so the first chunk is readable.
          setTimeout(
            () => resolve(new Response(stream, { status: 200 })),
            0,
          );
        }),
    );
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: "openai",
        apiKey: "sk",
        model: "m",
        fetchFn: fetchMock,
      });
      return d;
    });
    const sending = chat.send("Hi");
    await flush();
    expect(chat.streamingText()).toBe("part");
    chat.stop();
    await sending;
    expect(seen.signal?.aborted).toBe(true);
    expect(chat.status()).toBe("idle");
    const assistant = chat.messages().filter((m) => m.role === "assistant");
    expect(assistant[0].content).toBe("part");
    dispose();
  });

  it("ignores send() while already streaming", async () => {
    const fetchMock = vi.fn(async () => streamResponse(["data: [DONE]\n\n"]));
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: "openai",
        apiKey: "sk",
        model: "m",
        fetchFn: fetchMock,
      });
      return d;
    });
    const first = chat.send("one");
    const second = chat.send("two"); // ignored
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chat.messages().filter((m) => m.role === "user")).toHaveLength(1);
    dispose();
  });

  it("reset() clears the conversation", async () => {
    const fetchMock = vi.fn(async () => streamResponse(["data: [DONE]\n\n"]));
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: "openai",
        apiKey: "sk",
        model: "m",
        system: "sys",
        fetchFn: fetchMock,
      });
      return d;
    });
    await chat.send("Hi");
    expect(chat.messages().length).toBeGreaterThan(1);
    chat.reset();
    expect(chat.messages()).toHaveLength(1);
    expect(chat.messages()[0]).toMatchObject({ role: "system", content: "sys" });
    expect(chat.status()).toBe("idle");
    expect(chat.error()).toBeNull();
    dispose();
  });

  it("propagates anthropic stream error events", async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse([
        'event: error\ndata: {"type":"error","error":{"type":"invalid_request_error","message":"bad key"}}\n\n',
      ]),
    );
    let chat!: ReturnType<typeof createChatModel>;
    const dispose = createRoot((d) => {
      chat = createChatModel({
        provider: "anthropic",
        apiKey: "bad",
        model: "m",
        fetchFn: fetchMock,
      });
      return d;
    });
    await chat.send("Hi");
    expect(chat.status()).toBe("error");
    expect(chat.error()?.message).toBe("bad key");
    dispose();
  });
});
