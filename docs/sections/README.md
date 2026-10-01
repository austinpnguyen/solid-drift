# Copy-paste sections

Complete, ready-to-use page sections built from solid-drift primitives.
Copy the code, adapt the copy and colors, ship it. Each section has a
live demo on the playground and a Tailwind version.

- [Hero](hero.md) - spring entrance, staggered headline
- [Scroll storytelling](scroll-story.md) - pinned narrative with progress
- [Pricing](pricing.md) - animated prices with billing toggle
- [Testimonial marquee](marquee.md) - infinite logo/testimonial ticker

## Design notes

All sections follow the same principles:

- **SSR-safe**: every primitive guards browser APIs, so SolidStart
  hydration never flickers.
- **Reduced motion**: springs and tweens jump to end state under
  `prefers-reduced-motion`; layout stays intact.
- **Transform and opacity only**: no layout-property animation, so
  everything stays on the compositor.
- **Mobile**: `touch-action` set where drags compete with scroll;
  `dvh` units where iOS Safari toolbars matter.
