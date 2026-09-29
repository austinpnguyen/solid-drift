import {
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createAnticipation } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";
import { animationsDisabled } from "../../framework/motion";

/* Anticipation: the box crouches backwards, holds for a beat, then fires
   forward. The dashed marker shows where the windup reaches. Travel is
   measured from the track so the box never runs off on narrow screens. */

const REST_X = 72;
const BOX = 64;

export function AnticipationDemo() {
  const reduced = animationsDisabled();

  const [windup, setWindup] = createSignal(24);
  const [pos, setPos] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);

  let track!: HTMLDivElement;
  let box!: HTMLDivElement;
  const [trackW, setTrackW] = createSignal(340);

  onMount(() => {
    const measure = () => setTrackW(track.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    onCleanup(() => ro.disconnect());
  });

  const travel = () => Math.max(80, Math.round(trackW() - REST_X - BOX - 16));

  let ctl: { stop(): void } | null = null;
  onCleanup(() => ctl?.stop());

  const play = () => {
    ctl?.stop();
    /* Reduced motion: skip the windup and the flight, land at the end. */
    if (reduced) {
      setPos(travel());
      return;
    }
    setPos(0);
    setPlaying(true);
    const c = createAnticipation(0, travel(), {
      windup: windup(),
      windupDuration: 160,
      holdDuration: 80,
      duration: 550,
      easing: "easeOutBack",
      onUpdate: setPos,
      onComplete: () => setPlaying(false),
    });
    ctl = c;
    void c.finished.then(() => {
      if (ctl === c) ctl = null;
    });
  };

  const reset = () => {
    ctl?.stop();
    ctl = null;
    setPlaying(false);
    setPos(0);
  };

  const snippet = `let box!: HTMLDivElement;
const [pos, setPos] = createSignal(0);

// crouch backwards, hold, then fire forward.
// returns AnimationControls: { stop, finished }
const ctl = createAnticipation(0, ${travel()}, {
  windup: ${windup()},        // crouch distance, opposite the travel
  windupDuration: 160,
  holdDuration: 80,
  duration: 550,
  easing: "easeOutBack",
  onUpdate: setPos,
});
await ctl.finished;

<div ref={box} style={{ transform: \`translateX(\${pos()}px)\` }} />`;

  return (
    <DemoShell
      title="Anticipation"
      description="The box winds up backwards, holds for a beat, then jumps forward. The dashed marker shows how far back the crouch reaches."
      snippet={snippet}
      controls={
        <>
          <Slider
            label="Windup (px)"
            min={0}
            max={60}
            value={windup()}
            onChange={setWindup}
          />
          <Button onClick={play} kind="primary">
            {playing() ? "Playing" : "Play"}
          </Button>
          <Button onClick={reset} kind="ghost">
            Reset
          </Button>
        </>
      }
    >
      <div class="stage-col" style={{ width: "100%", gap: "12px" }}>
        <div
          ref={track}
          style={{
            position: "relative",
            width: "100%",
            "max-width": "380px",
            height: "110px",
            "border-radius": "12px",
            background: "var(--stage)",
            overflow: "hidden",
          }}
        >
          <Show when={windup() > 0}>
            <div
              style={{
                position: "absolute",
                left: `${REST_X - windup()}px`,
                top: "12px",
                bottom: "12px",
                width: "0",
                "border-left": "2px dashed var(--muted)",
                opacity: "0.5",
              }}
            />
          </Show>
          <div
            style={{
              position: "absolute",
              left: `${REST_X}px`,
              top: "12px",
              bottom: "12px",
              width: "0",
              "border-left": "2px solid var(--line)",
            }}
          />
          <div
            ref={box}
            class="stage-box"
            style={{
              position: "absolute",
              left: `${REST_X}px`,
              top: "23px",
              width: `${BOX}px`,
              height: `${BOX}px`,
              transform: `translateX(${pos()}px)`,
              "will-change": "transform",
            }}
          />
        </div>
        <span class="kbd">x {Math.round(pos())}px</span>
      </div>
    </DemoShell>
  );
}
