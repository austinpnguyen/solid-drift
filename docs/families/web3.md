# Web3

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when building onchain UI: transactions, prices, NFTs, identity, market data.

### `createTxLifecycle(options?)`

Transaction lifecycle for onchain UI, with zero wallet dependencies: feed it wagmi/viem-style state through an accessor (the adapter pattern) and it maps that to `idle`, `signing`, `pending`, `confirming`, `success`, `failed`. `progress()` springs between 0, 0.25, 0.5, 0.75, 1 so progress rings glide instead of jumping.

```ts
// Adapter: your wagmi/viem state in, tx state out.
const [chain] = createSignal({ status: "idle" as const, confirmations: 0 });
const tx = createTxLifecycle({
  source: () => ({
    status: chain().status, // "idle" | "pending" | "success" | "error"
    confirmations: chain().confirmations,
  }),
  requiredConfirmations: 2,
  onEnter: (s) => console.log("tx:", s),
});
tx.set("signing"); // manual: the moment the wallet prompt opens
```

Standard mapping: `set("signing")` when the wallet prompt opens, source `pending` (hash received) maps to `"pending"`, confirmations reaching the threshold promote to `"confirming"`, source `success`/`error` map to `"success"`/`"failed"`. Omit `source` for a fully manual lifecycle. Returns `{ state, set, reset, progress }`. On the server it stays `"idle"` with `progress()` 0; under reduced motion state changes apply instantly and `progress()` jumps to its target.

### `createTicker(source, ref, options?)`

[Try it](https://austinpnguyen.github.io/solid-drift/#/web3/createTicker)

A price ticker with rolling digits: each digit rolls vertically on change, the whole figure flashes green/red on up/down moves, and rapid source updates batch into one render per frame. `display()` always holds the formatted string, so SSR and tests read the price without DOM.

```tsx
const [price] = createSignal(64218.5);
const ticker = createTicker(price, () => priceEl, {
  decimals: 2,
  locale: "en-US",
  upColor: "#16a34a",
  downColor: "#dc2626",
  flashMs: 600,
});
<div>
  <span ref={priceEl} aria-label={`Price ${ticker.display()}`} />
</div>
```

Returns `{ display, direction }`. `direction()` is `"up"`, `"down"`, or `"flat"`. Formatting uses `Intl.NumberFormat` with the given locale. Under reduced motion the text swaps instantly with no rolling digits and no color flash; on the server only `display()` and `direction()` work.

### `createMintReveal(ref, options?)`

An NFT mint reveal: an anticipation shake winds up, the card flips on rotateY, `onFlip` fires at the midpoint (edge-on, so the face swap is invisible), and squash-and-stretch sells the landing. `reset()` returns the card to idle.

```tsx
let card!: HTMLDivElement;
const reveal = createMintReveal(() => card, {
  shakeDuration: 500,
  flipDuration: 700,
  squash: true,
  onFlip: () => setFace("revealed"), // swap the artwork mid-flip
});
<button onClick={() => reveal.play()}>Reveal</button>
<div ref={card} style={{ "transform-style": "preserve-3d" }} />
```

Returns `{ play, reset, status }`. `status()` walks `"idle"`, `"anticipating"`, `"flipping"`, `"revealed"`. Under reduced motion (and on the server) `play()` applies the revealed state immediately and still calls `onFlip`.

### `createDepixelate(image, canvas, options?)`

Pixel-to-sharp image reveal, the classic NFT mint ceremony. An image renders into a canvas fully pixelated, then resolves to sharp in discrete chunky steps on the shared animation clock. Owns the canvas drawing: give it an image and a canvas, call `play()` when the art should reveal. The pixelated teaser frame paints itself as soon as the image loads, so the pre-reveal state needs no manual setup. Pair with `createMintReveal` for the full ceremony: flip the card, depixelate the art.

```tsx
let img!: HTMLImageElement
let cvs!: HTMLCanvasElement
const reveal = createDepixelate(() => img, () => cvs, { duration: 1800 })
<img ref={img} src={artUrl} style={{ display: "none" }} />
<canvas ref={cvs} />
<button onClick={() => reveal.play()}>Reveal</button>
```

| Option       | Default           | Description                                    |
| ------------ | ----------------- | ---------------------------------------------- |
| `levels`     | `10`              | Discrete pixelation steps from blocky to sharp |
| `duration`   | `1600`            | Full reveal duration in ms                     |
| `easing`     | `"easeInOutCubic"`| Easing for the reveal progress                 |
| `onComplete` | none              | Called when the reveal reaches sharp           |

Returns `{ pixelSize, progress, status, play, complete, reset, stop }`. `status()` walks `"idle"`, `"revealing"`, `"revealed"`; `pixelSize()` is the current block size in px (1 means sharp). `stop()` halts mid-reveal and resolves the pending `play()` promise; `reset()` repaints the teaser; `complete()` jumps to sharp. Under reduced motion (and on the server) the art is sharp immediately.

### `createConnectButton(ref, options?)`

Wallet connect button micro-interactions: magnetic pull toward the pointer, a press scale, an animated check overlay for copy-address feedback, and a chain pulse ring. Pointer handling is global (presses that start inside still count if released outside), and everything cleans up on unmount.

```tsx
let btn!: HTMLButtonElement;
const connect = createConnectButton(() => btn, { strength: 0.35 });
<button
  ref={btn}
  onClick={() => {
    navigator.clipboard.writeText(address);
    connect.copyTick(); // check overlay pops, then fades
  }}
>
  {address}
</button>
```

Returns `{ copyTick, chainPulse, status }`. `status()` is `"idle"`, `"ticking"` (check visible), or `"pulsing"` (ring expanding). Call `chainPulse()` after a successful connection or network switch. Under reduced motion there is no magnetic pull or scale; `copyTick()` and `chainPulse()` still show their overlays statically.

### `createAgentTx(options?)`

The agent proposes, the user approves, the transaction executes. The agent (a model-driven client) calls `propose()` with a plain-data proposal the user can read (`to`, `value`, `data`, `description`, `chainId`); the user calls `approve()` or `reject()`; `execute()` hands the approved proposal to your wallet adapter and the inner `createTxLifecycle` tracks signing to confirmation. The library never signs: `execute` is your wagmi/viem send function.

States flow `idle` to `proposed` to `approved` to `executing` to `confirmed`, with `rejected` and `failed` as the off-ramps. Invalid transitions are no-ops, so an automated UI cannot skip the user's approval. `progress()` is spring-smoothed across the whole flow for progress UI, and `tx` exposes the inner lifecycle for manual driving or extra rendering.

```tsx
const agentTx = createAgentTx({
  execute: async (p) => sendTransaction({ to: p.to, value: p.value }),
  source: () => receiptQuery(), // wagmi/viem-style status
});
// The agent proposes:
agentTx.propose({
  to: "0x…",
  value: "1000000000000000000",
  description: "Swap 1 ETH for USDC at the current rate.",
});
// The user reviews agentTx.proposal() and taps approve:
agentTx.approve();
await agentTx.execute(); // "executing" to "confirmed"
```

DriftSpec gains two model-generatable web3 steps for full dApp choreography: `"agentTx"` (options `to`, `description`, `value`, `data`, `chainId`, `autoApprove`) proposes a transaction mid-spec and waits for the host, via the new `createSpecPlayer(spec, refs, hooks)` third parameter, to approve and execute it through `hooks.onAgentTxStep`; `"txReceipt"` (options `hash`, `endpoint`, `timeout`) waits for a transaction hash to mine. A typical generated ceremony reads: `streamReveal` (explain) to `agentTx` (approve and send) to `txReceipt` (confirm).

```json
{
  "version": 1,
  "scenes": [
    { "primitive": "streamReveal", "target": "explainer", "options": { "text": "The agent proposes swapping 1 ETH for USDC." } },
    { "primitive": "agentTx", "options": { "to": "0x…", "description": "Swap 1 ETH for USDC.", "value": "1000000000000000000" } },
    { "primitive": "txReceipt", "options": { "hash": "0x…" } }
  ]
}
```

### Web3 data layer

A zero-dependency read layer for chain and market data as signals: public RPC and API endpoints over `fetch`, with user-swappable endpoints. Every network primitive shares the `{ data, error, status, retry, abort }` shape, is SSR-safe (nothing fetches on the server), and polls with error backoff. Defaults are conservative because public endpoints are rate-limited. This is read-only: transaction signing stays with wallet libraries.

```tsx
import {
  createPoll, createTokenPrice, createPriceChange, createPriceCompare,
  createGasPrice, createBalance, createTxReceipt, createBlockNumber,
  createChainlinkPrice, createNFTMetadata, createENS, createIdenticon,
  createChain, CHAINS, shortenAddress, isAddress, formatUnits, parseUnits,
  sanitizeOnchain,
} from "solid-drift";
```

**Polling infra.** `createPoll(fetcher, options?)` fetches immediately (unless `immediate: false`), then on `interval` (default 30s). On error the interval multiplies by `backoff` (default 2) up to `maxInterval` (default 5min) and resets on the next success. Returns `{ data, error, status, retry, abort }`; `status()` is `"idle"`, `"loading"`, `"success"`, or `"error"`.

**Pure helpers.** `isAddress(value)` checks `0x` + 40 hex chars. `shortenAddress(address, chars = 4)` renders `0xd8dA…6045` and passes invalid input through. `formatUnits(value, decimals = 18)` formats wei-style bigints as decimal strings without float artifacts; `parseUnits(value, decimals = 18)` parses them back and throws on invalid input. `sanitizeOnchain(input, options?)` sanitizes an untrusted onchain string (token name, memo, ENS label) for display: strips event handler attributes (`onerror=...`), neutralizes dangerous URL schemes in href/src style attributes (`javascript:`, `vbscript:`, non-image `data:` become `"#"`; `http`, `https`, `mailto`, relative URLs, anchors, and `data:image/` pass, with `allowedSchemes` customizable), then HTML-escapes the result, so the output is safe for `innerHTML`. Non-strings coerce (`null`/`undefined` become `""`); `maxLength` truncates. `CHAINS` maps seven chain ids (Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum One, Sepolia) to name, currency, decimals, explorer, and a public RPC; `createChain(id)` looks one up as a reactive accessor (`undefined` for unknown ids). Try them: [shortenAddress](https://austinpnguyen.github.io/solid-drift/#/web3/address-utils) · [isAddress](https://austinpnguyen.github.io/solid-drift/#/web3/address-utils) · [formatUnits](https://austinpnguyen.github.io/solid-drift/#/web3/address-utils).

**Market.** `createTokenPrice(tokenId, options?)` polls CoinGecko's public API (default 60s; swap `endpoint` or `vsCurrency`) and exposes `price()` and `change24h()`. `createPriceChange(source, options?)` samples any numeric signal on change and on `sampleMs` (default 60s), keeps a rolling `windowMs` (default 1h), and reports the percent change between the first and last sample; `reset()` clears the window. `createPriceCompare(a, b)` compares two price signals with `ratio()`, `diffPercent()`, and `leader()` (`"a"`, `"b"`, or `"tie"`).

**Chain (JSON-RPC).** `createGasPrice(options?)` reads `eth_gasPrice` every 15s as `{ wei, gwei }`. `createBalance(address, options?)` reads the native balance every 20s, or an ERC20 `balanceOf` when `token` is set, exposing `balance()` (bigint) and `formatted()`. `createTxReceipt(hash, options?)` polls every 4s until the receipt lands, then stops on its own; `mined()` mirrors that and `receipt()` carries `transactionHash`, `blockNumber`, `success`, and `gasUsed`. `createBlockNumber(options?)` polls the latest block every 12s as a chain-health heartbeat. `createChainlinkPrice(feed, options?)` reads a Chainlink `AggregatorV3Interface` feed on-chain (`decimals()` once, then `latestRoundData()` every 30s). All take an `endpoint` option defaulting to a public mainnet RPC.

**Identity and NFTs.** `createNFTMetadata(contract, tokenId, options?)` fetches `tokenURI` on-chain, resolves the JSON (one-shot with `retry`), rewrites `ipfs://` through a gateway, and exposes `metadata()` (`name`, `description`, `image`, `attributes`, `raw`) plus `image()`. `createENS(address, options?)` reverse-resolves an address through the public ENS registry (one-shot with `retry`); `name()` is `undefined` when no name is set. `createIdenticon(address, options?)` renders a deterministic mirrored-grid SVG avatar as a data URI, pure computation, works on the server.

```tsx
const { price, change24h } = createTokenPrice("ethereum");
const { change } = createPriceChange(price);
const { formatted } = createBalance("0xd8dA…6045");
const { mined, receipt } = createTxReceipt("0x5c50…f7b");
const avatar = createIdenticon("0xd8dA…6045");
```
