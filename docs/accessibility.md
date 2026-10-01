# Accessibility

solid-drift is built to be accessible by default. This guide covers what
the library does automatically, what you need to do in your components,
and how to test.

## What the library does

### Reduced motion

Every animation primitive respects `prefers-reduced-motion`:

- Springs jump to their target value instantly.
- Tweens complete immediately.
- Marquees render static (no scrolling).
- Typing effects reveal the full text at once.

You do not need to check the media query yourself. The behavior is
built into the shared clock: when reduced motion is preferred, time
advances in large steps that complete animations on the first frame.

```tsx
// This hero entrance appears instantly under reduced motion,
// fully laid out. No code changes needed.
const rise = createSpring(() => (mounted() ? 0 : 36));
```

### SSR safety

All primitives guard browser APIs (`window`, `document`,
`requestAnimationFrame`). They render their initial value on the
server and hydrate without flicker. See [SSR](ssr.md).

## What you do

### Live regions for dynamic content

When animation conveys information (a price changing, a toast
appearing, streaming text), expose it to assistive technology with a
live region.

```tsx
// Price ticker: the visual rolls digits, the live region announces.
function PriceDisplay() {
  const [price, setPrice] = createSignal(48210.5);
  let el!: HTMLSpanElement;
  const ticker = createTicker(price, () => el, { decimals: 2 });

  return (
    <span ref={el} aria-live="polite" aria-atomic="true">
      ${ticker.display()}
    </span>
  );
}
```

For AI streaming text, use `aria-live="polite"` on the container so
screen readers announce updates without interrupting. For toasts, use
`role="status"`.

### Focus management

- **Bottom sheets and dialogs**: when the sheet opens, move focus to
  it. When it closes, return focus to the trigger. `createBottomSheet`
  does not manage focus for you; pair it with a focus trap.
- **Do not animate focus outlines away**. Keep `:focus-visible`
  styles visible during and after animations.

### Motion that means something

If an animation is the only indicator (a shake for invalid input, a
color flash for a price move), add a non-motion cue:

- Invalid input: shake the field *and* show an error message with
  `role="alert"`.
- Price move: flash green/red *and* include an arrow character or
  text label ("up", "down").

### Drag and swipe alternatives

Every drag, swipe, and bottom-sheet gesture needs a keyboard or button
equivalent:

- Bottom sheet: a visible close button, not just swipe-to-dismiss.
- Swipe actions: buttons that perform the same action.
- Drag to reorder: arrow-key controls or up/down buttons.

## Testing

1. Enable reduced motion in your OS settings and verify every demo
   appears instantly in its final state.
2. Test with a screen reader (VoiceOver, NVDA): dynamic content should
   announce via live regions, not stay silent.
3. Keyboard-only: every gesture must have a button or key equivalent.
4. Check focus visibility: tab through animated components and confirm
   the focus ring is never hidden by transforms.
