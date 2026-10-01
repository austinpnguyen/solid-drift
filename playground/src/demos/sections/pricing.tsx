import { createSignal } from "solid-js";
import { createCountUp, createSpring } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* Section demo: pricing. Toggle monthly/yearly, prices count up. */

const TIERS = [
  { name: "Starter", monthly: 0, yearly: 0 },
  { name: "Pro", monthly: 19, yearly: 15, popular: true },
  { name: "Enterprise", monthly: 99, yearly: 79 },
];

export function PricingSectionDemo() {
  const [yearly, setYearly] = createSignal(false);

  return (
    <DemoShell
      title="Pricing section"
      description="Monthly/yearly toggle with counting prices (createCountUp) and a spring emphasis on the popular tier."
      snippet={`const price = () => (yearly() ? tier.yearly : tier.monthly)\nconst display = createCountUp(price, { duration: 600 })`}
      controls={
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            onClick={() => setYearly(false)}
            kind={yearly() ? "ghost" : "primary"}
          >
            Monthly
          </Button>
          <Button
            onClick={() => setYearly(true)}
            kind={yearly() ? "primary" : "ghost"}
          >
            Yearly
          </Button>
        </div>
      }
    >
      <div
        class="pricing-grid"
        style={{
          display: "grid",
          gap: "1rem",
          padding: "1rem",
        }}
      >
        {TIERS.map((tier) => (
          <TierCard tier={tier} yearly={yearly()} />
        ))}
      </div>
    </DemoShell>
  );
}

function TierCard(props: { tier: (typeof TIERS)[number]; yearly: boolean }) {
  const price = () => (props.yearly ? props.tier.yearly : props.tier.monthly);
  const display = createCountUp(price, { duration: 600 });
  const scale = createSpring(() => (props.tier.popular ? 1.05 : 1), {
    stiffness: 300,
    damping: 22,
  });

  return (
    <div
      style={{
        border: props.tier.popular ? "2px solid #111" : "1px solid #e5e5e5",
        "border-radius": "1rem",
        padding: "1.25rem",
        transform: `scale(${scale()})`,
        background: "#fff",
        "text-align": "center",
      }}
    >
      <h3 style={{ "font-weight": 600 }}>{props.tier.name}</h3>
      <p
        style={{
          "font-size": "2rem",
          "font-weight": 800,
          margin: "0.5rem 0",
          "font-variant-numeric": "tabular-nums",
        }}
      >
        ${display()}
      </p>
      <p style={{ "font-size": "0.8rem", color: "#737373" }}>
        {props.yearly ? "per month, billed yearly" : "per month"}
      </p>
    </div>
  );
}
