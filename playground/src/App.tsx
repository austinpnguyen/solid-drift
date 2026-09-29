import { createMemo, createSignal, For, Show, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";
import { families } from "./demos/registry";
import "./styles.css";

function useMediaQuery(query: string) {
  const [matches, setMatches] = createSignal(
    typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  if (typeof window !== "undefined") {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    onCleanup(() => mq.removeEventListener("change", onChange));
  }
  return matches;
}

export default function App() {
  const isNarrow = useMediaQuery("(max-width: 860px)");
  const [openFamily, setOpenFamily] = createSignal<string | null>("core");
  const [selection, setSelection] = createSignal({
    family: "core",
    demo: "",
  });

  // Default to the first available demo once the registry is populated.
  const current = createMemo(() => {
    const sel = selection();
    const fam =
      families.find((f) => f.id === sel.family) ?? families[0];
    const demo =
      fam.demos.find((d) => d.id === sel.demo) ?? fam.demos[0];
    return { fam, demo };
  });

  const pick = (familyId: string, demoId: string) => {
    setSelection({ family: familyId, demo: demoId });
    setOpenFamily(familyId);
  };

  const DemoComponent = createMemo(() => current().demo?.component);

  return (
    <div class="app">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <h1>solid-drift playground</h1>
            <p>Interactive demos for the signal-native animation library</p>
          </div>
          <nav class="topbar-links">
            <a
              href="https://github.com/austinpnguyen/solid-drift"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/solid-drift"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src="https://img.shields.io/npm/v/solid-drift"
                alt="npm version"
                height="20"
              />
            </a>
            {/* Sponsor button spot: uncomment after GitHub Sponsors approval.
            <a
              class="sponsor-btn"
              href="https://github.com/sponsors/austinpnguyen"
              target="_blank"
              rel="noreferrer"
            >
              Sponsor
            </a>
            */}
          </nav>
        </div>
      </header>

      <div class="layout">
        <Show
          when={!isNarrow()}
          fallback={
            <div class="mobile-nav">
              <select
                aria-label="Choose a demo"
                onChange={(e) => {
                  const [f, d] = e.currentTarget.value.split("::");
                  pick(f, d);
                }}
              >
                <For each={families}>
                  {(fam) => (
                    <optgroup label={fam.name}>
                      <For each={fam.demos}>
                        {(demo) => (
                          <option
                            value={`${fam.id}::${demo.id}`}
                            selected={
                              current().fam.id === fam.id &&
                              current().demo?.id === demo.id
                            }
                          >
                            {demo.title}
                          </option>
                        )}
                      </For>
                    </optgroup>
                  )}
                </For>
              </select>
            </div>
          }
        >
          <aside class="sidebar">
            <For each={families}>
              {(fam) => (
                <div class="family">
                  <button
                    type="button"
                    class="family-head"
                    onClick={() =>
                      setOpenFamily(openFamily() === fam.id ? null : fam.id)
                    }
                    aria-expanded={openFamily() === fam.id}
                  >
                    <span>{fam.name}</span>
                    <span class="family-count">{fam.demos.length}</span>
                  </button>
                  <Show when={openFamily() === fam.id}>
                    <ul class="demo-list">
                      <For each={fam.demos}>
                        {(demo) => (
                          <li>
                            <button
                              type="button"
                              class={
                                current().demo?.id === demo.id
                                  ? "demo-link active"
                                  : "demo-link"
                              }
                              onClick={() => pick(fam.id, demo.id)}
                            >
                              {demo.title}
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              )}
            </For>
          </aside>
        </Show>

        <main class="main">
          {(() => {
            const Cmp = DemoComponent();
            return Cmp ? (
              <Dynamic component={Cmp} />
            ) : (
              <div class="empty">
                <h2>No demos yet</h2>
                <p>Demos are being added family by family.</p>
              </div>
            );
          })()}
        </main>
      </div>
    </div>
  );
}
