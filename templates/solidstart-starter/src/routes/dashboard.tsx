import { createSignal, For, onMount } from "solid-js";
import { createCountUp, createSpring, createTicker } from "solid-drift";

const STATS = [
  { label: "Active users", value: 12840 },
  { label: "Revenue", value: 92410, prefix: "$" },
  { label: "Uptime", value: 99.98, suffix: "%", decimals: 2 },
];

function StatCard(props: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [started, setStarted] = createSignal(false);
  onMount(() => {
    const t = setTimeout(() => setStarted(true), 200);
    return () => clearTimeout(t);
  });

  const display = createCountUp(() => (started() ? props.value : 0), {
    duration: 1200,
    decimals: props.decimals ?? 0,
  });

  const scale = createSpring(() => (started() ? 1 : 0.94));

  return (
    <div
      class="rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
      style={{ transform: `scale(${scale()})` }}
    >
      <p class="text-sm text-neutral-500">{props.label}</p>
      <p class="mt-2 text-3xl font-bold tabular-nums">
        {props.prefix ?? ""}
        {display()}
        {props.suffix ?? ""}
      </p>
    </div>
  );
}

function LivePrice() {
  const [price, setPrice] = createSignal(42150.25);
  let el!: HTMLSpanElement;

  onMount(() => {
    const timer = setInterval(() => {
      setPrice((p) => p + (Math.random() - 0.5) * 120);
    }, 1500);
    return () => clearInterval(timer);
  });

  const ticker = createTicker(price, () => el, { decimals: 2 });

  return (
    <div class="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <p class="text-sm text-neutral-500">BTC / USD (live demo)</p>
      <p class="mt-2 text-3xl font-bold tabular-nums">
        <span
          ref={el}
          style={{
            color:
              ticker.direction() === "up"
                ? "#16a34a"
                : ticker.direction() === "down"
                  ? "#dc2626"
                  : "inherit",
          }}
        >
          ${ticker.display()}
        </span>
      </p>
      <p class="mt-1 text-xs text-neutral-400">
        createTicker animates each digit roll
      </p>
    </div>
  );
}

const ROWS = [
  { name: "Acme Corp", plan: "Pro", status: "Active" },
  { name: "Globex", plan: "Team", status: "Active" },
  { name: "Initech", plan: "Free", status: "Trial" },
  { name: "Umbrella", plan: "Enterprise", status: "Active" },
];

export default function Dashboard() {
  return (
    <main class="mx-auto max-w-5xl px-6 py-12">
      <h1 class="mb-8 text-3xl font-bold tracking-tight">Dashboard</h1>
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <For each={STATS}>
          {(s) => (
            <StatCard
              label={s.label}
              value={s.value}
              prefix={s.prefix}
              suffix={s.suffix}
              decimals={s.decimals}
            />
          )}
        </For>
        <LivePrice />
      </div>

      <h2 class="mb-4 mt-12 text-xl font-semibold">Customers</h2>
      <div class="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-black/10 bg-black/[0.02]">
            <tr>
              <th class="px-6 py-3 font-medium text-neutral-500">Name</th>
              <th class="px-6 py-3 font-medium text-neutral-500">Plan</th>
              <th class="px-6 py-3 font-medium text-neutral-500">Status</th>
            </tr>
          </thead>
          <tbody>
            <For each={ROWS}>
              {(r) => (
                <tr class="border-b border-black/5 last:border-0">
                  <td class="px-6 py-3 font-medium">{r.name}</td>
                  <td class="px-6 py-3 text-neutral-600">{r.plan}</td>
                  <td class="px-6 py-3">
                    <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      {r.status}
                    </span>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </main>
  );
}
