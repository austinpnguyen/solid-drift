import { createSignal } from "solid-js";
import { verifyWebhookSignature } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button, TextInput } from "../../framework/controls";

/* Webhook signature verification, fully local. The demo signs the payload
   with HMAC-SHA256 through SubtleCrypto, then the library verifies it.
   Tampering the payload makes verification fail. */

const PREFIX = "sha256=";

export function WebhookVerifyDemo() {
  const [payload, setPayload] = createSignal(
    '{"event":"order.created","id":"ord_123"}',
  );
  const [secret, setSecret] = createSignal("whsec_demo_secret");
  const [signature, setSignature] = createSignal("");
  const [result, setResult] = createSignal<boolean | null>(null);
  const [busy, setBusy] = createSignal(false);

  const signLocally = async (): Promise<string> => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload()),
    );
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return PREFIX + hex;
  };

  const sign = async () => {
    setBusy(true);
    try {
      setSignature(await signLocally());
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const ok = await verifyWebhookSignature({
        payload: payload(),
        signature: signature(),
        secret: secret(),
        algorithm: "SHA-256",
        encoding: "hex",
        prefix: PREFIX,
      });
      setResult(ok);
    } finally {
      setBusy(false);
    }
  };

  const tamper = () => {
    setPayload((p) =>
      p.length === 0
        ? p
        : p.slice(0, -1) + (p[p.length - 1] === "}" ? "]" : "}"),
    );
    setResult(null);
  };

  const snippet = () => `import { verifyWebhookSignature } from "solid-drift";

const ok = await verifyWebhookSignature({
  payload: ${JSON.stringify(payload())},
  signature: ${JSON.stringify(signature() || "<press Sign first>")},
  secret: "${secret()}",
  algorithm: "SHA-256",
  encoding: "hex",
  prefix: "${PREFIX}",
});
// ok -> ${result() === null ? "?" : String(result())}`;

  return (
    <DemoShell
      title="Webhook Verify"
      description="Sign a payload locally, then verify it with the library."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <TextInput
            label="Payload (JSON)"
            value={payload()}
            onInput={setPayload}
          />
          <TextInput
            label="Webhook secret"
            value={secret()}
            onInput={setSecret}
          />
          <div class="stage-row" style={{ "flex-wrap": "wrap" }}>
            <Button onClick={sign} kind="primary">
              {busy() ? "Working" : "Sign"}
            </Button>
            <Button onClick={verify} kind="ghost">
              Verify
            </Button>
            <Button onClick={tamper} kind="ghost">
              Tamper payload
            </Button>
          </div>
        </div>
      }
    >
      <div class="stage-col">
        <div class="stage-panel">
          <span class="kbd">signature</span>
          <code
            style={{
              display: "block",
              "word-break": "break-all",
              margin: "4px 0",
            }}
          >
            {signature() || "Press Sign to compute one"}
          </code>
          <div class="stage-row" style={{ "margin-top": "8px" }}>
            <span class="kbd">verified</span>
            {result() === null ? (
              <span style={{ opacity: 0.7 }}>Press Verify</span>
            ) : (
              <b style={{ color: result() ? "var(--success)" : "var(--error)" }}>
                {String(result())}
              </b>
            )}
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
