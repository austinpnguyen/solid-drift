import { createSignal, Show } from "solid-js";
import { decodeJwtPayload } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* Decode the claims inside a JWT on the client. This only reads the
   payload; signature verification belongs on the server. */

const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImlhdCI6MTUxNjIzOTAyMn0." +
  "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

export function JwtDecodeDemo() {
  const [token, setToken] = createSignal(SAMPLE);

  const decoded = (): unknown => decodeJwtPayload(token().trim());
  const malformed = (): boolean =>
    token().trim().length > 0 && decoded() === undefined;

  const snippet = () =>
    `import { decodeJwtPayload } from "solid-drift";

const claims = decodeJwtPayload(token);
${
  malformed()
    ? '// undefined: the token is malformed'
    : `// ${JSON.stringify(decoded())}`
    }`;

  return (
    <DemoShell
      title="JWT decode"
      description="Read the claims out of a JWT payload without verifying its signature."
      snippet={snippet()}
    >
      <div class="stage-col">
        <label class="ctl">
          <span class="ctl-label">Token</span>
          <input
            type="text"
            value={token()}
            onInput={(e) => setToken(e.currentTarget.value)}
            placeholder="Paste a JWT"
            spellcheck={false}
          />
        </label>
        <div class="stage-row">
          <Button kind="ghost" onClick={() => setToken(SAMPLE)}>
            Restore sample
          </Button>
          <Button kind="ghost" onClick={() => setToken("")}>
            Clear
          </Button>
        </div>
        <Show when={!malformed()} fallback={
          <p>
            That token does not look like a JWT. Paste a token with three
            dot-separated parts, for example the sample above.
          </p>
        }>
          <pre>
            <code>{JSON.stringify(decoded(), null, 2)}</code>
          </pre>
        </Show>
      </div>
    </DemoShell>
  );
}
