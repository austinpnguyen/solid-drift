# Pricing section

Three tiers with a monthly/yearly toggle. Prices count up when the
toggle flips, and the popular tier gets a spring scale emphasis.

[Live demo](https://austinpnguyen.github.io/solid-drift/#/sections/pricing)

## Vanilla version

```tsx
import { createSignal } from "solid-js";
import { createCountUp, createSpring } from "solid-drift";

const TIERS = [
  { name: "Starter", monthly: 0, yearly: 0, features: ["3 projects", "Community support"] },
  { name: "Pro", monthly: 19, yearly: 15, features: ["Unlimited projects", "Priority support", "Advanced analytics"], popular: true },
  { name: "Enterprise", monthly: 99, yearly: 79, features: ["SSO", "Dedicated support", "SLA"] },
];

export function Pricing() {
  const [yearly, setYearly] = createSignal(false);

  return (
    <section style={{ "max-width": "72rem", margin: "0 auto", padding: "6rem 1.5rem" }}>
      <h2 style={{ "text-align": "center", "font-size": "2.5rem", "font-weight": 700 }}>
        Simple pricing
      </h2>

      <div style={{ display: "flex", "justify-content": "center", margin: "2rem 0" }}>
        <button
          onClick={() => setYearly(false)}
          style={{
            padding: "0.5rem 1.25rem",
            "border-radius": "0.5rem 0 0 0.5rem",
            background: !yearly() ? "#111" : "#f3f4f6",
            color: !yearly() ? "#fff" : "#111",
          }}
        >
          Monthly
        </button>
        <button
          onClick={() => setYearly(true)}
          style={{
            padding: "0.5rem 1.25rem",
            "border-radius": "0 0.5rem 0.5rem 0",
            background: yearly() ? "#111" : "#f3f4f6",
            color: yearly() ? "#fff" : "#111",
          }}
        >
          Yearly
        </button>
      </div>

      <div style={{ display: "grid", "grid-template-columns": "repeat(3, 1fr)", gap: "1.5rem" }}>
        {TIERS.map((tier) => (
          <TierCard tier={tier} yearly={yearly()} />
        ))}
      </div>
    </section>
  );
}

function TierCard(props: { tier: (typeof TIERS)[number]; yearly: boolean }) {
  const price = () => (props.yearly ? props.tier.yearly : props.tier.monthly);
  const display = createCountUp(price, { duration: 600 });
  const scale = createSpring(() => (props.tier.popular ? 1.04 : 1), {
    stiffness: 300,
    damping: 22,
  });

  return (
    <div
      style={{
        border: props.tier.popular ? "2px solid #111" : "1px solid #e5e5e5",
        "border-radius": "1rem",
        padding: "2rem",
        transform: `scale(${scale()})`,
        background: "#fff",
      }}
    >
      <h3 style={{ "font-size": "1.25rem", "font-weight": 600 }}>{props.tier.name}</h3>
      <p style={{ "font-size": "2.5rem", "font-weight": 800, margin: "1rem 0" }}>
        ${display()}
        <span style={{ "font-size": "1rem", "font-weight": 400, color: "#737373" }}>
          /mo
        </span>
      </p>
      <ul style={{ "list-style": "none", padding: 0 }}>
        {props.tier.features.map((f) => (
          <li style={{ padding: "0.5rem 0", color: "#525252" }}>✓ {f}</li>
        ))}
      </ul>
      <button
        style={{
          width: "100%",
          marginTop: "1.5rem",
          padding: "0.75rem",
          "border-radius": "0.75rem",
          background: props.tier.popular ? "#111" : "#f3f4f6",
          color: props.tier.popular ? "#fff" : "#111",
          "font-weight": 600,
        }}
      >
        Choose {props.tier.name}
      </button>
    </div>
  );
}
```

## Tailwind version

```tsx
import { createSignal } from "solid-js";
import { createCountUp, createSpring } from "solid-drift";

const TIERS = [ /* same as above */ ];

export function Pricing() {
  const [yearly, setYearly] = createSignal(false);

  return (
    <section class="mx-auto max-w-6xl px-6 py-24">
      <h2 class="text-center text-4xl font-bold">Simple pricing</h2>

      <div class="my-8 flex justify-center">
        <button
          onClick={() => setYearly(false)}
          class={`rounded-l-lg px-5 py-2 ${!yearly() ? "bg-black text-white" : "bg-neutral-100"}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setYearly(true)}
          class={`rounded-r-lg px-5 py-2 ${yearly() ? "bg-black text-white" : "bg-neutral-100"}`}
        >
          Yearly
        </button>
      </div>

      <div class="grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <TierCard tier={tier} yearly={yearly()} />
        ))}
      </div>
    </section>
  );
}

function TierCard(props: { tier: (typeof TIERS)[number]; yearly: boolean }) {
  const price = () => (props.yearly ? props.tier.yearly : props.tier.monthly);
  const display = createCountUp(price, { duration: 600 });
  const scale = createSpring(() => (props.tier.popular ? 1.04 : 1), {
    stiffness: 300,
    damping: 22,
  });

  return (
    <div
      class={`rounded-2xl bg-white p-8 ${props.tier.popular ? "border-2 border-black" : "border border-neutral-200"}`}
      style={{ transform: `scale(${scale()})` }}
    >
      <h3 class="text-xl font-semibold">{props.tier.name}</h3>
      <p class="my-4 text-4xl font-extrabold tabular-nums">
        ${display()}
        <span class="text-base font-normal text-neutral-500">/mo</span>
      </p>
      <ul class="space-y-2">
        {props.tier.features.map((f) => (
          <li class="text-neutral-600">✓ {f}</li>
        ))}
      </ul>
      <button
        class={`mt-6 w-full rounded-xl py-3 font-semibold ${props.tier.popular ? "bg-black text-white" : "bg-neutral-100"}`}
      >
        Choose {props.tier.name}
      </button>
    </div>
  );
}
```

## Why it works

- `createCountUp` tweens the displayed number whenever the billing
  period flips; the easing makes the change feel deliberate.
- The popular tier's spring scale is a subtle emphasis that never
  fights layout (transform only).
- `tabular-nums` keeps the price from jittering as digits change width.
