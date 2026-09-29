# solid-drift playground

Interactive demos for [solid-drift](https://github.com/austinpnguyen/solid-drift),
running directly against the library source (no build step in between).

## Run it

```bash
cd playground
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## How it works

`vite.config.ts` aliases `solid-drift` to `../src/index.ts`, so every demo
imports the live library source. Edit the library, the playground updates.

## Adding a demo

1. Write the component in `src/demos/<family>/<demo>.tsx` using `DemoShell`
   and the shared controls from `src/framework/`.
2. Add one entry to the right family in `src/demos/registry.ts`
   (id, title, description, component).

The code snippet shown under each demo is generated from the demo's own
control state, so it always matches what is actually running.
