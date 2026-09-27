import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";

/**
 * Web3 data layer: zero-dependency chain and market data as signals.
 *
 * Public RPC and API endpoints over fetch, with user-swappable endpoints.
 * Every network primitive shares the `{ data, error, status, retry, abort }`
 * shape and is SSR-safe (nothing fetches on the server).
 *
 * Honest limits: public endpoints are rate-limited, so default polling
 * intervals are conservative. This is a read-only data layer: transaction
 * signing stays with wallet libraries like wagmi.
 */

export type PollStatus = "idle" | "loading" | "success" | "error";

export interface PollOptions {
  /** Milliseconds between fetches. Default 30000. */
  interval?: number;
  /** Error backoff multiplier. Default 2. */
  backoff?: number;
  /** Backoff cap in milliseconds. Default 300000. */
  maxInterval?: number;
  /** Fetch immediately on creation. Default true. */
  immediate?: boolean;
}

export interface PollControls<T> {
  data: Accessor<T | undefined>;
  error: Accessor<Error | null>;
  status: Accessor<PollStatus>;
  /** Fetch now and reset the backoff. */
  retry: () => void;
  /** Stop polling and abort any in-flight request. */
  abort: () => void;
}

/**
 * Backoff polling infrastructure for the data primitives.
 *
 * Fetches immediately (unless `immediate: false`), then on `interval`.
 * On error the interval multiplies by `backoff` up to `maxInterval` and
 * resets on the next success. Uses `setTimeout`, so background tabs get
 * the browser's natural timer throttling instead of a busy rAF loop.
 * SSR-safe: never fetches on the server.
 *
 * ```ts
 * const { data, status, retry, abort } = createPoll(
 *   async (signal) => {
 *     const res = await fetch("https://api.example.com/price", { signal });
 *     return res.json();
 *   },
 *   { interval: 30000 },
 * );
 * ```
 */
export function createPoll<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: PollOptions = {},
): PollControls<T> {
  const {
    interval = 30000,
    backoff = 2,
    maxInterval = 300000,
    immediate = true,
  } = options;

  const [data, setData] = createSignal<T | undefined>(undefined);
  const [error, setError] = createSignal<Error | null>(null);
  const [status, setStatus] = createSignal<PollStatus>("idle");

  let timer: ReturnType<typeof setTimeout> | null = null;
  let aborter: AbortController | null = null;
  let delay = interval;
  let stopped = false;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const run = async (): Promise<void> => {
    if (stopped || typeof window === "undefined") return;
    clearTimer();
    aborter?.abort();
    aborter = new AbortController();
    const signal = aborter.signal;
    setStatus("loading");
    try {
      const value = await fetcher(signal);
      if (signal.aborted || stopped) return;
      setData(() => value);
      setError(null);
      setStatus("success");
      delay = interval;
    } catch (e) {
      if (signal.aborted || stopped) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus("error");
      delay = Math.min(delay * backoff, maxInterval);
    }
    if (!stopped && typeof window !== "undefined") {
      timer = setTimeout(() => void run(), delay);
    }
  };

  const retry = (): void => {
    stopped = false;
    delay = interval;
    void run();
  };

  const abort = (): void => {
    stopped = true;
    clearTimer();
    aborter?.abort();
    aborter = null;
  };

  if (typeof window !== "undefined" && immediate) {
    void run();
  }

  onCleanup(abort);

  return { data, error, status, retry, abort };
}

/**
 * Shorten an EVM address: `0x1234567890abcdef...` becomes `0x1234…abcd`.
 * Returns the input unchanged when it is not a valid address.
 */
export function shortenAddress(address: string, chars = 4): string {
  if (!isAddress(address)) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** True for `0x` + 40 hex chars. Checksum-agnostic. */
export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Format a wei-style integer as a decimal string: `formatUnits(1500000000000000000n)`
 * is `"1.5"`. Accepts bigint or integer strings. BigInt-safe, no floats.
 */
export function formatUnits(value: bigint | string, decimals = 18): string {
  const str = typeof value === "bigint" ? value.toString() : value;
  if (!/^-?\d+$/.test(str)) {
    throw new Error("formatUnits: value must be an integer string or bigint.");
  }
  const negative = str.startsWith("-");
  const digits = negative ? str.slice(1) : str;
  const padded = digits.padStart(decimals + 1, "0");
  const int = decimals > 0 ? padded.slice(0, -decimals) : padded;
  const frac = decimals > 0 ? padded.slice(-decimals).replace(/0+$/, "") : "";
  const intClean = int.replace(/^0+(?=\d)/, "");
  return (negative ? "-" : "") + intClean + (frac ? `.${frac}` : "");
}

/**
 * Parse a decimal string into wei-style bigint: `parseUnits("1.5")` is
 * `1500000000000000000n`. Throws on invalid input or too many decimals.
 */
export function parseUnits(value: string, decimals = 18): bigint {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!m || (m[2] === "" && m[3] === "")) {
    throw new Error("parseUnits: invalid decimal string.");
  }
  const fracPart = m[3] ?? "";
  if (fracPart.length > decimals) {
    throw new Error("parseUnits: too many decimal places.");
  }
  const int = (m[2] === "" ? "0" : m[2]) + fracPart.padEnd(decimals, "0");
  const clean = int.replace(/^0+(?=\d)/, "");
  return BigInt(`${m[1]}${clean}`);
}

export interface SanitizeOnchainOptions {
  /**
   * URL schemes allowed in href/src style attributes. Anything else
   * (plus `data:` outside images) is replaced with `"#"`.
   * Default `["http", "https", "mailto"]`. Relative URLs, anchors,
   * and `data:image/` are always allowed.
   */
  allowedSchemes?: string[];
  /**
   * Truncate the output to this many characters. Default 0 (no limit).
   */
  maxLength?: number;
}

const URL_ATTRS = "href|src|action|formaction|xlink:href|cite|poster";

const stripEventHandlers = (input: string): string =>
  input.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

const neutralizeDangerousUrls = (
  input: string,
  allowedSchemes: string[],
): string => {
  const allowed = new Set(allowedSchemes.map((s) => s.toLowerCase()));
  const attrRe = new RegExp(
    `\\b(${URL_ATTRS})\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`,
    "gi",
  );
  return input.replace(
    attrRe,
    (match: string, name: string, rawValue: string) => {
      const quote = rawValue[0] === '"' || rawValue[0] === "'" ? rawValue[0] : "";
      const value = quote
        ? rawValue.slice(1, -1)
        : rawValue;
      const trimmed = value.trim();
      const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
      if (!schemeMatch) return match;
      const scheme = schemeMatch[1].toLowerCase();
      if (allowed.has(scheme)) return match;
      if (scheme === "data" && /^data:image\//i.test(trimmed)) return match;
      return `${name}=${quote}#${quote}`;
    },
  );
};

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Sanitize an untrusted onchain string (token name, memo, ENS label)
 * for display. Onchain strings are attacker-controlled: token names
 * have been used to inject `<img onerror>` payloads and
 * `javascript:` URLs into dApp UIs.
 *
 * The function strips event handler attributes (`onerror=...`),
 * neutralizes dangerous URL schemes in href/src style attributes
 * (`javascript:`, `vbscript:`, non-image `data:`), then HTML-escapes
 * the result. The output is safe to render via `innerHTML` and, with
 * no markup left, also safe as plain text.
 *
 * Pure function, SSR-safe.
 *
 * ```ts
 * sanitizeOnchain('<img src=x onerror=alert(1)>');
 * // "&lt;img src=x&gt;"
 * sanitizeOnchain('<a href="javascript:alert(1)">x</a>');
 * // "&lt;a href=\"#\"&gt;x&lt;/a&gt;"
 * ```
 */
export function sanitizeOnchain(
  input: unknown,
  options: SanitizeOnchainOptions = {},
): string {
  const { allowedSchemes = ["http", "https", "mailto"], maxLength = 0 } =
    options;
  const str = input === null || input === undefined ? "" : String(input);
  let out = escapeHtml(neutralizeDangerousUrls(stripEventHandlers(str), allowedSchemes));
  if (maxLength > 0 && out.length > maxLength) {
    out = out.slice(0, maxLength);
  }
  return out;
}

export interface ChainInfo {
  id: number;
  name: string;
  currency: string;
  decimals: number;
  explorer: string;
  rpc: string;
}

/** Registry of well-known EVM chains: id to name, currency, explorer, RPC. */
export const CHAINS: Record<number, ChainInfo> = {
  1: {
    id: 1,
    name: "Ethereum",
    currency: "ETH",
    decimals: 18,
    explorer: "https://etherscan.io",
    rpc: "https://ethereum.publicnode.com",
  },
  10: {
    id: 10,
    name: "Optimism",
    currency: "ETH",
    decimals: 18,
    explorer: "https://optimistic.etherscan.io",
    rpc: "https://optimism.publicnode.com",
  },
  56: {
    id: 56,
    name: "BNB Chain",
    currency: "BNB",
    decimals: 18,
    explorer: "https://bscscan.com",
    rpc: "https://bsc.publicnode.com",
  },
  137: {
    id: 137,
    name: "Polygon",
    currency: "POL",
    decimals: 18,
    explorer: "https://polygonscan.com",
    rpc: "https://polygon-bor.publicnode.com",
  },
  8453: {
    id: 8453,
    name: "Base",
    currency: "ETH",
    decimals: 18,
    explorer: "https://basescan.org",
    rpc: "https://base.publicnode.com",
  },
  42161: {
    id: 42161,
    name: "Arbitrum One",
    currency: "ETH",
    decimals: 18,
    explorer: "https://arbiscan.io",
    rpc: "https://arbitrum-one.publicnode.com",
  },
  11155111: {
    id: 11155111,
    name: "Sepolia",
    currency: "ETH",
    decimals: 18,
    explorer: "https://sepolia.etherscan.io",
    rpc: "https://ethereum-sepolia.publicnode.com",
  },
};

/**
 * Look up a chain in `CHAINS` as an accessor. Unknown ids give `undefined`.
 *
 * ```ts
 * const chain = createChain(() => 1)
 * chain()?.explorer // "https://etherscan.io"
 * ```
 */
export function createChain(
  source: number | Accessor<number>,
): Accessor<ChainInfo | undefined> {
  const get = typeof source === "function" ? source : () => source;
  return () => CHAINS[get()];
}

// ---------------------------------------------------------------------------
// keccak256 (for ENS namehash). Compact BigInt implementation, no dependencies.
// ---------------------------------------------------------------------------

const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const KECCAK_ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const MASK64 = 0xffffffffffffffffn;

function rotl64(v: bigint, n: number): bigint {
  if (n === 0) return v;
  return (((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK64);
}

function keccakF(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    const c = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) c[x] ^= state[x + 5 * y];
    }
    const d = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x++) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) state[x + 5 * y] ^= d[x];
    }
    const b = new Array<bigint>(25);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(
          state[x + 5 * y],
          KECCAK_ROT[x][y],
        );
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] =
          b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y] & MASK64) & b[(x + 2) % 5 + 5 * y]);
      }
    }
    state[0] ^= KECCAK_RC[round];
  }
}

/**
 * keccak256 of a byte array. Exported for tests; not part of the public API.
 */
export function keccak256(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const RATE = 136;
  let total = data.length + 1;
  total = total % RATE === 0 ? total + RATE : total + (RATE - (total % RATE));
  const padded = new Uint8Array(total);
  padded.set(data, 0);
  padded[data.length] = 0x01;
  padded[total - 1] |= 0x80;

  const state = new Array<bigint>(25).fill(0n);
  for (let off = 0; off < total; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      let lane = 0n;
      for (let j = 0; j < 8; j++) {
        lane |= BigInt(padded[off + i * 8 + j]) << BigInt(8 * j);
      }
      state[i] ^= lane;
    }
    keccakF(state);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 8; j++) {
      out[i * 8 + j] = Number((state[i] >> BigInt(8 * j)) & 0xffn);
    }
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function namehash(name: string): string {
  let node = new Uint8Array(32);
  if (name) {
    const labels = name.split(".");
    for (let i = labels.length - 1; i >= 0; i--) {
      const combined = new Uint8Array(64);
      combined.set(node, 0);
      combined.set(keccak256(new TextEncoder().encode(labels[i])), 32);
      node = keccak256(combined);
    }
  }
  return `0x${bytesToHex(node)}`;
}
const DEFAULT_ENDPOINT = "https://ethereum.publicnode.com";

async function rpc<T>(
  endpoint: string,
  method: string,
  params: unknown[],
  signal: AbortSignal,
): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${res.status}.`);
  }
  const json = (await res.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (json.error) {
    throw new Error(`RPC ${method} error: ${json.error.message ?? "unknown"}.`);
  }
  return json.result as T;
}

function parseAbiString(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = parseInt(clean.slice(64, 128), 16);
  const dataHex = clean.slice(128, 128 + len * 2);
  const bytes = new Uint8Array(dataHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export interface TokenPrice {
  /** Price in the quote currency. */
  price: number;
  /** 24h change percent, when the source reports it. */
  change24h?: number;
}

export interface TokenPriceOptions extends PollOptions {
  /** Quote currency id. Default "usd". */
  vsCurrency?: string;
  /** Price API base. Default CoinGecko public API. */
  endpoint?: string;
}

/**
 * Live token price as a signal, via CoinGecko's public API.
 *
 * The free endpoint is rate-limited; the default 60s interval is
 * conservative on purpose. Pass your own `endpoint` (any base that
 * answers `/simple/price?ids={id}&vs_currencies={vs}&include_24hr_change=true`).
 *
 * ```ts
 * const { price, change24h, status } = createTokenPrice("ethereum");
 * <Show when={status() === "success"}>
 *   ${(price() ?? 0).toFixed(2)} ({(change24h() ?? 0).toFixed(1)}%)
 * </Show>
 * ```
 */
export function createTokenPrice(
  tokenId: string | Accessor<string>,
  options: TokenPriceOptions = {},
): PollControls<TokenPrice> & {
  price: Accessor<number | undefined>;
  change24h: Accessor<number | undefined>;
} {
  const { vsCurrency = "usd", endpoint = "https://api.coingecko.com/api/v3", ...poll } =
    options;
  const getId = typeof tokenId === "function" ? tokenId : () => tokenId;
  const p = createPoll<TokenPrice>(
    async (signal) => {
      const res = await fetch(
        `${endpoint}/simple/price?ids=${encodeURIComponent(getId())}&vs_currencies=${encodeURIComponent(vsCurrency)}&include_24hr_change=true`,
        { signal },
      );
      if (!res.ok) {
        throw new Error(`Price fetch failed with HTTP ${res.status}.`);
      }
      const json = (await res.json()) as Record<
        string,
        { [k: string]: number }
      >;
      const row = json[getId()];
      if (!row || typeof row[vsCurrency] !== "number") {
        throw new Error(`No price returned for "${getId()}".`);
      }
      return {
        price: row[vsCurrency],
        change24h: row[`${vsCurrency}_24h_change`],
      };
    },
    { interval: 60000, ...poll },
  );
  return {
    ...p,
    price: () => p.data()?.price,
    change24h: () => p.data()?.change24h,
  };
}

export interface PriceChangeOptions {
  /** Rolling window in ms. Default 3600000 (1h). */
  windowMs?: number;
  /** How often to sample the source in ms. Default 60000. */
  sampleMs?: number;
}

/**
 * Percent change of any numeric signal over a rolling window.
 *
 * Samples the source on each change and on `sampleMs`, keeps samples
 * within `windowMs`, and reports `(last - first) / first * 100`.
 * `undefined` until at least two samples exist. Signal-native, no network.
 *
 * ```ts
 * const { price } = createTokenPrice("ethereum");
 * const { change, reset } = createPriceChange(price);
 * ```
 */
export function createPriceChange(
  source: Accessor<number | undefined>,
  options: PriceChangeOptions = {},
): { change: Accessor<number | undefined>; reset: () => void } {
  const { windowMs = 3600000, sampleMs = 60000 } = options;
  const [samples, setSamples] = createSignal<Array<{ t: number; v: number }>>(
    [],
  );

  const take = (): void => {
    const v = source();
    if (v == null || typeof window === "undefined") return;
    const t = Date.now();
    setSamples((prev) => [...prev.filter((s) => t - s.t <= windowMs), { t, v }]);
  };

  createEffect(() => {
    source();
    take();
  });

  if (typeof window !== "undefined") {
    const id = setInterval(take, sampleMs);
    onCleanup(() => clearInterval(id));
  }

  return {
    change: () => {
      const list = samples();
      if (list.length < 2) return undefined;
      const first = list[0].v;
      const last = list[list.length - 1].v;
      if (first === 0) return undefined;
      return ((last - first) / Math.abs(first)) * 100;
    },
    reset: () => setSamples([]),
  };
}

/**
 * Compare two numeric signals: their ratio, percent difference, and which
 * is larger. Any side `undefined` makes everything `undefined` until both
 * have values. Signal-native, no network.
 *
 * ```ts
 * const { price: eth } = createTokenPrice("ethereum");
 * const { price: btc } = createTokenPrice("bitcoin");
 * const { ratio, diffPercent, leader } = createPriceCompare(eth, btc);
 * ```
 */
export function createPriceCompare(
  a: Accessor<number | undefined>,
  b: Accessor<number | undefined>,
): {
  ratio: Accessor<number | undefined>;
  diffPercent: Accessor<number | undefined>;
  leader: Accessor<"a" | "b" | "tie" | undefined>;
} {
  return {
    ratio: () => {
      const x = a();
      const y = b();
      if (x == null || y == null || y === 0) return undefined;
      return x / y;
    },
    diffPercent: () => {
      const x = a();
      const y = b();
      if (x == null || y == null || y === 0) return undefined;
      return ((x - y) / Math.abs(y)) * 100;
    },
    leader: () => {
      const x = a();
      const y = b();
      if (x == null || y == null) return undefined;
      if (x === y) return "tie";
      return x > y ? "a" : "b";
    },
  };
}

// ---------------------------------------------------------------------------
// Chain data (JSON-RPC)
// ---------------------------------------------------------------------------

export interface GasPriceOptions extends PollOptions {
  /** JSON-RPC endpoint. Default a public mainnet endpoint. */
  endpoint?: string;
}

export interface GasPriceData {
  wei: bigint;
  gwei: number;
}

/**
 * Current gas price over JSON-RPC (`eth_gasPrice`), as wei bigint and gwei.
 * Default 15s polling. Swap `endpoint` for any chain.
 */
export function createGasPrice(
  options: GasPriceOptions = {},
): PollControls<GasPriceData> & {
  wei: Accessor<bigint | undefined>;
  gwei: Accessor<number | undefined>;
} {
  const { endpoint = DEFAULT_ENDPOINT, ...poll } = options;
  const p = createPoll<GasPriceData>(
    async (signal) => {
      const hex = await rpc<string>(endpoint, "eth_gasPrice", [], signal);
      const wei = BigInt(hex);
      return { wei, gwei: Number(wei) / 1e9 };
    },
    { interval: 15000, ...poll },
  );
  return { ...p, wei: () => p.data()?.wei, gwei: () => p.data()?.gwei };
}

const BALANCE_OF_SELECTOR = "0x70a08231";

export interface BalanceOptions extends PollOptions {
  /** JSON-RPC endpoint. Default a public mainnet endpoint. */
  endpoint?: string;
  /** ERC20 token contract. Omit for the native balance. */
  token?: string;
  /** Decimals for formatting. Default 18. */
  decimals?: number;
}

export interface BalanceData {
  balance: bigint;
  formatted: string;
}

/**
 * Token balance of an address: native (`eth_getBalance`) or ERC20
 * (`balanceOf` via `eth_call`). Read-only; never signs.
 *
 * ```ts
 * const { formatted } = createBalance("0xabc…", { token: "0xdef…" });
 * ```
 */
export function createBalance(
  address: string,
  options: BalanceOptions = {},
): PollControls<BalanceData> & {
  balance: Accessor<bigint | undefined>;
  formatted: Accessor<string | undefined>;
} {
  const { endpoint = DEFAULT_ENDPOINT, token, decimals = 18, ...poll } = options;
  if (!isAddress(address)) {
    throw new Error("createBalance: invalid address.");
  }
  const p = createPoll<BalanceData>(
    async (signal) => {
      let hex: string;
      if (token) {
        if (!isAddress(token)) {
          throw new Error("createBalance: invalid token address.");
        }
        const data =
          BALANCE_OF_SELECTOR + address.slice(2).toLowerCase().padStart(64, "0");
        hex = await rpc<string>(
          endpoint,
          "eth_call",
          [{ to: token, data }, "latest"],
          signal,
        );
      } else {
        hex = await rpc<string>(
          endpoint,
          "eth_getBalance",
          [address, "latest"],
          signal,
        );
      }
      const balance = BigInt(hex);
      return { balance, formatted: formatUnits(balance, decimals) };
    },
    { interval: 20000, ...poll },
  );
  return {
    ...p,
    balance: () => p.data()?.balance,
    formatted: () => p.data()?.formatted,
  };
}

export interface TxReceiptData {
  transactionHash: string;
  blockNumber: number;
  /** true when `status` is 0x1, false when 0x0 (reverted). */
  success: boolean;
  gasUsed: bigint;
}

export interface TxReceiptOptions extends PollOptions {
  /** JSON-RPC endpoint. Default a public mainnet endpoint. */
  endpoint?: string;
}

/**
 * Watch a transaction hash until its receipt lands. Polls every 4s and
 * stops on its own once the receipt arrives; `mined()` mirrors that.
 * Read-only confirmation; pairs with `createTxLifecycle` from web3.ts.
 */
export function createTxReceipt(
  hash: string,
  options: TxReceiptOptions = {},
): PollControls<TxReceiptData | null> & {
  receipt: Accessor<TxReceiptData | null | undefined>;
  mined: Accessor<boolean>;
} {
  const { endpoint = DEFAULT_ENDPOINT, ...poll } = options;
  const p = createPoll<TxReceiptData | null>(
    async (signal) => {
      const raw = await rpc<{
        transactionHash: string;
        blockNumber: string;
        status: string;
        gasUsed: string;
      } | null>(endpoint, "eth_getTransactionReceipt", [hash], signal);
      if (!raw) return null;
      return {
        transactionHash: raw.transactionHash,
        blockNumber: parseInt(raw.blockNumber, 16),
        success: raw.status === "0x1",
        gasUsed: BigInt(raw.gasUsed),
      };
    },
    { interval: 4000, ...poll },
  );
  createEffect(() => {
    if (p.data() != null) p.abort();
  });
  return { ...p, receipt: p.data, mined: () => p.data() != null };
}

export interface BlockNumberOptions extends PollOptions {
  /** JSON-RPC endpoint. Default a public mainnet endpoint. */
  endpoint?: string;
}

/**
 * Latest block number over JSON-RPC. Default 12s polling.
 * Handy as a chain-health heartbeat and a cache-busting ticker.
 */
export function createBlockNumber(
  options: BlockNumberOptions = {},
): PollControls<number> & { blockNumber: Accessor<number | undefined> } {
  const { endpoint = DEFAULT_ENDPOINT, ...poll } = options;
  const p = createPoll<number>(
    async (signal) => {
      const hex = await rpc<string>(endpoint, "eth_blockNumber", [], signal);
      return parseInt(hex, 16);
    },
    { interval: 12000, ...poll },
  );
  return { ...p, blockNumber: p.data };
}

const CHAINLINK_DECIMALS_SELECTOR = "0x313ce567";
const CHAINLINK_LATEST_SELECTOR = "0xfeaf968c";

export interface ChainlinkPriceOptions extends PollOptions {
  /** JSON-RPC endpoint. Default a public mainnet endpoint. */
  endpoint?: string;
}

/**
 * Read a Chainlink `AggregatorV3Interface` price feed on-chain:
 * `decimals()` once, then `latestRoundData()` polled every 30s.
 * Feed addresses live on the
 * [Chainlink docs](https://docs.chain.link/data-feeds/price-feeds/addresses).
 *
 * ```ts
 * // ETH / USD feed on mainnet
 * const { price } = createChainlinkPrice("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");
 * ```
 */
export function createChainlinkPrice(
  feed: string,
  options: ChainlinkPriceOptions = {},
): PollControls<number> & { price: Accessor<number | undefined> } {
  const { endpoint = DEFAULT_ENDPOINT, ...poll } = options;
  if (!isAddress(feed)) {
    throw new Error("createChainlinkPrice: invalid feed address.");
  }
  let decimals: number | null = null;
  const p = createPoll<number>(
    async (signal) => {
      if (decimals === null) {
        const raw = await rpc<string>(
          endpoint,
          "eth_call",
          [{ to: feed, data: CHAINLINK_DECIMALS_SELECTOR }, "latest"],
          signal,
        );
        decimals = parseInt(raw, 16);
      }
      const raw = await rpc<string>(
        endpoint,
        "eth_call",
        [{ to: feed, data: CHAINLINK_LATEST_SELECTOR }, "latest"],
        signal,
      );
      const answer = BigInt(`0x${raw.slice(2 + 64, 2 + 128)}`);
      return Number(answer) / 10 ** (decimals as number);
    },
    { interval: 30000, ...poll },
  );
  return { ...p, price: p.data };
}
// ---------------------------------------------------------------------------
// NFT metadata, ENS, identicons
// ---------------------------------------------------------------------------

export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<Record<string, unknown>>;
  raw: unknown;
}

export interface NFTMetadataOptions {
  /** JSON-RPC endpoint for `tokenURI`. Default a public mainnet endpoint. */
  endpoint?: string;
  /** IPFS gateway base. Default "https://ipfs.io". */
  gateway?: string;
}

/**
 * Fetch an NFT's `tokenURI` on-chain and resolve its JSON metadata
 * (one-shot, with `retry`). `ipfs://` URIs are rewritten through the
 * gateway. Returns the parsed fields plus `raw` for anything custom.
 *
 * ```ts
 * const { metadata, image, status, retry } = createNFTMetadata(
 *   "0xcontract…",
 *   42,
 * );
 * ```
 */
export function createNFTMetadata(
  contract: string,
  tokenId: string | number | bigint,
  options: NFTMetadataOptions = {},
): {
  data: Accessor<NFTMetadata | undefined>;
  error: Accessor<Error | null>;
  status: Accessor<PollStatus>;
  retry: () => void;
  abort: () => void;
  metadata: Accessor<NFTMetadata | undefined>;
  image: Accessor<string | undefined>;
} {
  const { endpoint = DEFAULT_ENDPOINT, gateway = "https://ipfs.io" } = options;
  if (!isAddress(contract)) {
    throw new Error("createNFTMetadata: invalid contract address.");
  }
  const [data, setData] = createSignal<NFTMetadata | undefined>(undefined);
  const [error, setError] = createSignal<Error | null>(null);
  const [status, setStatus] = createSignal<PollStatus>("idle");
  let aborter: AbortController | null = null;

  const toGateway = (uri: string): string =>
    uri.startsWith("ipfs://") ? `${gateway}/ipfs/${uri.slice(7)}` : uri;

  const load = async (): Promise<void> => {
    if (typeof window === "undefined") return;
    aborter?.abort();
    aborter = new AbortController();
    const signal = aborter.signal;
    setStatus("loading");
    try {
      const idHex = BigInt(tokenId).toString(16).padStart(64, "0");
      const uriRaw = await rpc<string>(
        endpoint,
        "eth_call",
        [{ to: contract, data: `0xc87b56dd${idHex}` }, "latest"],
        signal,
      );
      const uri = parseAbiString(uriRaw);
      const res = await fetch(toGateway(uri), { signal });
      if (!res.ok) {
        throw new Error(`Metadata fetch failed with HTTP ${res.status}.`);
      }
      const json = (await res.json()) as Record<string, unknown>;
      if (signal.aborted) return;
      setData({
        name: typeof json.name === "string" ? json.name : undefined,
        description:
          typeof json.description === "string" ? json.description : undefined,
        image: typeof json.image === "string" ? toGateway(json.image) : undefined,
        attributes: Array.isArray(json.attributes)
          ? (json.attributes as Array<Record<string, unknown>>)
          : undefined,
        raw: json,
      });
      setError(null);
      setStatus("success");
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus("error");
    }
  };

  if (typeof window !== "undefined") {
    void load();
  }

  onCleanup(() => aborter?.abort());

  return {
    data,
    error,
    status,
    retry: () => void load(),
    abort: () => aborter?.abort(),
    metadata: data,
    image: () => data()?.image,
  };
}

const ENS_REGISTRY = "0x00000000000C2C1F563e148400aA1D00d43e5D";
const ENS_RESOLVER_SELECTOR = "0x0178b8bf";
const ENS_NAME_SELECTOR = "0x691f3431";

export interface ENSOptions {
  /** JSON-RPC endpoint. Default a public mainnet endpoint. */
  endpoint?: string;
}

/**
 * Reverse-resolve an address to its ENS name via the public ENS registry
 * (one-shot, with `retry`). `undefined` when the address has no name set;
 * errors (network, RPC) surface on `error`.
 *
 * ```ts
 * const { name, status } = createENS("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
 * ```
 */
export function createENS(
  address: string,
  options: ENSOptions = {},
): {
  data: Accessor<string | undefined>;
  error: Accessor<Error | null>;
  status: Accessor<PollStatus>;
  retry: () => void;
  abort: () => void;
  name: Accessor<string | undefined>;
} {
  const { endpoint = DEFAULT_ENDPOINT } = options;
  if (!isAddress(address)) {
    throw new Error("createENS: invalid address.");
  }
  const [data, setData] = createSignal<string | undefined>(undefined);
  const [error, setError] = createSignal<Error | null>(null);
  const [status, setStatus] = createSignal<PollStatus>("idle");
  let aborter: AbortController | null = null;

  const load = async (): Promise<void> => {
    if (typeof window === "undefined") return;
    aborter?.abort();
    aborter = new AbortController();
    const signal = aborter.signal;
    setStatus("loading");
    try {
      const node = namehash(`${address.slice(2).toLowerCase()}.addr.reverse`);
      const resolverRaw = await rpc<string>(
        endpoint,
        "eth_call",
        [
          { to: ENS_REGISTRY, data: `${ENS_RESOLVER_SELECTOR}${node.slice(2)}` },
          "latest",
        ],
        signal,
      );
      const resolver = `0x${resolverRaw.slice(-40)}`;
      if (/^0x0+$/.test(resolver)) {
        if (!signal.aborted) {
          setData(undefined);
          setError(null);
          setStatus("success");
        }
        return;
      }
      const nameRaw = await rpc<string>(
        endpoint,
        "eth_call",
        [
          { to: resolver, data: `${ENS_NAME_SELECTOR}${node.slice(2)}` },
          "latest",
        ],
        signal,
      );
      const name = parseAbiString(nameRaw);
      if (signal.aborted) return;
      setData(name || undefined);
      setError(null);
      setStatus("success");
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus("error");
    }
  };

  if (typeof window !== "undefined") {
    void load();
  }

  onCleanup(() => aborter?.abort());

  return {
    data,
    error,
    status,
    retry: () => void load(),
    abort: () => aborter?.abort(),
    name: data,
  };
}

export interface IdenticonOptions {
  /** Pixel size of the square image. Default 64. */
  size?: number;
  /** Grid cells per side. Default 8. */
  cells?: number;
  /** Background color. Default "#f0f0f0". */
  background?: string;
}

/**
 * Deterministic identicon avatar for any address as a data URI: a mirrored
 * random-walk grid in SVG, so the same address always renders the same
 * image. Pure computation, works on the server, no network.
 *
 * ```tsx
 * const avatar = createIdenticon("0xabc…");
 * <img src={avatar()} alt="avatar" width={64} height={64} />;
 * ```
 */
export function createIdenticon(
  address: string | Accessor<string>,
  options: IdenticonOptions = {},
): Accessor<string> {
  const { size = 64, cells = 8, background = "#f0f0f0" } = options;
  const get = typeof address === "function" ? address : () => address;
  return () => {
    const seed = keccak256(new TextEncoder().encode(get().toLowerCase()));
    let s =
      (seed[0] << 24) | (seed[1] << 16) | (seed[2] << 8) | seed[3];
    const rand = (): number => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const color = `hsl(${Math.floor(rand() * 360)}, 65%, 55%)`;
    const half = Math.ceil(cells / 2);
    const unit = size / cells;
    let rects = "";
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < half; x++) {
        if (rand() > 0.5) {
          const mirrorX = cells - 1 - x;
          const mk = (rx: number): string =>
            `<rect x="${(rx * unit).toFixed(2)}" y="${(y * unit).toFixed(2)}" width="${unit.toFixed(2)}" height="${unit.toFixed(2)}" fill="${color}"/>`;
          rects += mk(x);
          if (mirrorX !== x) rects += mk(mirrorX);
        }
      }
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" fill="${background}"/>${rects}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };
}
