import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { families, findDemo } from "./demos/registry";
import "./styles.css";

/* Every demo has a shareable URL: #/<family>/<demo> (for example
   #/core/createSpring). The hash is the source of truth for the
   selection, so reloading keeps the current demo and the browser
   back/forward buttons work. */

function hashFor(familyId: string, demoId: string) {
  return `#/${familyId}/${demoId}`;
}

function parseHash(): { family: string; demo: string } | null {
  if (typeof window === "undefined") return null;
  const m = /^#\/([A-Za-z0-9-]+)\/([A-Za-z0-9-]+)$/.exec(window.location.hash);
  if (!m) return null;
  return findDemo(m[1], m[2]) ? { family: m[1], demo: m[2] } : null;
}

const DEFAULT_SELECTION = { family: "core", demo: "createSpring" };

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
  const [selection, setSelection] = createSignal(
    typeof window !== "undefined"
      ? (parseHash() ?? DEFAULT_SELECTION)
      : DEFAULT_SELECTION,
  );

  // Resolve the selection against the registry; unknown families or
  // demos fall back to the first available demo.
  const current = createMemo(() => {
    const sel = selection();
    const found = findDemo(sel.family, sel.demo);
    if (found) return found;
    const family = families.find((f) => f.id === sel.family) ?? families[0];
    return { family, demo: family.demos[0] };
  });

  const pick = (familyId: string, demoId: string) => {
    if (!findDemo(familyId, demoId)) return;
    setSelection({ family: familyId, demo: demoId });
    setOpenFamily(familyId);
    if (typeof window !== "undefined") {
      const h = hashFor(familyId, demoId);
      if (window.location.hash !== h) window.location.hash = h;
    }
  };

  // Follow the hash when it changes (back/forward buttons, pasted links).
  // An unknown or empty hash points the URL back at the shown demo so
  // the address bar always holds a shareable link.
  if (typeof window !== "undefined") {
    const onHashChange = () => {
      const parsed = parseHash();
      if (parsed) {
        setSelection(parsed);
        setOpenFamily(parsed.family);
      } else {
        const { family, demo } = current();
        window.history.replaceState(null, "", hashFor(family.id, demo.id));
      }
    };
    window.addEventListener("hashchange", onHashChange);
    onCleanup(() => window.removeEventListener("hashchange", onHashChange));
  }

  // On first load without a hash, write the shown demo into the URL so
  // the address bar always shows a shareable link.
  onMount(() => {
    if (!parseHash()) {
      const { family, demo } = current();
      window.history.replaceState(null, "", hashFor(family.id, demo.id));
    }
  });

  // Keep the tab title in sync with the demo.
  createEffect(() => {
    if (typeof document !== "undefined") {
      document.title = `${current().demo.title} - solid-drift playground`;
    }
  });

  const DemoComponent = createMemo(() => current().demo.component);

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
                              current().family.id === fam.id &&
                              current().demo.id === demo.id
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
                                current().demo.id === demo.id
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
          <Dynamic component={DemoComponent()} />
        </main>
      </div>
    </div>
  );
}
