import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

type MaybeElement = () => Element | null | undefined;

export interface PressOptions {
  /** Fires whenever the pressed state changes. */
  onChange?: (pressed: boolean) => void;
}

export interface PressControls {
  /** True while the pointer (or keyboard) is pressing the element. */
  pressed: Accessor<boolean>;
}

export interface HoverOptions {
  /** Fires whenever the hovering state changes. */
  onChange?: (hovering: boolean) => void;
}

export interface HoverControls {
  /** True while the pointer is over the element (or it has focus). */
  hovering: Accessor<boolean>;
}

const falsy = () => false;

/**
 * Press gesture state. Tracks pointer down/up on the element (mouse,
 * touch, and pen via pointer events) plus Enter/Space key presses for
 * keyboard parity. There is no animation here: the host decides how to
 * respond, typically by driving `createVariants`.
 *
 * SSR-safe: always unpressed on the server.
 *
 * ```tsx
 * let btn!: HTMLButtonElement;
 * const press = createPress(() => btn);
 * <button
 *   ref={btn}
 *   style={{
 *     transform: press.pressed() ? "scale(0.96)" : "scale(1)",
 *     transition: "transform 120ms",
 *   }}
 * >
 *   Hold me
 * </button>
 * ```
 */
export function createPress(
  ref: MaybeElement,
  options: PressOptions = {},
): PressControls {
  const { onChange } = options;
  if (typeof window === "undefined") return { pressed: falsy };

  const [pressed, setPressed] = createSignal(false);

  const set = (value: boolean): void => {
    setPressed((prev) => {
      if (prev !== value) onChange?.(value);
      return value;
    });
  };

  createEffect(() => {
    const el = ref();
    if (!el) return;
    const down = (): void => set(true);
    const up = (): void => set(false);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter" || event.key === " ") {
        if (!event.repeat) set(true);
        if (event.key === " ") event.preventDefault?.();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === "Enter" || event.key === " ") set(false);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("keydown", onKeyDown as EventListener);
    el.addEventListener("keyup", onKeyUp as EventListener);
    onCleanup(() => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", up);
      el.removeEventListener("keydown", onKeyDown as EventListener);
      el.removeEventListener("keyup", onKeyUp as EventListener);
    });
  });

  return { pressed };
}

/**
 * Hover gesture state. Tracks pointer enter/leave plus focus/blur so
 * keyboard users get the same state. Like `createPress` this is state
 * only: pair it with `createVariants` (or plain styles) to animate.
 *
 * SSR-safe: never hovering on the server.
 *
 * ```tsx
 * let card!: HTMLDivElement;
 * const hover = createHover(() => card, {
 *   onChange: (h) => variants.go(h ? "hover" : "idle"),
 * });
 * ```
 */
export function createHover(
  ref: MaybeElement,
  options: HoverOptions = {},
): HoverControls {
  const { onChange } = options;
  if (typeof window === "undefined") return { hovering: falsy };

  const [hovering, setHovering] = createSignal(false);

  const set = (value: boolean): void => {
    setHovering((prev) => {
      if (prev !== value) onChange?.(value);
      return value;
    });
  };

  createEffect(() => {
    const el = ref();
    if (!el) return;
    const enter = (): void => set(true);
    const leave = (): void => set(false);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focus", enter);
    el.addEventListener("blur", leave);
    onCleanup(() => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focus", enter);
      el.removeEventListener("blur", leave);
    });
  });

  return { hovering };
}
