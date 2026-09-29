import { createEffect, createSignal, For, Show } from "solid-js";
import { createRedPacket } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";

/* Red packet grab: tap the envelope, coins burst out with real physics,
   and the amount reveals, split randomly across the coins like a real
   red packet. Under reduced motion the amount just appears. */

export function RedPacketDemo() {
  const [amount, setAmount] = createSignal(88);
  const [coinCount, setCoinCount] = createSignal(12);
  const [packet, setPacket] =
    createSignal<ReturnType<typeof createRedPacket> | null>(null);

  // Options are captured at creation; rebuilding on change reseals the
  // packet with the new amount and coin count.
  createEffect(() => {
    setPacket(createRedPacket({ amount: amount(), coins: coinCount() }));
  });

  const snippet = () => `import { createRedPacket } from "solid-drift"

const packet = createRedPacket({
  amount: ${amount()},
  coins: ${coinCount()},
})
<button onClick={() => packet.open()}>
  {packet.status() === "sealed"
    ? "Tap to open"
    : \`$\${packet.revealed().toFixed(2)}\`}
</button>
<For each={packet.coins()}>
  {(coin) => (
    <div
      style={{
        transform: \`translate(\${coin.x}px, \${coin.y}px) rotate(\${coin.rotation}deg)\`,
        opacity: coin.opacity,
      }}
    />
  )}
</For>
<button onClick={() => packet.reset()}>Reset</button>`;

  return (
    <DemoShell
      title="Red Packet"
      description="Tap the envelope to open it: coins burst out with real physics, then the won amount reveals, split randomly across the coins."
      snippet={snippet()}
      controls={
        <>
          <Slider
            label="Amount ($)"
            min={8}
            max={888}
            step={4}
            value={amount()}
            onChange={setAmount}
          />
          <Slider
            label="Coins"
            min={4}
            max={24}
            value={coinCount()}
            onChange={setCoinCount}
          />
          <Button onClick={() => packet()?.reset()} kind="ghost">
            Reset
          </Button>
        </>
      }
    >
      <div
        style={{
          position: "relative",
          "min-height": "280px",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          overflow: "hidden",
        }}
      >
        <Show when={packet()?.status() === "sealed"}>
          <button
            type="button"
            onClick={() => packet()?.open()}
            style={{
              border: "3px solid #f5c542",
              "border-radius": "20px",
              background: "linear-gradient(160deg, #d43d2a, #a11f14)",
              color: "#fff8e7",
              padding: "28px 36px",
              "font-size": "18px",
              "font-weight": "700",
              cursor: "pointer",
              display: "flex",
              "flex-direction": "column",
              gap: "8px",
              "align-items": "center",
              "box-shadow": "0 12px 32px rgba(212, 61, 42, 0.4)",
            }}
          >
            <span style={{ "font-size": "44px" }}>🧧</span>
            Tap to open
          </button>
        </Show>
        <For each={packet()?.coins() ?? []}>
          {(coin) => (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: `${coin.size}px`,
                height: `${coin.size}px`,
                "border-radius": "50%",
                background:
                  "radial-gradient(circle at 35% 30%, #ffe9a3, #f5c542 60%, #c9932b)",
                border: "2px solid #a97b1f",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                "font-size": "11px",
                "font-weight": "700",
                color: "#7a5410",
                transform: `translate(calc(-50% + ${coin.x}px), calc(-50% + ${coin.y}px)) rotate(${coin.rotation}deg)`,
                opacity: coin.opacity,
                "pointer-events": "none",
              }}
            >
              {coin.amount.toFixed(0)}
            </div>
          )}
        </For>
        <Show when={packet()?.status() === "revealed"}>
          <div
            style={{
              "font-size": "30px",
              "font-weight": "800",
              color: "#d43d2a",
            }}
          >
            You won ${packet()?.revealed().toFixed(2)}
          </div>
        </Show>
      </div>
    </DemoShell>
  );
}
