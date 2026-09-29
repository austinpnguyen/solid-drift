import { For, Show } from "solid-js";
import { createSlotMachine } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* Gacha slot machine: reels launch fast, decelerate with momentum, and
   stop left to right. Pass landing symbols to spin() to rig the outcome
   (a minted prize, for example) while the theater plays out the same. */

const SYMBOLS = ["7️⃣", "🍒", "⭐", "💎", "🔔"];

export function SlotMachineDemo() {
  const machine = createSlotMachine({
    symbols: SYMBOLS,
    reels: 3,
    duration: 1200,
    stagger: 450,
  });

  const spinning = () => machine.status() === "spinning";
  const done = () => machine.status() === "done";
  const jackpot = () => {
    const r = machine.result();
    return r.length === 3 && r[0] === r[1] && r[1] === r[2];
  };

  const snippet = () => `import { createSlotMachine } from "solid-drift"

const machine = createSlotMachine({
  symbols: ${JSON.stringify(SYMBOLS)},
  reels: 3,
  duration: 1200,
  stagger: 450,
})
<button onClick={() => machine.spin()}>Spin</button>
<div>{machine.values().join(" ")}</div>
<Show when={machine.status() === "done"}>
  <p>Result: {machine.result().join(" ")}</p>
</Show>`;

  return (
    <DemoShell
      title="Slot Machine"
      description="Three reels launch fast and decelerate left to right, landing on random symbols. Spin again for another draw."
      snippet={snippet()}
      controls={<Button onClick={() => machine.spin()} kind="primary">Spin</Button>}
    >
      <div class="stage-col">
        <div class="stage-row">
          <For each={machine.values()}>
            {(symbol) => (
              <div
                style={{
                  "font-size": "52px",
                  width: "84px",
                  height: "84px",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  "border-radius": "16px",
                  "background-color": "var(--panel)",
                  border: "1px solid var(--line)",
                }}
              >
                {symbol}
              </div>
            )}
          </For>
        </div>
        <div style={{ "min-height": "30px", "font-weight": "600" }}>
          <Show when={spinning()}>Spinning...</Show>
          <Show when={done()}>
            {jackpot() ? (
              <span>Jackpot! {machine.result().join(" ")}</span>
            ) : (
              <span>Result: {machine.result().join(" ")}</span>
            )}
          </Show>
        </div>
        <Button onClick={() => machine.reset()} kind="ghost">
          Reset
        </Button>
      </div>
    </DemoShell>
  );
}
