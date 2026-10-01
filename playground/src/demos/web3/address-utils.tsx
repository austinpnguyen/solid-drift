import { createSignal } from "solid-js";
import { shortenAddress, isAddress, formatUnits } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Slider, Button, TextInput } from "../../framework/controls";

/* Pure web3 helpers: address validation and shortening, plus wei-style
   integer formatting. Everything runs locally, no network involved. */

const VALID =
  "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
const INVALID = "0x71C7656EC7ab88b098defB751B74 (too short)";

export function AddressUtilsDemo() {
  const [address, setAddress] = createSignal(VALID);
  const [chars, setChars] = createSignal(4);
  const [amount, setAmount] = createSignal("1500000000000000000");

  const valid = () => isAddress(address());

  const formatted = () => {
    try {
      return formatUnits(amount(), 18);
    } catch {
      return "invalid integer";
    }
  };

  const snippet = () => `import { shortenAddress, isAddress, formatUnits } from "solid-drift";

isAddress("${address()}");        // ${valid()}
shortenAddress("${address()}", ${chars()}); // "${shortenAddress(address(), chars())}"
formatUnits("${amount()}", 18);    // "${formatted()}"`;

  return (
    <DemoShell
      title="Address Utils"
      description="Validate, shorten, and format EVM addresses and amounts."
      snippet={snippet()}
      controls={
        <div class="stage-col">
          <TextInput
            label="Address"
            value={address()}
            placeholder="0x..."
            onInput={setAddress}
          />
          <div class="stage-row">
            <Button onClick={() => setAddress(VALID)} kind="ghost">
              Valid preset
            </Button>
            <Button onClick={() => setAddress(INVALID)} kind="ghost">
              Invalid preset
            </Button>
          </div>
          <Slider
            label="Shorten chars"
            min={2}
            max={8}
            value={chars()}
            onChange={setChars}
          />
          <TextInput
            label="Amount (wei, integer)"
            value={amount()}
            placeholder="1500000000000000000"
            onInput={setAmount}
          />
        </div>
      }
    >
      <div class="stage-col">
        <div class="stage-panel">
          <div class="stage-row">
            <span class="kbd">isAddress</span>
            <b style={{ color: valid() ? "var(--success)" : "var(--error)" }}>
              {String(valid())}
            </b>
          </div>
          <div class="stage-row" style={{ "margin-top": "8px" }}>
            <span class="kbd">shortenAddress</span>
            <code>{shortenAddress(address(), chars())}</code>
          </div>
          <div class="stage-row" style={{ "margin-top": "8px" }}>
            <span class="kbd">formatUnits</span>
            <code>{formatted()}</code>
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
