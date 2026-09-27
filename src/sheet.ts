import {
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
} from "solid-js";
import { now, schedule } from "./engine.js";
import {
  createDrag,
  type DragEndInfo,
  type DragStatus,
} from "./gesture.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import type { SpringOptions } from "./spring.js";

type MaybeElement = () => Element | null | undefined;

export interface BottomSheetOptions {
  /**
   * Snap points as fractions of the sheet's own height. `1` is fully
   * open, `0.4` shows 40% of the sheet. Values are clamped to
   * [0, 1] and sorted ascending; an empty array falls back to [1].
   * Default `[0.5, 1]`.
   */
  snapPoints?: number[];
  /**
   * Index into `snapPoints` opened by `openSheet()` with no argument.
   * Default is the last point (fully open).
   */
  initialSnap?: number;
  /**
   * Dragging below the lowest snap dismisses the sheet on release.
   * Default true.
   */
  dismissible?: boolean;
  /** Spring physics for snap animations. Default `{ stiffness: 400, damping: 40 }`. */
  spring?: SpringOptions;
  /**
   * Element used to measure the sheet height. Defaults to the drag
   * ref. Pass the sheet root here when the drag ref is a handle, so
   * snap fractions apply to the sheet and not the handle.
   */
  measureRef?: MaybeElement;
  /** Called when the sheet opens or closes. */
  onOpenChange?: (open: boolean) => void;
}

export interface BottomSheetControls {
  /** Whether the sheet is open (not dismissed). */
  open: Accessor<boolean>;
  /** Index into `snapPoints`, or -1 when dismissed. */
  snapIndex: Accessor<number>;
  /**
   * Current translateY in pixels. Drive the sheet's transform with
   * this: `transform: translateY(${y()}px)`.
   */
  y: Accessor<number>;
  /** `idle`, `dragging` while the pointer is down, `settling` while snapping. */
  status: Accessor<DragStatus>;
  /** Open the sheet at a snap point (default the fullest). */
  openSheet: (index?: number) => void;
  /** Dismiss the sheet below the screen. */
  close: () => void;
  /** Snap to a point by index (opens the sheet if dismissed). */
  snapTo: (index: number) => void;
}

/**
 * A draggable bottom sheet built on `createDrag`.
 *
 * The sheet is a fixed, bottom-anchored panel the user drags by a
 * handle (or the sheet itself). On release it snaps to the nearest
 * snap point, projected forward by the release velocity like a
 * native sheet; a downward drag past the lowest point (or a fast
 * downward flick) dismisses it when `dismissible`.
 *
 * The drag gesture itself, pointer tracking, release velocity, and
 * reduced-motion behavior come from `createDrag`; this primitive
 * adds the snap-point semantics on top. While the pointer is down
 * the sheet tracks 1:1 with light rubber-banding past the top and
 * bottom edges; on release it springs to the chosen point.
 *
 * Bind the `ref` to the drag handle when the sheet body scrolls
 * (a handle keeps drag and scroll from fighting); bind it to the
 * sheet root for non-scrolling sheets. Either way the moving
 * element gets `transform: translateY(${y()}px)` and the drag
 * target gets `touch-action: none`. When the drag ref is a handle,
 * pass the sheet root as `options.measureRef` so snap fractions
 * are measured against the sheet.
 *
 * SSR-safe: starts dismissed with `y()` at 0 on the server.
 *
 * ```tsx
 * let sheet!: HTMLDivElement
 * let handle!: HTMLDivElement
 * const bs = createBottomSheet(() => handle, {
 *   snapPoints: [0.4, 1],
 *   measureRef: () => sheet,
 * })
 * <div
 *   ref={sheet}
 *   style={{
 *     position: "fixed", left: "0", right: "0", bottom: "0",
 *     transform: `translateY(${bs.y()}px)`,
 *   }}
 * >
 *   <div ref={handle} style={{ "touch-action": "none" }}>Handle</div>
 *   <div>Sheet content</div>
 * </div>
 * <button onClick={() => bs.openSheet()}>Open</button>
 * ```
 */
export function createBottomSheet(
  ref: MaybeElement,
  options: BottomSheetOptions = {},
): BottomSheetControls {
  const {
    snapPoints: snapPointsOption,
    initialSnap: initialSnapOption,
    dismissible = true,
    spring = {},
    measureRef,
    onOpenChange,
  } = options;

  // Snap points are visible height fractions, ascending. Values are
  // clamped to [0, 1] and sorted; an empty list falls back to [1]
  // (a single fully-open snap).
  const snapPoints = (snapPointsOption?.length ? [...snapPointsOption] : [1])
    .map((p) => Math.min(1, Math.max(0, p)))
    .sort((a, b) => a - b);
  const initialSnap = initialSnapOption ?? snapPoints.length - 1;

  const [open, setOpen] = createSignal(false);
  const [snapIndex, setSnapIndex] = createSignal(-1);
  const [y, setY] = createSignal(0);
  const [snapping, setSnapping] = createSignal(false);

  // Sheet height in px, measured lazily from the element.
  let height = 0;
  const measure = (): number => {
    const el = (measureRef ?? ref)();
    if (el && typeof (el as HTMLElement).offsetHeight === "number") {
      const h = (el as HTMLElement).offsetHeight;
      if (h > 0) height = h;
    }
    return height;
  };

  const snapY = (index: number): number =>
    height * (1 - snapPoints[index]);
  const closedY = (): number => height;

  // Snap animation: the same semi-implicit Euler spring the gesture
  // primitives use.
  let cancelSnap: (() => void) | null = null;
  const animateTo = (target: number): void => {
    cancelSnap?.();
    cancelSnap = null;
    if (prefersReducedMotion()) {
      setY(target);
      setSnapping(false);
      return;
    }
    const { stiffness = 400, damping = 40 } = spring;
    let current = untrack(y);
    let v = 0;
    let last = now();
    setSnapping(true);
    const task = (t: number): boolean => {
      const dt = Math.min(Math.max((t - last) / 1000, 0), 0.064);
      last = t;
      v += (-stiffness * (current - target) - damping * v) * dt;
      current += v * dt;
      setY(current);
      if (Math.abs(current - target) < 0.5 && Math.abs(v) < 20) {
        setY(target);
        setSnapping(false);
        cancelSnap = null;
        return false;
      }
      return true;
    };
    cancelSnap = schedule(task);
  };
  onCleanup(() => cancelSnap?.());

  const openAt = (index: number): void => {
    measure();
    const i = Math.max(0, Math.min(snapPoints.length - 1, index));
    if (!untrack(open)) {
      setOpen(true);
      onOpenChange?.(true);
    }
    setSnapIndex(i);
    animateTo(snapY(i));
  };

  const close = (): void => {
    measure();
    if (untrack(open)) {
      setOpen(false);
      onOpenChange?.(false);
    }
    setSnapIndex(-1);
    animateTo(closedY());
  };

  // The underlying gesture: pointer tracking and release velocity.
  // Its own y is only ever used as a per-grab delta source; the
  // sheet position lives in `y` above.
  let dragBase = 0;
  let sheetBase = 0;

  const settleFromRelease = (info: DragEndInfo): void => {
    measure();
    const releaseY = untrack(y);
    const projected = releaseY + info.velocityY * 0.18;
    const lowest = snapY(0);
    const dismissLine = (lowest + height) / 2;
    if (
      dismissible &&
      (projected >= dismissLine ||
        (info.velocityY > 700 && projected > lowest))
    ) {
      close();
      return;
    }
    let best = 0;
    let bestDist = Math.abs(snapY(0) - projected);
    for (let i = 1; i < snapPoints.length; i++) {
      const d = Math.abs(snapY(i) - projected);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    openAt(best);
  };

  const drag = createDrag(ref, {
    axis: "y",
    momentum: false, // the sheet chooses its own snap target
    onDragStart: () => {
      cancelSnap?.();
      cancelSnap = null;
      setSnapping(false);
      measure();
    },
    onDragEnd: settleFromRelease,
  });

  // 1:1 tracking while the pointer is down, with rubber-banding past
  // the fully-open top and the dismissed bottom. The grab bases are
  // captured on the transition into "dragging" inside this effect:
  // writes from event handlers flush effects synchronously, so the
  // effect runs during setStatus("dragging"), before onDragStart.
  // Capturing here keeps the bases correct under any scheduling.
  let prevDragStatus: DragStatus = "idle";
  createEffect(() => {
    const s = drag.status();
    if (s === "dragging" && prevDragStatus !== "dragging") {
      dragBase = drag.y();
      sheetBase = untrack(y);
    }
    prevDragStatus = s;
    if (s !== "dragging") return;
    const raw = sheetBase + (drag.y() - dragBase);
    const h = height;
    let next = raw;
    if (next < 0) next = next * 0.3;
    else if (next > h) next = h + (next - h) * 0.3;
    setY(next);
  });

  const status = (): DragStatus => {
    if (drag.status() === "dragging") return "dragging";
    return snapping() ? "settling" : "idle";
  };

  // Client-only: park the dismissed sheet below the screen once the
  // element (and its height) exists.
  if (typeof window !== "undefined") {
    createEffect(() => {
      const el = ref();
      const mel = (measureRef ?? ref)();
      if (!el || !mel) return;
      const h = measure();
      if (!untrack(open) && untrack(snapIndex) === -1) setY(h);
    });
  }

  return {
    open,
    snapIndex,
    y,
    status,
    openSheet: (index: number = initialSnap) => openAt(index),
    close,
    snapTo: openAt,
  };
}
