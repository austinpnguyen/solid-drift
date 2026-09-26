import { createEffect, type Accessor } from "solid-js";

type MaybeAccessor<T> = T | Accessor<T>;

export interface DriftProps {
  /** Horizontal offset in px. */
  x?: MaybeAccessor<number>;
  /** Vertical offset in px. */
  y?: MaybeAccessor<number>;
  /** Opacity 0–1. */
  opacity?: MaybeAccessor<number>;
  /** Uniform scale. */
  scale?: MaybeAccessor<number>;
  /** Horizontal scale. */
  scaleX?: MaybeAccessor<number>;
  /** Vertical scale. */
  scaleY?: MaybeAccessor<number>;
  /** Rotation in degrees. */
  rotate?: MaybeAccessor<number>;
}

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      drift: DriftProps | Accessor<DriftProps>;
    }
  }
}

function resolve<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

/**
 * Directive that binds animated values straight to an element's style.
 * Each prop can be a plain number or any signal. Combine with
 * `createSpring` / `createTween` for buttery motion:
 *
 * ```tsx
 * import { drift } from "solid-drift"
 *
 * const [open, setOpen] = createSignal(false)
 * const y = createSpring(() => (open() ? 0 : 24))
 * const opacity = createTween(() => (open() ? 1 : 0), { duration: 250 })
 *
 * <div use:drift={{ y, opacity }}>slides and fades</div>
 * ```
 *
 * Note: importing this module registers the `drift` directive type globally.
 */
export function drift(el: HTMLElement, props: Accessor<DriftProps>): void {
  createEffect(() => {
    const p = props();

    const parts: string[] = [];
    const x = p.x !== undefined ? resolve(p.x) : 0;
    const y = p.y !== undefined ? resolve(p.y) : 0;
    if (x !== 0 || y !== 0) parts.push(`translate3d(${x}px, ${y}px, 0)`);

    const rotate = p.rotate !== undefined ? resolve(p.rotate) : 0;
    if (rotate !== 0) parts.push(`rotate(${rotate}deg)`);

    const sx =
      p.scaleX !== undefined
        ? resolve(p.scaleX)
        : p.scale !== undefined
          ? resolve(p.scale)
          : 1;
    const sy =
      p.scaleY !== undefined
        ? resolve(p.scaleY)
        : p.scale !== undefined
          ? resolve(p.scale)
          : 1;
    if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);

    el.style.transform = parts.join(" ");

    if (p.opacity !== undefined) {
      el.style.opacity = String(resolve(p.opacity));
    }
  });
}
