/**
 * Network primitives.
 *
 * Reactive wrappers around fetch, WebSocket, search-as-you-type, file
 * upload, and pagination. Every reactive primitive exposes the same core
 * shape: `{ data, error, status, retry, abort }`, plus controls specific
 * to the task. `verifyWebhookSignature` is a pure async helper for
 * validating inbound webhooks. All primitives are SSR-safe: nothing
 * fires on the server until you call it.
 */

import {
  createSignal,
  createEffect,
  onCleanup,
  type Accessor,
} from "solid-js";

export type RequestStatus = "idle" | "loading" | "success" | "error";

/* ------------------------------------------------------------------ */
/* createApi                                                             */
/* ------------------------------------------------------------------ */

export interface ApiOptions<T> {
  url: string | (() => string);
  method?: string;
  headers?: HeadersInit | (() => HeadersInit);
  /** Plain objects are serialized as JSON. */
  body?: unknown | (() => unknown);
  fetchFn?: typeof fetch;
  /** Fetch immediately on the client. Default true. */
  immediate?: boolean;
  parse?: (res: Response) => Promise<T>;
}

export interface ApiControls<T> {
  data: Accessor<T | undefined>;
  error: Accessor<unknown>;
  status: Accessor<RequestStatus>;
  retry: () => void;
  abort: () => void;
  /** Run the request manually. Used when `immediate` is false. */
  execute: () => void;
}

/**
 * Reactive fetch wrapper. Pass a URL accessor to refetch when it changes.
 * Non-2xx responses surface as errors. Aborts the in-flight request on
 * retry, abort, or cleanup.
 */
export function createApi<T = unknown>(options: ApiOptions<T>): ApiControls<T> {
  const { method = "GET", immediate = true, parse } = options;
  const fetchFn =
    options.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined);

  const [data, setData] = createSignal<T | undefined>(undefined);
  const [error, setError] = createSignal<unknown>(undefined);
  const [status, setStatus] = createSignal<RequestStatus>("idle");
  let controller: AbortController | undefined;

  const resolveUrl = (): string =>
    typeof options.url === "function"
      ? (options.url as () => string)()
      : (options.url as string);

  const defaultParse = async (res: Response): Promise<T> => {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  };

  const execute = (): void => {
    if (!fetchFn) {
      setError(new Error("fetch is not available in this environment."));
      setStatus("error");
      return;
    }
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    setStatus("loading");
    setError(undefined);

    const url = resolveUrl();
    const rawHeaders =
      typeof options.headers === "function"
        ? (options.headers as () => HeadersInit)()
        : options.headers;
    const finalHeaders = new Headers(rawHeaders);
    const rawBody =
      typeof options.body === "function"
        ? (options.body as () => unknown)()
        : options.body;
    let body: BodyInit | undefined;
    if (rawBody !== undefined) {
      if (typeof rawBody === "string" || rawBody instanceof FormData) {
        body = rawBody;
      } else {
        body = JSON.stringify(rawBody);
        if (!finalHeaders.has("content-type")) {
          finalHeaders.set("content-type", "application/json");
        }
      }
    }

    void fetchFn(url, { method, headers: finalHeaders, body, signal }).then(
      async (res) => {
        if (signal.aborted) return;
        try {
          if (!res.ok) {
            throw new Error(`Request failed with status ${res.status}.`);
          }
          const value = await (parse ?? defaultParse)(res);
          if (signal.aborted) return;
          setData(() => value);
          setStatus("success");
        } catch (err: unknown) {
          if (!signal.aborted) {
            setError(err);
            setStatus("error");
          }
        }
      },
      (err: unknown) => {
        if (!signal.aborted) {
          setError(err);
          setStatus("error");
        }
      },
    );
  };

  const abort = (): void => {
    controller?.abort();
    if (status() === "loading") setStatus("idle");
  };

  const retry = (): void => {
    execute();
  };

  if (typeof window !== "undefined" && immediate) {
    if (typeof options.url === "function") {
      createEffect(() => {
        resolveUrl();
        execute();
      });
    } else {
      execute();
    }
  }
  onCleanup(() => controller?.abort());

  return { data, error, status, retry, abort, execute };
}

/* ------------------------------------------------------------------ */
/* createWebSocket                                                       */
/* ------------------------------------------------------------------ */

export type WebSocketStatus = "connecting" | "open" | "closed" | "error";

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

export interface WebSocketOptions {
  protocols?: string | string[];
  /** Reconnect with backoff after an unexpected close. Default true. */
  reconnect?: boolean;
  /** Base delay in ms, doubled per attempt. Default 1000. */
  reconnectDelayMs?: number;
  /** Max reconnect attempts. Default Infinity. */
  maxReconnectAttempts?: number;
  /** Inject a WebSocket implementation (tests, non-DOM runtimes). */
  WebSocketImpl?: new (
    url: string,
    protocols?: string | string[],
  ) => WebSocketLike;
}

export interface WebSocketControls<T = unknown> {
  /** Last received message, JSON-parsed when possible. */
  data: Accessor<T | undefined>;
  error: Accessor<unknown>;
  status: Accessor<WebSocketStatus>;
  send: (message: string | Record<string, unknown>) => void;
  /** Reconnect now, resetting the backoff. */
  retry: () => void;
  /** Close the connection. */
  abort: () => void;
  close: () => void;
}

/**
 * Reactive WebSocket with reconnect backoff. Incoming messages are
 * JSON-parsed when possible and exposed as `data`. `retry()` reconnects
 * immediately; `abort()`/`close()` shuts down without reconnecting.
 * Does nothing on the server.
 */
export function createWebSocket<T = unknown>(
  url: string,
  options: WebSocketOptions = {},
): WebSocketControls<T> {
  const {
    protocols,
    reconnect = true,
    reconnectDelayMs = 1000,
    maxReconnectAttempts = Infinity,
  } = options;
  const WS =
    options.WebSocketImpl ??
    (typeof WebSocket !== "undefined" ? WebSocket : undefined);

  const [data, setData] = createSignal<T | undefined>(undefined);
  const [error, setError] = createSignal<unknown>(undefined);
  const [status, setStatus] = createSignal<WebSocketStatus>("closed");

  let socket: WebSocketLike | undefined;
  let attempts = 0;
  let closedByUs = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = (): void => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const parseMessage = (raw: unknown): T => {
    if (typeof raw !== "string") return raw as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  };

  const connect = (): void => {
    if (!WS) return;
    clearTimer();
    closedByUs = false;
    setStatus("connecting");
    const ws = new WS(url, protocols);
    socket = ws;

    const onOpen = (): void => {
      attempts = 0;
      setStatus("open");
    };
    const onMessage = (event: unknown): void => {
      const payload = (event as { data?: unknown }).data;
      setData(() => parseMessage(payload));
    };
    const onError = (event: unknown): void => {
      setError(event);
      setStatus("error");
    };
    const onClose = (): void => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
      if (socket === ws) socket = undefined;
      if (closedByUs || !reconnect || attempts >= maxReconnectAttempts) {
        setStatus("closed");
        return;
      }
      attempts += 1;
      setStatus("connecting");
      retryTimer = setTimeout(
        connect,
        reconnectDelayMs * 2 ** (attempts - 1),
      );
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
  };

  const close = (): void => {
    closedByUs = true;
    clearTimer();
    socket?.close();
    socket = undefined;
    setStatus("closed");
  };

  const send = (message: string | Record<string, unknown>): void => {
    if (status() !== "open" || !socket) return;
    socket.send(typeof message === "string" ? message : JSON.stringify(message));
  };

  const retry = (): void => {
    attempts = 0;
    socket?.close();
    connect();
  };

  if (typeof window !== "undefined" || options.WebSocketImpl) {
    connect();
  }
  onCleanup(close);

  return { data, error, status, send, retry, abort: close, close };
}

/* ------------------------------------------------------------------ */
/* createSearch                                                          */
/* ------------------------------------------------------------------ */

export interface SearchOptions<T> {
  fetcher: (query: string, signal: AbortSignal) => Promise<T[]>;
  /** Debounce in ms. Default 300. */
  debounceMs?: number;
  /** Minimum query length before searching. Default 1. */
  minLength?: number;
}

export interface SearchControls<T> {
  query: Accessor<string>;
  /** Set the query; the search runs after the debounce. */
  setQuery: (query: string) => void;
  data: Accessor<T[]>;
  error: Accessor<unknown>;
  status: Accessor<RequestStatus>;
  retry: () => void;
  abort: () => void;
  clear: () => void;
}

/**
 * Debounced async search. Setting the query waits `debounceMs`, then calls
 * `fetcher`; a new keystroke aborts the in-flight request. Queries shorter
 * than `minLength` clear the results instead of searching.
 */
export function createSearch<T>(options: SearchOptions<T>): SearchControls<T> {
  const { fetcher, debounceMs = 300, minLength = 1 } = options;

  const [query, setQuerySignal] = createSignal("");
  const [data, setData] = createSignal<T[]>([]);
  const [error, setError] = createSignal<unknown>(undefined);
  const [status, setStatus] = createSignal<RequestStatus>("idle");

  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = (q: string): void => {
    controller?.abort();
    if (q.length < minLength) {
      setData([]);
      setError(undefined);
      setStatus("idle");
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    setStatus("loading");
    setError(undefined);
    void fetcher(q, signal).then(
      (results) => {
        if (signal.aborted) return;
        setData(results);
        setStatus("success");
      },
      (err: unknown) => {
        if (!signal.aborted) {
          setError(err);
          setStatus("error");
        }
      },
    );
  };

  const setQuery = (q: string): void => {
    setQuerySignal(q);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => run(q), debounceMs);
  };

  const abort = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    controller?.abort();
    if (status() === "loading") setStatus("idle");
  };

  const retry = (): void => {
    run(query());
  };

  const clear = (): void => {
    abort();
    setQuerySignal("");
    setData([]);
    setError(undefined);
    setStatus("idle");
  };

  onCleanup(abort);

  return { query, setQuery, data, error, status, retry, abort, clear };
}

/* ------------------------------------------------------------------ */
/* createUpload                                                          */
/* ------------------------------------------------------------------ */

export interface UploadOptions {
  url?: string | (() => string);
  /** Multipart field name for the file. Default "file". */
  fieldName?: string;
  headers?: Record<string, string> | (() => Record<string, string>);
  withCredentials?: boolean;
  /** Inject an XMLHttpRequest implementation (tests). */
  XHRImpl?: typeof XMLHttpRequest;
  parse?: (xhr: XMLHttpRequest) => unknown;
}

export interface UploadControls<T = unknown> {
  data: Accessor<T | undefined>;
  error: Accessor<unknown>;
  status: Accessor<RequestStatus>;
  /** Upload progress, 0 to 1. */
  progress: Accessor<number>;
  upload: (file: Blob, extraFields?: Record<string, string>) => void;
  /** Re-upload the last file. */
  retry: () => void;
  abort: () => void;
}

/**
 * File upload with progress, built on XMLHttpRequest (fetch cannot report
 * upload progress). Sends multipart form data via POST. `progress()` goes
 * 0 to 1; the response is JSON-parsed when possible.
 */
export function createUpload<T = unknown>(
  options: UploadOptions = {},
): UploadControls<T> {
  const { fieldName = "file", withCredentials = false } = options;
  const XHR =
    options.XHRImpl ??
    (typeof XMLHttpRequest !== "undefined" ? XMLHttpRequest : undefined);

  const [data, setData] = createSignal<T | undefined>(undefined);
  const [error, setError] = createSignal<unknown>(undefined);
  const [status, setStatus] = createSignal<RequestStatus>("idle");
  const [progress, setProgress] = createSignal(0);

  let xhr: XMLHttpRequest | undefined;
  let lastFile: { file: Blob; fields?: Record<string, string> } | undefined;

  const upload = (file: Blob, extraFields?: Record<string, string>): void => {
    if (!XHR) {
      setError(new Error("XMLHttpRequest is not available in this environment."));
      setStatus("error");
      return;
    }
    xhr?.abort();
    lastFile = { file, fields: extraFields };

    const form = new FormData();
    form.append(fieldName, file);
    for (const [key, value] of Object.entries(extraFields ?? {})) {
      form.append(key, value);
    }

    const instance = new XHR();
    xhr = instance;
    setStatus("loading");
    setError(undefined);
    setProgress(0);

    const url =
      typeof options.url === "function"
        ? (options.url as () => string)()
        : options.url;
    if (!url) {
      setError(new Error("createUpload: no url provided."));
      setStatus("error");
      return;
    }
    instance.open("POST", url);
    const headers =
      typeof options.headers === "function"
        ? (options.headers as () => Record<string, string>)()
        : (options.headers as Record<string, string> | undefined);
    for (const [key, value] of Object.entries(headers ?? {})) {
      instance.setRequestHeader(key, value);
    }
    instance.withCredentials = withCredentials;
    instance.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable) setProgress(event.loaded / event.total);
    };
    instance.onload = () => {
      if (instance.status >= 200 && instance.status < 300) {
        setProgress(1);
        const parse =
          options.parse ??
          ((x: XMLHttpRequest): unknown => {
            try {
              return JSON.parse(x.responseText) as unknown;
            } catch {
              return x.responseText;
            }
          });
        setData(() => parse(instance) as T);
        setStatus("success");
      } else {
        setError(new Error(`Upload failed with status ${instance.status}.`));
        setStatus("error");
      }
    };
    instance.onerror = () => {
      setError(new Error("Upload failed."));
      setStatus("error");
    };
    instance.onabort = () => {
      if (status() === "loading") setStatus("idle");
    };
    instance.send(form);
  };

  const abort = (): void => {
    xhr?.abort();
  };

  const retry = (): void => {
    if (lastFile) upload(lastFile.file, lastFile.fields);
  };

  onCleanup(() => xhr?.abort());

  return { data, error, status, progress, upload, retry, abort };
}

/* ------------------------------------------------------------------ */
/* createPagination                                                      */
/* ------------------------------------------------------------------ */

export interface PageResult<T> {
  items: T[];
  hasMore?: boolean;
  total?: number;
}

export interface PaginationOptions<T> {
  fetcher: (page: number, signal: AbortSignal) => Promise<PageResult<T>>;
  initialPage?: number;
  /** Append new pages to `data` instead of replacing. Default true. */
  append?: boolean;
}

export interface PaginationControls<T> {
  /** Loaded items: accumulated when `append` is true. */
  data: Accessor<T[]>;
  page: Accessor<number>;
  hasMore: Accessor<boolean>;
  total: Accessor<number | undefined>;
  error: Accessor<unknown>;
  status: Accessor<RequestStatus>;
  next: () => void;
  prev: () => void;
  goto: (page: number) => void;
  reset: () => void;
  retry: () => void;
  abort: () => void;
}

/**
 * Paginated fetching. `next()` appends the following page when `append`
 * is true; `prev()`/`goto()` replace. `hasMore` comes from the fetcher
 * when provided, otherwise it is derived from `total`.
 */
export function createPagination<T>(
  options: PaginationOptions<T>,
): PaginationControls<T> {
  const { fetcher, initialPage = 1, append = true } = options;

  const [page, setPage] = createSignal(initialPage);
  const [data, setData] = createSignal<T[]>([]);
  const [hasMore, setHasMore] = createSignal(true);
  const [total, setTotal] = createSignal<number | undefined>(undefined);
  const [error, setError] = createSignal<unknown>(undefined);
  const [status, setStatus] = createSignal<RequestStatus>("idle");

  let controller: AbortController | undefined;

  const load = (p: number, mode: "append" | "replace"): void => {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    setStatus("loading");
    setError(undefined);
    void fetcher(p, signal).then(
      (result) => {
        if (signal.aborted) return;
        const items =
          append && mode === "append" ? [...data(), ...result.items] : result.items;
        setData(items);
        setTotal(result.total);
        setHasMore(
          result.hasMore ??
            (result.total !== undefined ? items.length < result.total : true),
        );
        setPage(p);
        setStatus("success");
      },
      (err: unknown) => {
        if (!signal.aborted) {
          setError(err);
          setStatus("error");
        }
      },
    );
  };

  const next = (): void => {
    if (hasMore()) load(page() + 1, "append");
  };
  const prev = (): void => {
    if (page() > initialPage) load(page() - 1, "replace");
  };
  const goto = (p: number): void => {
    load(p, "replace");
  };
  const reset = (): void => {
    setData([]);
    setHasMore(true);
    setTotal(undefined);
    load(initialPage, "replace");
  };
  const retry = (): void => {
    load(page(), "replace");
  };
  const abort = (): void => {
    controller?.abort();
    if (status() === "loading") setStatus("idle");
  };

  if (typeof window !== "undefined") {
    load(initialPage, "replace");
  }
  onCleanup(() => controller?.abort());

  return {
    data,
    page,
    hasMore,
    total,
    error,
    status,
    next,
    prev,
    goto,
    reset,
    retry,
    abort,
  };
}

/* ------------------------------------------------------------------ */
/* verifyWebhookSignature                                                */
/* ------------------------------------------------------------------ */

export interface WebhookSignatureOptions {
  /** Raw request body, exactly as received. */
  payload: string;
  /** Signature value from the request header. */
  signature: string;
  secret: string;
  /** HMAC hash. Default "SHA-256". */
  algorithm?: "SHA-256" | "SHA-1";
  /** Digest encoding. Default "hex". */
  encoding?: "hex" | "base64";
  /** Prefix stripped from the signature before comparing, e.g. "sha256=". */
  prefix?: string;
}

/**
 * Verify an HMAC webhook signature with a timing-safe comparison.
 * Returns false when verification is unavailable or fails; never throws.
 * Uses WebCrypto, available in browsers and modern server runtimes.
 */
export async function verifyWebhookSignature(
  options: WebhookSignatureOptions,
): Promise<boolean> {
  const {
    payload,
    signature,
    secret,
    algorithm = "SHA-256",
    encoding = "hex",
    prefix = "",
  } = options;
  try {
    const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
    if (!subtle) return false;

    let provided = signature;
    if (prefix && provided.startsWith(prefix)) {
      provided = provided.slice(prefix.length);
    }

    const key = await subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: algorithm },
      false,
      ["sign"],
    );
    const mac = await subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload),
    );
    const bytes = new Uint8Array(mac);

    let expected: string;
    if (encoding === "hex") {
      expected = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } else {
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      expected = btoa(binary);
    }

    if (expected.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}
