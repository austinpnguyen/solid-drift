import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "solid-js";
import {
  createApi,
  createWebSocket,
  createSearch,
  createUpload,
  createPagination,
  verifyWebhookSignature,
  type PageResult,
  type WebSocketLike,
} from "./network.js";

function setup<T>(fn: () => T): { result: T; dispose: () => void } {
  let result!: T;
  let dispose!: () => void;
  createRoot((d) => {
    result = fn();
    dispose = d;
  });
  return { result, dispose };
}

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  FakeSocket.instances = [];
  FakeXHR.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------ fakes ------------------------------ */

class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((l) => l !== listener),
    );
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit("close", {});
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  serverOpen(): void {
    this.emit("open", {});
  }

  serverMessage(data: string): void {
    this.emit("message", { data });
  }

  serverClose(): void {
    this.emit("close", {});
  }
}

class FakeXHR {
  static instances: FakeXHR[] = [];
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  onload: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onabort: ((e: unknown) => void) | null = null;
  status = 200;
  responseText = "";
  withCredentials = false;
  headers: Record<string, string> = {};
  sentBody: unknown = null;
  aborted = false;

  constructor() {
    FakeXHR.instances.push(this);
  }

  open(_method: string, _url: string): void {}

  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  send(body: unknown): void {
    this.sentBody = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.({});
  }

  succeed(status = 200, responseText = ""): void {
    this.status = status;
    this.responseText = responseText;
    this.onload?.({});
  }

  fail(): void {
    this.onerror?.({});
  }

  progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
}

/* ---------------------------- createApi ---------------------------- */

describe("createApi", () => {
  it("loads data on execute", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ hello: "world" }));
    const { result: api, dispose } = setup(() =>
      createApi<{ hello: string }>({ url: "https://x.test/a", fetchFn }),
    );
    expect(api.status()).toBe("idle");
    api.execute();
    expect(api.status()).toBe("loading");
    await flush();
    expect(api.status()).toBe("success");
    expect(api.data()).toEqual({ hello: "world" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("surfaces non-2xx responses as errors", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 500));
    const { result: api, dispose } = setup(() =>
      createApi({ url: "https://x.test/a", fetchFn }),
    );
    api.execute();
    await flush();
    expect(api.status()).toBe("error");
    expect(api.error()).toBeInstanceOf(Error);
    dispose();
  });

  it("serializes object bodies as JSON", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}));
    const { result: api, dispose } = setup(() =>
      createApi({
        url: "https://x.test/a",
        method: "POST",
        body: { name: "austin" },
        fetchFn,
      }),
    );
    api.execute();
    await flush();
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe('{"name":"austin"}');
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toContain("application/json");
    dispose();
  });

  it("aborts an in-flight request", async () => {
    let resolveFetch!: (res: Response) => void;
    const fetchFn = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          resolveFetch = resolve;
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const { result: api, dispose } = setup(() =>
      createApi({ url: "https://x.test/a", fetchFn }),
    );
    api.execute();
    expect(api.status()).toBe("loading");
    api.abort();
    expect(api.status()).toBe("idle");
    resolveFetch(jsonResponse({ late: true }));
    await flush();
    expect(api.data()).toBeUndefined();
    dispose();
  });

  it("retry re-runs the request", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}));
    const { result: api, dispose } = setup(() =>
      createApi({ url: "https://x.test/a", fetchFn }),
    );
    api.execute();
    await flush();
    api.retry();
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    dispose();
  });
});

/* -------------------------- createWebSocket -------------------------- */

describe("createWebSocket", () => {
  const connect = () =>
    setup(() =>
      createWebSocket<{ type: string }>("wss://x.test/socket", {
        WebSocketImpl: FakeSocket as unknown as new (
          url: string,
          protocols?: string | string[],
        ) => WebSocketLike,
      }),
    );

  it("connects and reports open", () => {
    const { result: ws, dispose } = connect();
    expect(ws.status()).toBe("connecting");
    FakeSocket.instances[0].serverOpen();
    expect(ws.status()).toBe("open");
    dispose();
  });

  it("parses JSON messages into data", () => {
    const { result: ws, dispose } = connect();
    FakeSocket.instances[0].serverOpen();
    FakeSocket.instances[0].serverMessage('{"type":"ping"}');
    expect(ws.data()).toEqual({ type: "ping" });
    dispose();
  });

  it("keeps non-JSON messages as raw strings", () => {
    const { result: ws, dispose } = setup(() =>
      createWebSocket<string>("wss://x.test/socket", {
        WebSocketImpl: FakeSocket as unknown as new (
          url: string,
          protocols?: string | string[],
        ) => WebSocketLike,
      }),
    );
    FakeSocket.instances[0].serverOpen();
    FakeSocket.instances[0].serverMessage("plain");
    expect(ws.data()).toBe("plain");
    dispose();
  });

  it("stringifies object payloads on send", () => {
    const { result: ws, dispose } = connect();
    FakeSocket.instances[0].serverOpen();
    ws.send({ type: "ping" });
    expect(FakeSocket.instances[0].sent).toEqual(['{"type":"ping"}']);
    dispose();
  });

  it("close shuts down without reconnecting", () => {
    const { result: ws, dispose } = connect();
    FakeSocket.instances[0].serverOpen();
    ws.close();
    expect(ws.status()).toBe("closed");
    expect(FakeSocket.instances).toHaveLength(1);
    dispose();
  });

  it("reconnects with backoff after an unexpected close", async () => {
    vi.useFakeTimers();
    const { result: ws, dispose } = setup(() =>
      createWebSocket("wss://x.test/socket", {
        WebSocketImpl: FakeSocket as unknown as new (
          url: string,
          protocols?: string | string[],
        ) => WebSocketLike,
        reconnectDelayMs: 1000,
      }),
    );
    FakeSocket.instances[0].serverOpen();
    FakeSocket.instances[0].serverClose();
    expect(ws.status()).toBe("connecting");
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    dispose();
  });

  it("retry reconnects immediately", () => {
    const { result: ws, dispose } = connect();
    FakeSocket.instances[0].serverOpen();
    ws.retry();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(ws.status()).toBe("connecting");
    dispose();
  });
});

/* ---------------------------- createSearch ---------------------------- */

describe("createSearch", () => {
  it("debounces the query then fetches results", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (q: string) => [`${q}-1`, `${q}-2`]);
    const { result: search, dispose } = setup(() =>
      createSearch<string>({ fetcher, debounceMs: 300 }),
    );
    search.setQuery("a");
    search.setQuery("ab");
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("ab");
    await vi.advanceTimersByTimeAsync(0);
    expect(search.data()).toEqual(["ab-1", "ab-2"]);
    expect(search.status()).toBe("success");
    dispose();
  });

  it("clears results for queries below minLength", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (q: string) => [q]);
    const { result: search, dispose } = setup(() =>
      createSearch<string>({ fetcher, debounceMs: 50, minLength: 2 }),
    );
    search.setQuery("a");
    await vi.advanceTimersByTimeAsync(100);
    expect(fetcher).not.toHaveBeenCalled();
    expect(search.data()).toEqual([]);
    expect(search.status()).toBe("idle");
    dispose();
  });

  it("abort cancels a pending debounced search", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (q: string) => [q]);
    const { result: search, dispose } = setup(() =>
      createSearch<string>({ fetcher, debounceMs: 300 }),
    );
    search.setQuery("abc");
    search.abort();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).not.toHaveBeenCalled();
    dispose();
  });

  it("surfaces fetcher errors", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_q: string): Promise<string[]> => {
      throw new Error("nope");
    });
    const { result: search, dispose } = setup(() =>
      createSearch<string>({ fetcher, debounceMs: 50 }),
    );
    search.setQuery("abc");
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(search.status()).toBe("error");
    expect(search.error()).toBeInstanceOf(Error);
    dispose();
  });

  it("clear resets everything", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (q: string) => [q]);
    const { result: search, dispose } = setup(() =>
      createSearch<string>({ fetcher, debounceMs: 50 }),
    );
    search.setQuery("abc");
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(0);
    search.clear();
    expect(search.query()).toBe("");
    expect(search.data()).toEqual([]);
    expect(search.status()).toBe("idle");
    dispose();
  });
});

/* ---------------------------- createUpload ---------------------------- */

describe("createUpload", () => {
  const XHRImpl = FakeXHR as unknown as typeof XMLHttpRequest;

  it("uploads with progress and parses the JSON response", () => {
    const { result: up, dispose } = setup(() =>
      createUpload<{ ok: boolean }>({ url: "https://x.test/upload", XHRImpl }),
    );
    const file = new Blob(["hello"], { type: "text/plain" });
    up.upload(file);
    const xhr = FakeXHR.instances[0];
    expect(up.status()).toBe("loading");
    expect(xhr.sentBody).toBeInstanceOf(FormData);
    xhr.progress(50, 100);
    expect(up.progress()).toBe(0.5);
    xhr.succeed(200, '{"ok":true}');
    expect(up.status()).toBe("success");
    expect(up.progress()).toBe(1);
    expect(up.data()).toEqual({ ok: true });
    dispose();
  });

  it("surfaces HTTP errors", () => {
    const { result: up, dispose } = setup(() =>
      createUpload({ url: "https://x.test/upload", XHRImpl }),
    );
    up.upload(new Blob(["x"]));
    FakeXHR.instances[0].succeed(500, "boom");
    expect(up.status()).toBe("error");
    expect(up.error()).toBeInstanceOf(Error);
    dispose();
  });

  it("abort cancels the upload", () => {
    const { result: up, dispose } = setup(() =>
      createUpload({ url: "https://x.test/upload", XHRImpl }),
    );
    up.upload(new Blob(["x"]));
    up.abort();
    expect(FakeXHR.instances[0].aborted).toBe(true);
    expect(up.status()).toBe("idle");
    dispose();
  });

  it("retry re-uploads the last file", () => {
    const { result: up, dispose } = setup(() =>
      createUpload({ url: "https://x.test/upload", XHRImpl }),
    );
    const file = new Blob(["x"]);
    up.upload(file);
    FakeXHR.instances[0].succeed(200, "{}");
    up.retry();
    expect(FakeXHR.instances).toHaveLength(2);
    dispose();
  });
});

/* -------------------------- createPagination -------------------------- */

describe("createPagination", () => {
  const fetcher = async (page: number): Promise<PageResult<number>> => ({
    items: [page * 10 + 1, page * 10 + 2],
    hasMore: page < 3,
  });

  it("loads the first page on retry", async () => {
    const { result: pg, dispose } = setup(() => createPagination({ fetcher }));
    pg.retry();
    await flush();
    expect(pg.status()).toBe("success");
    expect(pg.page()).toBe(1);
    expect(pg.data()).toEqual([11, 12]);
    expect(pg.hasMore()).toBe(true);
    dispose();
  });

  it("next appends the following page", async () => {
    const { result: pg, dispose } = setup(() => createPagination({ fetcher }));
    pg.retry();
    await flush();
    pg.next();
    await flush();
    expect(pg.page()).toBe(2);
    expect(pg.data()).toEqual([11, 12, 21, 22]);
    dispose();
  });

  it("stops at the last page", async () => {
    const { result: pg, dispose } = setup(() => createPagination({ fetcher }));
    pg.retry();
    await flush();
    pg.next();
    await flush();
    pg.next();
    await flush();
    expect(pg.page()).toBe(3);
    expect(pg.hasMore()).toBe(false);
    pg.next();
    await flush();
    expect(pg.page()).toBe(3);
    dispose();
  });

  it("derives hasMore from total when the fetcher omits it", async () => {
    const totalFetcher = async (page: number): Promise<PageResult<number>> => ({
      items: [page],
      total: 2,
    });
    const { result: pg, dispose } = setup(() =>
      createPagination({ fetcher: totalFetcher }),
    );
    pg.retry();
    await flush();
    expect(pg.total()).toBe(2);
    expect(pg.hasMore()).toBe(true);
    pg.next();
    await flush();
    expect(pg.hasMore()).toBe(false);
    dispose();
  });

  it("reset reloads the first page", async () => {
    const { result: pg, dispose } = setup(() => createPagination({ fetcher }));
    pg.retry();
    await flush();
    pg.next();
    await flush();
    pg.reset();
    await flush();
    expect(pg.page()).toBe(1);
    expect(pg.data()).toEqual([11, 12]);
    dispose();
  });

  it("surfaces fetcher errors", async () => {
    const failing = async (_page: number): Promise<PageResult<number>> => {
      throw new Error("down");
    };
    const { result: pg, dispose } = setup(() =>
      createPagination({ fetcher: failing }),
    );
    pg.retry();
    await flush();
    expect(pg.status()).toBe("error");
    expect(pg.error()).toBeInstanceOf(Error);
    dispose();
  });
});

/* ----------------------- verifyWebhookSignature ----------------------- */

describe("verifyWebhookSignature", () => {
  const secret = "s3cr3t";
  const payload = '{"id":1}';

  const sign = async (
    p: string,
    s: string,
    algorithm: "SHA-256" | "SHA-1",
  ): Promise<Uint8Array> => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(s),
      { name: "HMAC", hash: algorithm },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(p),
    );
    return new Uint8Array(mac);
  };

  const hex = async (
    p: string,
    s: string,
    algorithm: "SHA-256" | "SHA-1" = "SHA-256",
  ): Promise<string> =>
    Array.from(await sign(p, s, algorithm))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const base64 = async (p: string, s: string): Promise<string> => {
    const bytes = await sign(p, s, "SHA-1");
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  };

  it("accepts a valid SHA-256 hex signature", async () => {
    await expect(
      verifyWebhookSignature({
        payload,
        secret,
        signature: await hex(payload, secret),
      }),
    ).resolves.toBe(true);
  });

  it("rejects a wrong signature", async () => {
    await expect(
      verifyWebhookSignature({ payload, secret, signature: "0".repeat(64) }),
    ).resolves.toBe(false);
  });

  it("rejects a tampered payload", async () => {
    await expect(
      verifyWebhookSignature({
        payload: '{"id":2}',
        secret,
        signature: await hex(payload, secret),
      }),
    ).resolves.toBe(false);
  });

  it("strips a prefix before comparing", async () => {
    await expect(
      verifyWebhookSignature({
        payload,
        secret,
        signature: `sha256=${await hex(payload, secret)}`,
        prefix: "sha256=",
      }),
    ).resolves.toBe(true);
  });

  it("supports base64 encoding and SHA-1", async () => {
    await expect(
      verifyWebhookSignature({
        payload,
        secret,
        signature: await base64(payload, secret),
        algorithm: "SHA-1",
        encoding: "base64",
      }),
    ).resolves.toBe(true);
  });
});
