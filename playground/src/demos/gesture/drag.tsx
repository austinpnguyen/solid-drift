import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createDrag, type DragAxis } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Toggle, Select } from "../../framework/controls";

/* A box dragged around a bounded area: axis lock, elastic edges, and a
   momentum glide on release. Constraints are measured from the area so
   the demo stays inside the bounds on narrow screens too. */

const BOX = 72;
const PAD = 12;

export function DragDemo() {
  const [axis, setAxis] = createSignal<DragAxis>("both");
  const [momentum, setMomentum] = createSignal(true);
  const [elastic, setElastic] = createSignal(0.35);

  let area!: HTMLDivElement;
  let box!: HTMLDivElement;
  const [areaSize, setAreaSize] = createSignal({ w: 316, h: 220 });

  onMount(() => {
    const measure = () =>
      setAreaSize({ w: area.clientWidth, h: area.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    onCleanup(() => ro.disconnect());
  });

  const right = () =>
    Math.max(0, Math.round(areaSize().w - BOX - PAD * 2));
  const bottom = () =>
    Math.max(0, Math.round(areaSize().h - BOX - PAD * 2));

  const [drag, setDrag] =
    createSignal<ReturnType<typeof createDrag> | null>(null);

  /* Option changes need a fresh control bound to the same box. */
  createEffect(() => {
    setDrag(
      createDrag(() => box, {
        axis: axis(),
        constraints: { left: 0, top: 0, right: right(), bottom: bottom() },
        elastic: elastic(),
        momentum: momentum(),
      }),
    );
  });

  const x = () => Math.round(drag()?.x() ?? 0);
  const y = () => Math.round(drag()?.y() ?? 0);
  const status = () => drag()?.status() ?? "idle";

  const snippet = `let box!: HTMLDivElement;
const { x, y, status } = createDrag(() => box, {
  axis: "${axis()}",
  constraints: { left: 0, top: 0, right: ${right()}, bottom: ${bottom()} },
  elastic: ${elastic().toFixed(2)},
  momentum: ${momentum()},
});

<div
  ref={box}
  style={{
    transform: \`translate(\${x()}px, \${y()}px)\`,
    "touch-action": "none",
    cursor: status() === "dragging" ? "grabbing" : "grab",
  }}
>
  Drag me
</div>`;

  return (
    <DemoShell
      title="Drag"
      description="Drag the box around the bounded area. It stretches elastically past the edges and glides with momentum on release. Touch drags work the same."
      snippet={snippet}
      controls={
        <>
          <Select
            label="Axis"
            options={["both", "x", "y"]}
            value={axis()}
            onChange={(v) => setAxis(v as DragAxis)}
          />
          <Toggle
            label="Momentum on release"
            checked={momentum()}
            onChange={setMomentum}
          />
          <Slider
            label="Elastic overshoot"
            min={0}
            max={1}
            step={0.05}
            value={elastic()}
            onChange={setElastic}
          />
        </>
      }
    >
      <div class="stage-col" style={{ width: "100%", gap: "12px" }}>
        <div
          ref={area}
          style={{
            position: "relative",
            width: "100%",
            "max-width": "360px",
            height: "220px",
            "border-radius": "12px",
            border: "1px dashed var(--line)",
            background: "var(--stage)",
            overflow: "hidden",
          }}
        >
          <div
            ref={box}
            class="stage-box"
            style={{
              position: "absolute",
              left: `${PAD}px`,
              top: `${PAD}px`,
              transform: `translate(${x()}px, ${y()}px)`,
              "touch-action": "none",
              cursor: status() === "dragging" ? "grabbing" : "grab",
              "user-select": "none",
            }}
          />
        </div>
        <div class="stage-row">
          <span class="kbd">x {x()}px</span>
          <span class="kbd">y {y()}px</span>
          <span class="kbd">status {status()}</span>
        </div>
      </div>
    </DemoShell>
  );
}
