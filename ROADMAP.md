# solid-drift Roadmap

Proposed additions from the 2026-09-27 research pass (web research plus
SolidJS ecosystem gap analysis). Release plan approved by the owner on
2026-09-27: build sequentially, test carefully, then notify the website
chat and publish to npm.

Release history has moved to [CHANGELOG.md](./CHANGELOG.md).

Each release: implement, export, document in README, full Vitest suite,
tsc clean, production build, em-dash and prohibited-term scans, commit
plus annotated tag as Austin Nguyen, push via GitHub REST, publish to
npm, confirm on the registry. Mark each item shipped below as releases
land.

## How an idea earns a place

- Clear input to process to output contract. Not every function needs an
  output signal, but every primitive must state what it takes in, what it
  does, and what it hands back.
- Signal native, SSR safe, zero runtime dependencies.
- Pure functions where no reactivity is needed.
- No embedded secrets. Credentials stay in memory only (BYOK rule).
- Do not duplicate what the ecosystem already covers well
  (TanStack Query/Table/Virtual Solid adapters, Kobalte/Ark UI,
  Modular Forms, Paraglide, Supabase/PocketBase SDKs).

## Batch A: researched additions (strong fit)

Animation and choreography:

- createPresence: exit animations that run before unmount. In: presence
  signal plus exit spec. Out: isExiting state, forceExit. Covers the
  number one debugging trap in animation libraries.
- createViewTransition: wrapper around the browser View Transitions API
  with fallback. In: DOM update function. Out: supported flag,
  transitioning state. No-op on the server.
- createScrollReveal: scroll triggered reveal choreography with stagger
  and variants. In: element refs plus config. Out: replay and reset
  controls. Goes beyond createInView, which only returns a boolean.

AI application UI:

- createApprovalGate: human in the loop for agent flows. In: action
  proposal. Out: idle/pending/approved/denied status plus approve and
  deny actions. Pairs with createAgentTx.
- createTokenStream: streamed text with citation chips. In: token stream
  with citation marks. Out: text and citation segments. Extends
  createStreamReveal with the trust pattern AI apps need.

Web3:

- sanitizeOnchain: pure function. In: untrusted onchain string (token
  name, memo, ENS). Out: sanitized string safe to render. Onchain names
  are a real XSS vector.

Mobile and offline:

- createOfflineQueue: offline mutation queue. In: send function. Out:
  queue, pending count, flush, status. Replays on reconnect, pairs with
  createOnline and createNetwork.

Social workflows (pure functions, no OAuth needed):

- validatePost: pre-flight validator. In: text, media, platform list.
  Out: valid flag plus per-platform errors. Captures the painful part of
  multi-channel posting without touching credentials.
- normalizeAnalytics: payload normalizer. In: raw per-platform
  analytics. Out: unified shape (followers, views, likes, shares,
  comments, engagement rate).

## Batch B: generic web primitives ("VueUse for Solid")

SolidJS has no VueUse equivalent. These are hand-rolled in nearly every
project. Proposed as a new "web" family.

Data and network:

- createApi: fetch wrapper with timeout, retry plus backoff, auth header
  injection, dedup, abort. In: base URL, headers or token getter, retry
  policy. Out: data, error, status, retry, abort (matches the existing
  network primitive contract). Positioned as the light option for simple
  apps. Complex apps should keep using TanStack Query.
- createWebSocket: auto reconnecting socket. In: URL plus options. Out:
  status, send, last message. Heartbeat and queue-while-offline included.
- createSearch: combined search pipeline. In: query signal. Out:
  results, status. Debounce plus abortable fetch in one function.
- createUpload: file upload with progress. In: file plus endpoint. Out:
  progress percent, status, abort, retry. Chunked upload support.
- createPagination: pagination state machine. In: fetcher plus page
  size. Out: page, items, next, prev, status.
- verifyWebhookSignature: pure function. In: payload, signature, secret.
  Out: boolean. Stripe and Svix style HMAC verification.

Browser APIs:

- createGeolocation: position plus watch, with permission denial
  handling.
- createElementSize: ResizeObserver for an element. In: element ref.
  Out: width and height signals. createMediaQuery only covers the
  viewport.
- createEventListener: auto cleanup listener helper. In: target, event,
  handler. Everyone hand-rolls this.
- createHotkey: keyboard shortcuts. In: key combo. Out: trigger control.
- createTimeAgo: relative time. In: timestamp. Out: updating label such
  as "3 minutes ago".
- createPermission: unified permission state for camera, mic,
  notifications, geolocation.
- createScriptLoader: dynamic script and style loading. In: URL. Out:
  loaded and error states.

Auth (real SolidJS gap: better-auth Solid bridge is broken on Solid 2,
the Auth.js adapter is retired):

- createAuthSession: minimal session manager. In: token getter and
  refresher. Out: user, status, login, logout. Tokens stay in memory
  only. Does not implement OAuth flows, that stays with auth providers.

## Batch C: consider later (needs the user's own backend)

- createTracker: tiny bring-your-own-backend event tracker under 2 KB.
- useConsent: GDPR style consent state.
- createFunnel: conversion rates from plain step arrays. Pulls the
  library toward data visualization, so it needs a deliberate decision.

## Out of scope

- Direct multi-channel social posting from the client. OAuth token
  lifecycle, silent failures, and app review are platform liabilities a
  zero dependency client library cannot absorb. Ship as a docs recipe
  with a BYOK provider instead.
- Full analytics backend or dashboard.
- Heavy eval tooling.
- Direct database clients. Browsers must not talk to databases directly.
  Use Supabase or PocketBase SDKs, which are framework agnostic and work
  with Solid, composed with createApi and createWebSocket.
- Receiving webhooks. Requires a server by definition.

## Solid 2 (deferred until stable)

Checked 2026-09-29 against `solid-js@2.0.0-rc.11` (no stable 2.x on npm
yet): 63 type errors and 455 of 780 test failures. Solid 2 removes
single-arg `createEffect`, defers signal writes until `flush()`, and
drops `batch`. The deferred-write model also conflicts with the
library's synchronous animation engine, so the port may need
engine-level rethinking. Revisit after the stable 2.0 release with a
dedicated migration spike (estimate 2 to 4 days), likely as a new
solid-drift major. Until then the peer range stays `^1.0.0`.

## Demoted backlog (unchanged)

createFavicon, createBlip, createGlitch, createMatrix. createTxExplainer
stays a documentation recipe.

## Planned monetization (not built)

Deliberately hands-off: no consulting, no per-sponsor perks, no issue
bounties. Sponsorship is thank-you only.

- Pro recipes pack: a paid one-time download (landing page, onboarding,
  and pricing page animation recipes built on solid-drift), sold through
  Lemon Squeezy or Gumroad so checkout, delivery, and refunds are fully
  automatic. Target price 19 to 49 USD. The sale page states clearly that
  no support is included and that refunds within 14 days are handled by
  the platform. Start after the playground ships and real usage exists.
- Docs and playground ads (later): one small discreet banner such as
  EthicalAds or Carbon Ads once traffic justifies it. Automatic revenue,
  no sales work.

## Planned phase 2: onchain sponsor badges (not built)

Fully automatic sponsor perk with zero human interaction. A sponsor on
GitHub Sponsors can claim a soulbound NFT badge per tier ($3/$10/$25)
through a claim page hosted on the playground: sign in with GitHub to
verify the sponsorship, connect a wallet, mint. The badge is
non-transferable proof of support, not a product.

- Chain: Base (deployment about 2 to 10 USD once, mint about 0.05 to
  0.30 USD each). Contract: ERC-1155 with one token id per tier, or a
  no-code deploy through thirdweb.
- Verification: GitHub Sponsors GraphQL API plus the sponsorship webhook.
  Backend fits on a free Cloudflare Worker; a small hot wallet covers gas
  if the project sponsors it.
- Sequencing: build only after the playground ships AND real sponsors
  exist. It boosts conversion, it does not create demand. The claim page
  doubles as a live demo of the library's web3 and animation primitives.
