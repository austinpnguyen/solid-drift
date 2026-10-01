import { createSignal, For, onMount } from "solid-js";
import {
  createInView,
  createSpring,
  createStagger,
  createTween,
} from "solid-drift";

const FEATURES = [
  {
    title: "Signal-native",
    body: "Animate values, not elements. Springs follow your signals and retarget mid-flight without restarting.",
  },
  {
    title: "Tiny bundles",
    body: "Tree-shaken per primitive. A spring costs about 0.8 KB gzipped; the full library is around 53 KB.",
  },
  {
    title: "SSR-safe",
    body: "Every primitive guards against missing browser APIs, so SolidStart hydration never flickers.",
  },
];

function Hero() {
  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));

  const y = createSpring(() => (mounted() ? 0 : 32));
  const opacity = createTween(() => (mounted() ? 1 : 0), { duration: 600 });

  return (
    <header class="mx-auto max-w-5xl px-6 pb-24 pt-24 text-center">
      <div
        style={{
          transform: `translateY(${y()}px)`,
          opacity: opacity(),
        }}
      >
        <p class="mb-4 inline-block rounded-full border border-black/10 bg-black/5 px-4 py-1 text-sm">
          Built with solid-drift
        </p>
        <h1 class="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Motion that feels
          <span class="bg-gradient-to-r from-sky-500 to-violet-500 bg-clip-text text-transparent">
            {" "}
            alive
          </span>
        </h1>
        <p class="mx-auto mt-6 max-w-xl text-lg text-neutral-600">
          Signal-native animation for SolidJS. Copy this page into your app
          and it just works.
        </p>
        <div class="mt-8 flex justify-center gap-4">
          <a
            href="/dashboard"
            class="rounded-xl bg-black px-6 py-3 font-medium text-white transition-transform hover:scale-105"
          >
            See the dashboard
          </a>
          <a
            href="/chat"
            class="rounded-xl border border-black/15 px-6 py-3 font-medium transition-transform hover:scale-105"
          >
            Try the AI chat
          </a>
        </div>
      </div>
    </header>
  );
}

function FeatureCard(props: { title: string; body: string; index: number }) {
  const [ref, setRef] = createSignal<HTMLElement | null>(null);
  const visible = createInView(ref, { threshold: 0.3 });
  const delays = createStagger(3, 90);

  const y = createSpring(() => (visible() ? 0 : 24));
  const opacity = createTween(() => (visible() ? 1 : 0), {
    duration: 400,
    delay: delays(props.index),
  });

  return (
    <div
      ref={setRef}
      class="rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
      style={{
        transform: `translateY(${y()}px)`,
        opacity: opacity(),
      }}
    >
      <h3 class="mb-2 text-lg font-semibold">{props.title}</h3>
      <p class="text-neutral-600">{props.body}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <main>
      <Hero />
      <section class="mx-auto max-w-5xl px-6 pb-24">
        <div class="grid gap-6 sm:grid-cols-3">
          <For each={FEATURES}>
            {(f, i) => (
              <FeatureCard title={f.title} body={f.body} index={i()} />
            )}
          </For>
        </div>
      </section>
    </main>
  );
}
