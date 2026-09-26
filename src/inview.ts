import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";

export interface InViewOptions {
  /** Visibility ratio that counts as "in view". Default 0.15. */
  threshold?: number;
  /** Stop observing after the first intersection. Default true. */
  once?: boolean;
}

/**
 * A boolean signal reporting whether an element is visible in the viewport.
 *
 * Built on IntersectionObserver: cheap, off-main-thread, and exact. With
 * `once: true` (default) the signal latches on first visibility — ideal
 * for entrance animations. Set `once: false` for a live in/out signal.
 *
 * The observer is created when the ref resolves and disconnected on
 * cleanup. SSR-safe: returns a constant `false` accessor on the server.
 *
 * ```tsx
 * let card: HTMLDivElement | undefined;
 * const inView = createInView(() => card);
 * const opacity = createTween(() => (inView() ? 1 : 0), { duration: 400 });
 * <div ref={card} style={{ opacity: opacity() }}>…</div>
 * ```
 */
export function createInView(
  ref: () => Element | null | undefined,
  options: InViewOptions = {},
): Accessor<boolean> {
  const { threshold = 0.15, once = true } = options;

  // SSR (or browsers without IntersectionObserver): never "in view".
  if (
    typeof window === "undefined" ||
    typeof IntersectionObserver === "undefined"
  ) {
    return () => false;
  }

  const [inView, setInView] = createSignal(false);

  createEffect(() => {
    const el = ref();
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold },
    );
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  return inView;
}
