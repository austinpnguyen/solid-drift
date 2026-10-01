# SSR (SolidStart)

solid-drift is SSR-safe by design. Every primitive renders a sensible
initial value on the server and picks up animation on the client
without hydration mismatch or flicker.

## How it works

- No primitive touches `window`, `document`, or
  `requestAnimationFrame` during initial evaluation. Browser APIs are
  only accessed inside effects or event handlers that run on the
  client.
- Signal initial values are deterministic: `createSpring(target)`
  starts at the target's current value, so server and client render
  the same HTML.
- The shared animation clock starts on the client's first frame. If
  the target changed between SSR and hydration, the spring tweens
  from the SSR value instead of snapping.

## SolidStart usage

No special setup. Import and use primitives in your components:

```tsx
// routes/index.tsx
import { createSpring } from "solid-drift";

export default function Home() {
  const [open, setOpen] = createSignal(false);
  const height = createSpring(() => (open() ? 200 : 0));

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)}>Toggle</button>
      <div style={{ height: `${height()}px`, overflow: "hidden" }}>
        Content
      </div>
    </div>
  );
}
```

## Avoiding hydration flicker

Flicker happens when the server renders one state and the client
immediately renders another. Rules:

1. **Derive initial values from props or URL, not from effects.**
   If a component starts open, the signal should start `true`, not
   flip to `true` in `onMount`.

2. **Do not read layout in render.** Primitives like
   `createElementSize` measure in effects and update afterward; the
   first render uses a fallback. This is intentional and
   flicker-free.

3. **Stagger entrances with `onMount`, not with timers.**
   ```tsx
   const [mounted, setMounted] = createSignal(false);
   onMount(() => setMounted(true));
   const rise = createSpring(() => (mounted() ? 0 : 24));
   ```
   The server renders the pre-entrance state; the client animates in
   after hydration. No mismatch because the HTML matches until the
   effect runs.

## Content Security Policy

solid-drift sets styles via the DOM `style` property (through Solid's
`style` bindings), not via inline `style` attributes in HTML strings
or `eval`. It works under a strict CSP:

- No `unsafe-inline` needed for styles: Solid compiles `style={{...}}`
  to property assignments, not inline attributes.
- No `unsafe-eval`: no `new Function`, no `eval`, no dynamic code
  generation.
- If your CSP uses `style-src`, the compiled output does not inject
  `<style>` tags.

The playground and starter template include no CSP headers by
default; add them in your SolidStart config as needed.

## Streaming and suspense

Primitives work inside `<Suspense>` boundaries. If a component
suspends, its animations start when the boundary resolves on the
client. There is no global "animations ready" event to wait for.
