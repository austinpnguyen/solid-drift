import { createSignal, onMount } from "solid-js";
import { createSpring, createTween, createStagger } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";

/* Section demo: hero. A landing hero with spring entrance. */

export function HeroSectionDemo() {
  const [mounted, setMounted] = createSignal(false);
  onMount(() => {
    const t = setTimeout(() => setMounted(true), 300);
    return () => clearTimeout(t);
  });

  const rise = createSpring(() => (mounted() ? 0 : 36), {
    stiffness: 260,
    damping: 24,
  });
  const fade = createTween(() => (mounted() ? 1 : 0), { duration: 500 });
  const delays = createStagger(3, 110);

  const item = (index: number) => ({
    transform: `translateY(${rise()}px)`,
    opacity: fade(),
    "transition-delay": `${delays(index)}ms`,
  });

  const replay = () => {
    setMounted(false);
    setTimeout(() => setMounted(true), 100);
  };

  return (
    <DemoShell
      title="Hero section"
      description="Copy-paste landing hero. Springs drive the entrance; a stagger cascades the blocks. See docs/sections/hero.md for the full version with Tailwind."
      snippet={`const [mounted, setMounted] = createSignal(false)\nonMount(() => setMounted(true))\nconst rise = createSpring(() => (mounted() ? 0 : 36))\nconst fade = createTween(() => (mounted() ? 1 : 0), { duration: 500 })`}
      controls={
        <button class="demo-btn" onClick={replay}>
          Replay entrance
        </button>
      }
    >
      <div style={{ "text-align": "center", padding: "2rem 1rem" }}>
        <p style={item(0)}>
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
            ...item(1),
            "font-size": "2.5rem",
            "font-weight": 800,
            "letter-spacing": "-0.02em",
            margin: "1rem 0",
          }}
        >
          Motion that feels alive
        </h2>
        <p style={{ ...item(2), color: "#525252" }}>
          Signal-native animation for SolidJS.
        </p>
      </div>
    </DemoShell>
  );
}
