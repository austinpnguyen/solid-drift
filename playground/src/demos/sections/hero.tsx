import { createSignal, onMount, createEffect, onCleanup } from "solid-js";
import { createSpring, createTween, createStagger } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* Section demo: hero. A landing hero with spring entrance. */

export function HeroSectionDemo() {
  const [mounted, setMounted] = createSignal(false);
  onMount(() => {
    const t = setTimeout(() => setMounted(true), 300);
    return () => clearTimeout(t);
  });

  const delays = createStagger(3, 110);

  // Each block gets its own spring/tween with a stagger delay.
  // The spring target is delayed via a per-item signal; the tween
  // uses its built-in delay option.
  const items = [0, 1, 2].map((index) => {
    const [delayed, setDelayed] = createSignal(false);
    createEffect(() => {
      if (mounted()) {
        const t = setTimeout(() => setDelayed(true), delays(index));
        onCleanup(() => clearTimeout(t));
      } else {
        setDelayed(false);
      }
    });
    const rise = createSpring(() => (delayed() ? 0 : 36), {
      stiffness: 260,
      damping: 24,
    });
    const fade = createTween(() => (delayed() ? 1 : 0), { duration: 500 });
    return {
      transform: `translateY(${rise()}px)`,
      opacity: fade(),
    };
  });

  let replayTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (replayTimer) clearTimeout(replayTimer);
  });

  const replay = () => {
    setMounted(false);
    if (replayTimer) clearTimeout(replayTimer);
    replayTimer = setTimeout(() => setMounted(true), 100);
  };

  return (
    <DemoShell
      title="Hero section"
      description="Copy-paste landing hero. Springs drive the entrance; a stagger cascades the blocks. See docs/sections/hero.md for the full version with Tailwind."
      snippet={`const [mounted, setMounted] = createSignal(false)\nonMount(() => setMounted(true))\nconst rise = createSpring(() => (mounted() ? 0 : 36))\nconst fade = createTween(() => (mounted() ? 1 : 0), { duration: 500 })`}
      controls={
        <Button onClick={replay}>
          Replay entrance
        </Button>
      }
    >
      <div style={{ "text-align": "center", padding: "2rem 1rem" }}>
        <p style={items[0]}>
          <span
            style={{
              display: "inline-block",
              padding: "0.25rem 1rem",
              "border-radius": "9999px",
              background: "#f3f4f6",
              "font-size": "0.875rem",
            }}
          >
            New: v0.44.0 is out
          </span>
        </p>
        <h2
          style={{
            ...items[1],
            "font-size": "2.5rem",
            "font-weight": 800,
            "letter-spacing": "-0.02em",
            margin: "1rem 0",
          }}
        >
          Motion that feels alive
        </h2>
        <p style={{ ...items[2], color: "#525252" }}>
          Signal-native animation for SolidJS.
        </p>
      </div>
    </DemoShell>
  );
}
