import { createEffect, createSignal, type Accessor } from "solid-js";
import { createCountUp } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, TextInput, Button } from "../../framework/controls";

/* Animated number counter. Any numeric signal becomes a formatted string
   that glides to each new value on a tween, with prefix and decimals. */

export function CountUpDemo() {
  const [target, setTarget] = createSignal(1284.5);
  const [input, setInput] = createSignal("1284.5");
  const [decimals, setDecimals] = createSignal(2);
  const [prefix, setPrefix] = createSignal("$");

  const [display, setDisplay] = createSignal<Accessor<string>>(() => "");

  // Formatting options are captured at creation, so rebuild the primitive
  // when they change. The tween of the current value carries over cleanly.
  createEffect(() => {
    const d = createCountUp(target, {
      decimals: decimals(),
      duration: 1200,
      prefix: prefix(),
    });
    setDisplay(() => d);
  });

  const go = () => {
    const n = Number(input());
    setTarget(Number.isFinite(n) ? n : 0);
  };

  const snippet = () => `import { createSignal } from "solid-js"
import { createCountUp } from "solid-drift"

const [target, setTarget] = createSignal(0)
const display = createCountUp(target, {
  decimals: ${decimals()},
  duration: 1200,
  prefix: ${JSON.stringify(prefix())},
})
<div>{display()}</div>
<button onClick={() => setTarget(${Number.isFinite(Number(input())) ? Number(input()) : 0})}>
  Animate
</button>`;

  return (
    <DemoShell
      title="Count Up"
      description="A numeric signal becomes a formatted string that glides up or down to each new value on an expo tween."
      snippet={snippet()}
      controls={
        <>
          <TextInput
            label="Target number"
            value={input()}
            placeholder="1284.5"
            onInput={setInput}
          />
          <Slider
            label="Decimals"
            min={0}
            max={3}
            value={decimals()}
            onChange={setDecimals}
          />
          <TextInput label="Prefix" value={prefix()} onInput={setPrefix} />
          <Button onClick={go}>Animate</Button>
        </>
      }
    >
      <div class="stage-row">
        <div
          style={{
            "font-size": "44px",
            "font-weight": "700",
            "font-family": "var(--mono)",
            "font-variant-numeric": "tabular-nums",
          }}
        >
          {display()()}
        </div>
      </div>
    </DemoShell>
  );
}
