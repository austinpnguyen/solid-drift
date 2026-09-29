import { createSignal, type JSX, Show } from "solid-js";

/* Standard frame around every demo: title, one-line description, a live
   stage, an optional controls panel, and a code view that shows the real
   primitive call. The snippet string is generated from the demo's own
   control state, so it never lies about what is running. */

interface DemoShellProps {
  title: string;
  description: string;
  snippet: string;
  controls?: JSX.Element;
  children: JSX.Element;
}

export function DemoShell(props: DemoShellProps) {
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions, insecure context). The code is
      // still visible and selectable below.
    }
  };

  return (
    <section class="demo">
      <header class="demo-head">
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </header>
      <div class="demo-stage">{props.children}</div>
      <Show when={props.controls}>
        <div class="demo-controls">{props.controls}</div>
      </Show>
      <div class="demo-code">
        <div class="demo-code-bar">
          <span>Code</span>
          <button type="button" class="btn btn-ghost btn-sm" onClick={copy}>
            <Show when={copied()} fallback="Copy">
              Copied
            </Show>
          </button>
        </div>
        <pre>
          <code>{props.snippet}</code>
        </pre>
      </div>
    </section>
  );
}
