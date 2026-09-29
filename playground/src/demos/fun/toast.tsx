import { createSignal, For, Show } from "solid-js";
import { createToast, type Toast, type ToastKind } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button } from "../../framework/controls";

/* Signal-native toast queue. The primitive owns timing and lifecycle:
   entering -> visible -> leaving -> removed. The demo owns the rendering
   and binds each toast's state to enter/exit motion. Click a toast to
   dismiss it early. */

const KIND_COLOR: Record<ToastKind, string> = {
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
};

const KIND_TITLE: Record<ToastKind, string> = {
  info: "Heads up",
  success: "Saved",
  warning: "Careful",
  error: "Failed",
};

const KINDS: ToastKind[] = ["info", "success", "warning", "error"];

function toastStyle(t: Toast) {
  const base: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    gap: "2px",
    padding: "10px 14px 10px 12px",
    "border-radius": "10px",
    "background-color": "var(--panel)",
    border: "1px solid var(--line)",
    "border-left": `4px solid ${KIND_COLOR[t.kind]}`,
    cursor: "pointer",
    "min-width": "0",
    transition: "opacity 200ms ease, transform 200ms ease",
  };
  if (t.state === "entering") {
    base.opacity = "0";
    base.transform = "translateY(10px)";
  } else if (t.state === "leaving") {
    base.opacity = "0";
    base.transform = "translateX(24px)";
  }
  return base;
}

export function ToastDemo() {
  const [duration, setDuration] = createSignal(4000);
  const { toasts, info, success, warning, error, dismiss, clear } =
    createToast();
  const push = { info, success, warning, error };

  const fire = (kind: ToastKind) => {
    push[kind](KIND_TITLE[kind], {
      description: "This toast auto-dismisses. Click it to dismiss early.",
      duration: duration(),
    });
  };

  const snippet = () => `import { createToast } from "solid-drift"

const { toasts, info, success, warning, error, dismiss, clear } =
  createToast()

success("Saved", { description: "Your changes are live." })
<For each={toasts()}>
  {(t) => (
    <div
      classList={{
        "toast-enter": t.state === "entering",
        "toast-leave": t.state === "leaving",
      }}
      onClick={() => dismiss(t.id)}
    >
      <strong>{t.title}</strong>
      {t.description && <p>{t.description}</p>}
    </div>
  )}
</For>`;

  return (
    <DemoShell
      title="Toast"
      description="A signal-native toast queue with a choreographed lifecycle. Fire one of each kind, click a toast to dismiss it early, or clear them all."
      snippet={snippet()}
      controls={
        <>
          <Slider
            label="Auto-dismiss (ms)"
            min={1000}
            max={8000}
            step={500}
            value={duration()}
            onChange={setDuration}
          />
          <Button onClick={clear} kind="ghost">
            Clear all
          </Button>
        </>
      }
    >
      <div
        style={{
          position: "relative",
          "min-height": "230px",
          "max-width": "100%",
        }}
      >
        <div class="stage-row" style={{ "padding-top": "8px" }}>
          <For each={KINDS}>
            {(kind) => (
              <Button onClick={() => fire(kind)}>
                {kind[0].toUpperCase() + kind.slice(1)}
              </Button>
            )}
          </For>
        </div>
        <div
          style={{
            position: "absolute",
            top: "64px",
            right: "0",
            display: "flex",
            "flex-direction": "column",
            gap: "8px",
            width: "min(290px, 100%)",
          }}
        >
          <For each={toasts()}>
            {(t) => (
              <div style={toastStyle(t)} onClick={() => dismiss(t.id)}>
                <strong style={{ "font-size": "14px" }}>
                  {t.title}
                </strong>
                <Show when={t.description}>
                  <span
                    style={{
                      "font-size": "12px",
                      color: "var(--muted)",
                    }}
                  >
                    {t.description}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </DemoShell>
  );
}
