import { onMount, onCleanup, createSignal } from "solid-js";
import { createSmoothScroll } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* SmoothScroll: buttery wheel smoothing with onScroll-driven parallax. */

export function SmoothScrollDemo() {
  let parallaxEl!: HTMLDivElement;
  const [enabled, setEnabled] = createSignal(false);
  let smooth: ReturnType<typeof createSmoothScroll> | null = null;

  const toggle = () => {
    if (enabled()) {
      smooth?.dispose();
      smooth = null;
      setEnabled(false);
    } else {
      smooth = createSmoothScroll({ lerp: 0.1 });
      smooth.onScroll(({ scroll }) => {
        if (parallaxEl) {
          parallaxEl.style.transform = `translateY(${scroll * 0.3}px)`;
        }
      });
      setEnabled(true);
    }
  };

  onCleanup(() => {
    smooth?.dispose();
    smooth = null;
  });

  const snippet = `const smooth = createSmoothScroll({ lerp: 0.1 })

// Drive parallax, progress bars, scrub primitives:
smooth.onScroll(({ scroll, velocity, progress }) => {
  parallaxEl.style.transform = \`translateY(\${scroll * 0.3}px)\`
})

await smooth.scrollTo("#features")
smooth.dispose()`;

  return (
    <DemoShell
      title="SmoothScroll"
      description="Lenis-grade wheel smoothing on the shared engine. Toggle it and scroll: the blue square parallaxes via onScroll."
      snippet={snippet}
      controls={
        <>
          <Button onClick={toggle} kind={enabled() ? "primary" : "ghost"}>
            {enabled() ? "Smooth: ON" : "Smooth: OFF"}
          </Button>
          <Button
            onClick={() => smooth?.scrollTo(0, { duration: 800 })}
            kind="ghost"
          >
            Scroll to top
          </Button>
        </>
      }
    >
      <div
        style={{
          position: "relative",
          height: "300px",
          background: "var(--stage)",
          "border-radius": "12px",
          overflow: "hidden",
        }}
      >
        <div
          ref={parallaxEl}
          style={{
            position: "absolute",
            top: "40px",
            left: "40px",
            width: "80px",
            height: "80px",
            "border-radius": "16px",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
          }}
        />
        <p
          style={{
            position: "absolute",
            bottom: "1rem",
            width: "100%",
            "text-align": "center",
            color: "var(--muted)",
            "font-size": "0.85rem",
            margin: 0,
          }}
        >
          {enabled()
            ? "Scroll the page: smoothing is ON"
            : "Turn smoothing ON, then scroll the page"}
        </p>
      </div>
      <p style={{ "font-size": "0.85rem", color: "var(--muted)" }}>
        Required CSS: <code>.drift-smooth {"{ scroll-behavior: auto !important; }"}</code> and{" "}
        <code>.drift-stopped {"{ overflow: clip; }"}</code>. Do not combine with CSS scroll-snap.
        Touch stays native.
      </p>
    </DemoShell>
  );
}
