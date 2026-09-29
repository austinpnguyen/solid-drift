import { createSignal, Show } from "solid-js";
import { createSwipe } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* Swipe recognition on a card: flick it left or right and the gesture is
   classified with its direction, distance, and velocity. The card flies
   off in the swipe direction; Reset brings it back. */

export function SwipeDemo() {
  const [offset, setOffset] = createSignal(0);

  let card!: HTMLDivElement;
  const { lastSwipe, reset } = createSwipe(() => card, {
    axis: "x",
    onSwipeLeft: () => setOffset(-260),
    onSwipeRight: () => setOffset(260),
  });

  const doReset = () => {
    setOffset(0);
    reset();
  };

  const direction = () => lastSwipe()?.direction ?? "none";
  const distance = () => Math.round(lastSwipe()?.distance ?? 0);
  const velocity = () => (lastSwipe()?.velocity ?? 0).toFixed(2);

  const snippet = `let card!: HTMLDivElement;
const { lastSwipe, reset } = createSwipe(() => card, {
  axis: "x", // "y" or "both" also work
  onSwipeLeft: (details) => dismiss(details),
  onSwipeRight: (details) => keep(details),
});

// details: { direction, distance, velocity, duration, from, to }
lastSwipe()?.direction; // "left" | "right" | "up" | "down" | null

<div ref={card} style={{ "touch-action": "pan-y" }}>
  Swipe me
</div>`;

  return (
    <DemoShell
      title="Swipe"
      description="Flick the card left or right (a fast flick counts even if it is short). The gesture is classified with direction, distance, and velocity. Slow drags are not swipes."
      snippet={snippet}
      controls={
        <Button onClick={doReset} kind="ghost">
          Reset
        </Button>
      }
    >
      <div class="stage-col" style={{ gap: "16px" }}>
        <div
          ref={card}
          style={{
            width: "220px",
            height: "140px",
            "max-width": "100%",
            "border-radius": "16px",
            background: "linear-gradient(135deg, #10b981, #3b82f6)",
            "box-shadow": "0 12px 32px rgba(59, 130, 246, 0.3)",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            color: "white",
            "font-weight": "700",
            "font-size": "17px",
            "touch-action": "pan-y",
            "user-select": "none",
            cursor: "grab",
            transform: `translateX(${offset()}px)`,
            transition: "transform 320ms ease-out",
          }}
        >
          Swipe me
        </div>
        <div class="stage-row">
          <span class="kbd">direction {direction()}</span>
          <span class="kbd">distance {distance()}px</span>
          <span class="kbd">velocity {velocity()} px/ms</span>
        </div>
        <Show when={lastSwipe() === null}>
          <p
            style={{
              margin: "0",
              "font-size": "13px",
              color: "var(--muted)",
              "text-align": "center",
            }}
          >
            No swipe recognized yet. Flick the card sideways.
          </p>
        </Show>
      </div>
    </DemoShell>
  );
}
