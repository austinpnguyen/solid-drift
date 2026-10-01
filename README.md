# solid-drift

[![npm version](https://img.shields.io/npm/v/solid-drift)](https://www.npmjs.com/package/solid-drift)
<!-- Sponsor badge: uncomment after the GitHub Sponsors profile is approved.
[![Sponsor](https://img.shields.io/badge/sponsor-austinpnguyen-ff69b4)](https://github.com/sponsors/austinpnguyen)
-->

Signal-native animation for SolidJS. Animate **values, not elements**: springs and tweens follow your signals, and retargeting mid-flight is seamless by design, with no restarts and no jumps.

[Live playground](https://austinpnguyen.github.io/solid-drift/)

Built with AI assistance.

## Install

```bash
npm install solid-drift
```

## Quick start

```tsx
import { createSignal } from "solid-js";
import { createSpring, createTween, drift } from "solid-drift";

function Panel() {
  const [open, setOpen] = createSignal(false);

  // Springs follow the signal with physics, tweens use duration and easing.
  const y = createSpring(() => (open() ? 0 : 24), {
    stiffness: 170,
    damping: 26,
  });
  const opacity = createTween(() => (open() ? 1 : 0), { duration: 250 });

  return (
    <>
      <button onClick={() => setOpen(!open())}>toggle</button>
      <div use:drift={{ y, opacity }}>slides and fades</div>
    </>
  );
}
```

## Primitives

Full documentation lives in the [docs folder](https://github.com/austinpnguyen/solid-drift/tree/main/docs/families), one page per family. Each page shows every primitive with signatures and examples.

| Family | What it covers |
| --- | --- |
| [Core](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/core.md) | springs, tweens, staggered lists, timelines, and imperative animation |
| [Scroll](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/scroll.md) | animation or state that follows scroll position |
| [Pointer and physics](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/pointer-and-physics.md) | elements that react to the pointer or simulate real physics |
| [Gesture](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/gesture.md) | drag or swipe interactions with touch parity |
| [Cartoon](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/cartoon.md) | cartoon-style motion: squash, anticipation, wobble |
| [Typography](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/typography.md) | text as the animation |
| [Motion graphics](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/motion-graphics.md) | directed scenes: cameras, cuts, beats, showreels |
| [AI and agent UI](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/ai-and-agent-ui.md) | AI chat, voice, streaming, or agent interfaces |
| [Web3](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/web3.md) | onchain UI: transactions, prices, NFTs, identity, market data |
| [Fun and feedback](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/fun-and-feedback.md) | delight: toasts, gacha, confetti, scratch-offs |
| [Utilities](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/utilities.md) | everyday app glue: DOM helpers, haptics, storage, gesture state |
| [Offline](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/offline.md) | mutations that survive flaky networks |
| [Social](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/social.md) | validating posts or normalizing analytics across platforms |
| [Network](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/network.md) | HTTP APIs, WebSockets, uploads, or verifying webhooks |
| [Browser](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/browser.md) | browser and mobile hardware APIs as signals |
| [Auth](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/auth.md) | auth sessions and decoding JWTs |
| [Analytics](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/analytics.md) | lightweight, consent-aware analytics |
| [Easings](https://github.com/austinpnguyen/solid-drift/blob/main/docs/families/easings.md) | named easing curves |

## How it works

One shared `requestAnimationFrame` loop drives every animation in the app, so hundreds of springs cost a single rAF tick per frame. Springs integrate with semi-implicit Euler, tweens sample an easing curve. When the tab becomes hidden the engine pauses the loop and freezes its clock, so nothing burns battery in the background; on return the clock continues where it left off and in-flight animations resume seamlessly. Everything is SSR-safe (animations simply don't run on the server).

## Bundle size

The package ships `sideEffects: false`, so bundlers tree-shake unused
primitives away. Import only what you use. Sizes below are minified +
gzipped, measured with esbuild (solid-js external).

| Family | Gzip | What it covers |
|---|---|---|
| core | 2.2 KB | springs, tweens, staggered lists, timelines |
| scroll | 5.0 KB | scroll progress, in-view, scrub, parallax |
| pointer | 3.5 KB | pointer tracking, physics, velocity, trails |
| gesture | 2.9 KB | drag, swipe, press, bottom sheets |
| cartoon | 4.5 KB | squash, anticipation, wobble, flips |
| typography | 6.2 KB | text animation, marquees, countdowns |
| motion-graphics | 7.0 KB | cameras, cuts, path drawing, variants |
| ai | 14.8 KB | agent UI, voice, streaming |
| web3 | 9.8 KB | transactions, tickers, market data |
| fun | 5.3 KB | toasts, confetti, gacha |
| utilities | 4.1 KB | DOM helpers, haptics, storage |
| offline | 1.4 KB | offline mutations, optimistic UI |
| social | 0.9 KB | post validation, analytics normalize |
| network | 2.5 KB | HTTP, WebSockets, uploads, webhooks |
| browser | 4.6 KB | browser and hardware APIs as signals |
| auth | 0.6 KB | auth sessions, JWT decode |
| analytics | 1.3 KB | consent-aware analytics |
| easings | 0.8 KB | named easing curves |

Full library (all families, minified): ~53 KB gzipped.

Popular single imports (tree-shaken from the root):

| Import | Gzip |
|---|---|
| `createSpring` | 0.8 KB |
| `createTween` | 1.2 KB |
| `createTicker` | 2.3 KB |

### Subpath imports

Each family is also available as a subpath, so you can organize imports
by feature. Thanks to `sideEffects: false`, importing from the root or
from a subpath produces the same bundle size; subpaths are purely for
code clarity.

```ts
import { createSpring } from "solid-drift";           // root
import { createTicker } from "solid-drift/web3";      // subpath: web3 group
import { createAgentTx } from "solid-drift/ai";       // subpath: ai group
```

Available subpaths: `core`, `scroll`, `pointer`, `gesture`, `cartoon`,
`typography`, `motion-graphics`, `ai`, `web3`, `fun`, `utilities`,
`offline`, `social`, `network`, `browser`, `auth`, `analytics`,
`easings`.

## Support the project

solid-drift is free and MIT-licensed, maintained by Austin Nguyen. If it saves you time, you can support its continued development.

Sponsorship is a thank-you: it does not include support, consulting, or feature requests.

<!-- Uncomment after the GitHub Sponsors profile is approved.
If solid-drift saves you time, consider [becoming a sponsor](https://github.com/sponsors/austinpnguyen): every contribution funds maintenance and new primitives.
-->

## Local playground

The repo ships an interactive playground with a live demo for every
primitive family. It runs against the current library source, so what you
see is always what the code does.

```bash
cd playground
npm install
npm run dev
```

## Recipes

Real-world patterns combining multiple primitives: animated price
tickers, staggered scroll entrances, spring toasts, draggable cards,
AI typing sequences, and eased scroll progress. See
[docs/recipes.md](docs/recipes.md).

## License

MIT © Austin Nguyen
