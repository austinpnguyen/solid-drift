import { createSignal, Show } from "solid-js";
import { createApprovalGate } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button, TextInput } from "../../framework/controls";

/* Human in the loop for agent flows: propose parks the flow in "pending",
   the host renders an approve/deny UI, and the agent resumes only after
   a decision. */

export function ApprovalGateDemo() {
  const [reasonText, setReasonText] = createSignal("");
  const gate = createApprovalGate();

  const propose = () =>
    gate.propose({
      title: "Deploy to production",
      description:
        "Push build 4f2a1c to the live site. Rolling back takes one click.",
      data: { build: "4f2a1c", environment: "production" },
    });

  const status = () => gate.status();
  const snippet = () => `const gate = createApprovalGate();

gate.propose({
  title: "Deploy to production",
  description: "Push build 4f2a1c to the live site.",
});

gate.approve();           // user clicked approve
gate.deny("Not yet");     // or denied with a reason

// status: "idle" | "pending" | "approved" | "denied"`;

  const colorFor = (s: string) =>
    s === "approved" ? "var(--success)" : s === "denied" ? "var(--error)" : "#b45309";

  return (
    <DemoShell
      title="Approval Gate"
      description="Human-in-the-loop approval for agent actions."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <div class="stage-row">
            <Button onClick={propose} kind="primary">
              Propose
            </Button>
            <Button onClick={() => gate.reset()} kind="ghost">
              Reset
            </Button>
          </div>
          <Show when={status() === "pending"}>
            <TextInput
              label="Deny reason (optional)"
              value={reasonText()}
              placeholder="Why is this denied?"
              onInput={setReasonText}
            />
            <div class="stage-row">
              <Button onClick={() => gate.approve()} kind="primary">
                Approve
              </Button>
              <Button
                onClick={() => gate.deny(reasonText() || undefined)}
                kind="ghost"
              >
                Deny
              </Button>
            </div>
          </Show>
        </div>
      }
    >
      <div class="stage-col">
        <div class="stage-panel">
          <span class="kbd">status</span>
          <p
            style={{
              "font-size": "1.5rem",
              "font-weight": "700",
              color: colorFor(status()),
              margin: "4px 0",
            }}
          >
            {status()}
          </p>
          <Show when={gate.request()}>
            {(req) => (
              <>
                <p style={{ "font-weight": "600", margin: "8px 0 2px" }}>
                  {req().title}
                </p>
                <p style={{ margin: 0, opacity: 0.75 }}>
                  {req().description}
                </p>
              </>
            )}
          </Show>
          <Show when={status() === "denied" && gate.reason()}>
            {(r) => (
              <p style={{ margin: "8px 0 0", opacity: 0.75 }}>
                Reason: {r()}
              </p>
            )}
          </Show>
        </div>
      </div>
    </DemoShell>
  );
}
