# solid-drift

[![npm version](https://img.shields.io/npm/v/solid-drift)](https://www.npmjs.com/package/solid-drift)
<!-- Sponsor badge: uncomment after the GitHub Sponsors profile is approved.
[![Sponsor](https://img.shields.io/badge/sponsor-austinpnguyen-ff69b4)](https://github.com/sponsors/austinpnguyen)
-->

Signal-native animation for SolidJS. Animate **values, not elements**: springs and tweens follow your signals, and retargeting mid-flight is seamless by design, with no restarts and no jumps.

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

## Sponsors

Thanks to everyone who keeps this project going.

<!-- sponsors:start -->
<!-- This list is refreshed automatically by .github/workflows/sponsors.yml. -->
<!-- sponsors:end -->

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

## License

MIT © Austin Nguyen
