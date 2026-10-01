# solid-drift SolidStart starter

A minimal SolidStart + Tailwind CSS v4 starter with solid-drift
pre-wired. Three sample pages show the patterns you will copy most:

- `/` — landing page: spring hero entrance, staggered scroll reveals
- `/dashboard` — animated counters, live ticker digits, stat cards
- `/chat` — AI chat: token streaming, agent state, approval gate

## Create a project

```bash
npx degit austinpnguyen/solid-drift/templates/solidstart-starter my-app
cd my-app
npm install
npm run dev
```

## Notes

- solid-drift primitives are SSR-safe: the pages above hydrate without
  flicker because every primitive guards against missing browser APIs.
- The chat page streams from a fake generator. Replace `fakeStream`
  with a real `fetch` to your AI endpoint and push chunks into
  `createTokenStream` the same way.
- Import from `solid-drift` directly; tree-shaking keeps each page lean.
  See the `solid-drift` README "Bundle size" section for per-family costs.
