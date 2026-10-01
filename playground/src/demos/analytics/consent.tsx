import { Show } from "solid-js";
import { useConsent } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* A cookie banner wired to the consent primitive. The choice persists to
   localStorage under a demo-only key, so reloading keeps your answer. */

const STORAGE_KEY = "playground-consent-demo";

export function ConsentDemo() {
  const consent = useConsent({ storageKey: STORAGE_KEY });

  const snippet = `import { useConsent } from "solid-drift";

const consent = useConsent({ storageKey: "${STORAGE_KEY}" });

consent.consent(); // "unknown" | "granted" | "denied"
consent.grant();   // accept: flips to "granted"
consent.deny();    // decline: flips to "denied"
consent.reset();   // back to "unknown", clears storage`;

  return (
    <DemoShell
      title="Consent banner"
      description="A cookie consent banner: accept, decline, persist the choice, reset."
      snippet={snippet}
    >
      <div class="stage-col">
        <div class="stage-row">
          <span class="kbd">state: {consent.consent()}</span>
          <span class="kbd">tracking: {consent.granted() ? "on" : "off"}</span>
        </div>
        <Show when={consent.consent() === "unknown"}>
          <div class="stage-panel">
            <p>
              We use cookies to measure traffic. You can change your mind
              any time with the reset button below.
            </p>
            <div class="stage-row">
              <Button onClick={() => consent.grant()}>Accept</Button>
              <Button kind="ghost" onClick={() => consent.deny()}>
                Decline
              </Button>
            </div>
          </div>
        </Show>
        <Show when={consent.consent() !== "unknown"}>
          <p>
            {consent.granted()
              ? "Accepted. Analytics would load now."
              : "Declined. No tracking runs."}{" "}
            Reload the page: the choice sticks.
          </p>
        </Show>
        <div class="stage-row">
          <Button kind="ghost" onClick={() => consent.reset()}>
            Reset choice
          </Button>
        </div>
      </div>
    </DemoShell>
  );
}
