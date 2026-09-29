# Network

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when talking to HTTP APIs, WebSockets, uploads, or verifying webhooks.

### Network primitives

```tsx
import {
  createApi,
  createWebSocket,
  createSearch,
  createUpload,
  createPagination,
  verifyWebhookSignature,
} from "solid-drift";

const user = createApi<User>({ url: () => `/api/users/${id()}` });
// user.data(), user.error(), user.status(), user.retry(), user.abort()

const socket = createWebSocket("wss://example.com/live");
socket.send({ type: "subscribe", channel: "prices" });

const search = createSearch({ fetcher: (q, signal) => searchUsers(q, signal) });
search.setQuery(input); // debounced; aborts the in-flight request

const upload = createUpload({ url: "/api/files" });
upload.upload(file); // upload.progress() goes 0 to 1

const pages = createPagination({ fetcher: (page, signal) => fetchPage(page, signal) });
pages.next(); // appends; pages.hasMore() tells you when to stop

const valid = await verifyWebhookSignature({
  payload: rawBody,
  signature: req.headers.get("x-signature") ?? "",
  secret: WEBHOOK_SECRET,
  prefix: "sha256=",
});
```

Every reactive primitive exposes `{ data, error, status, retry, abort }` (`status` is `"idle"`, `"loading"`, `"success"`, or `"error"`), plus its own controls.

- `createApi({ url, method?, headers?, body?, fetchFn?, immediate?, parse? })`: reactive fetch. A URL accessor refetches when it changes. Plain-object bodies are serialized as JSON. Non-2xx responses become errors. `execute()` runs it manually when `immediate` is false.
- `createWebSocket(url, { protocols?, reconnect?, reconnectDelayMs?, maxReconnectAttempts?, WebSocketImpl? })`: `{ data, error, status, send, retry, abort, close }`. `status` is `"connecting"`, `"open"`, `"closed"`, or `"error"`. Incoming messages are JSON-parsed when possible. Unexpected closes reconnect with exponential backoff; `retry()` reconnects now, `close()` shuts down for good. `send()` accepts a string or an object (serialized as JSON).
- `createSearch({ fetcher, debounceMs?, minLength? })`: `{ query, setQuery, data, error, status, retry, abort, clear }`. Setting the query debounces, then calls `fetcher(query, signal)`; a new keystroke aborts the in-flight request. Short queries clear the results.
- `createUpload({ url?, fieldName?, headers?, withCredentials?, XHRImpl?, parse? })`: `{ data, error, status, progress, upload, retry, abort }`. Multipart POST via XMLHttpRequest (fetch cannot report upload progress). `progress()` goes 0 to 1; the response is JSON-parsed when possible.
- `createPagination({ fetcher, initialPage?, append? })`: `{ data, page, hasMore, total, error, status, next, prev, goto, reset, retry, abort }`. `next()` appends the following page; `prev()`/`goto()` replace. `hasMore` comes from the fetcher, or is derived from `total`.
- `verifyWebhookSignature({ payload, signature, secret, algorithm?, encoding?, prefix? })`: async pure helper that checks an HMAC signature (SHA-256 hex by default; SHA-1 and base64 supported) with a timing-safe comparison. Returns `false` when verification is unavailable or fails; never throws. Uses WebCrypto.

All SSR-safe: nothing fires on the server until you call it.
