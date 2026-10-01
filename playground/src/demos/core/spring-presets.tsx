import { createSignal, createMemo } from "solid-js";
import { createSpring } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";

/* Spring presets: named configurations with live sliders. */

const PRESETS = [
  { name: "Gentle", stiffness: 120, damping: 20, hint: "Soft UI entrances" },
  { name: "Default", stiffness: 170, damping: 26, hint: "General purpose" },
  { name: "Snappy", stiffness: 300, damping: 28, hint: "Buttons, toggles" },
  { name: "Bouncy", stiffness: 200, damping: 12, hint: "Playful overshoot" },
  { name: "Stiff", stiffness: 500, damping: 35, hint: "Fast, precise" },
] as const;

const BOX = 56;

export function SpringPresetsDemo() {
  const [presetName, setPresetName] = createSignal("Default");
  const [stiffness, setStiffness] = createSignal(170);
  const [damping, setDamping] = createSignal(26);
  const [target, setTarget] = createSignal(0);

  const applyPreset = (name: string) => {
    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setPresetName(name);
    setStiffness(preset.stiffness);
    setDamping(preset.damping);
  };

  // Rebuild the spring when options change.
  const x = createMemo(() =>
    createSpring(target, {
      stiffness: stiffness(),
      damping: damping(),
    }),
  );

  const toggle = () => setTarget((t) => (t === 0 ? 1 : 0));

  const snippet = () =>
    `// Preset: ${presetName()}\n` +
    `const x = createSpring(target, {\n` +
    `  stiffness: ${stiffness()},\n` +
    `  damping: ${damping()},\n` +
    `})\n\n` +
    `<div style={{ transform: \`translateX(\${x() * 240}px)\` }} />`;

  return (
    <DemoShell
      title="Spring presets"
      description="Named spring configurations. Pick a preset or dial in stiffness and damping; the code updates live."
      snippet={snippet()}
      controls={
        <>
          <div style={{ display: "flex", gap: "0.5rem", "flex-wrap": "wrap" }}>
            {PRESETS.map((preset) => (
              <Button
                onClick={() => applyPreset(preset.name)}
                kind={presetName() === preset.name ? "primary" : "ghost"}
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <Slider
            label="stiffness"
            min={20}
            max={600}
            value={stiffness()}
            onChange={(v) => {
              setStiffness(v);
              setPresetName("Custom");
            }}
          />
          <Slider
            label="damping"
            min={5}
            max={50}
            value={damping()}
            onChange={(v) => {
              setDamping(v);
              setPresetName("Custom");
            }}
          />
          <Button onClick={toggle}>Toggle position</Button>
        </>
      }
    >
      <div
        style={{
          position: "relative",
          height: "120px",
          background: "var(--stage)",
          "border-radius": "12px",
          overflow: "hidden",
        }}
      >
        <div
          class="stage-box"
          style={{
            position: "absolute",
            top: "32px",
            left: "24px",
            width: `${BOX}px`,
            height: `${BOX}px`,
            transform: `translateX(${x()() * 240}px)`,
          }}
        />
      </div>
      <p style={{ "font-size": "0.85rem", color: "var(--muted)", "margin-top": "0.75rem" }}>
        {PRESETS.find((p) => p.name === presetName())?.hint ||
          "Custom settings. Tune the sliders."}
      </p>
    </DemoShell>
  );
}
