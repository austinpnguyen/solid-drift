import { createSignal, onMount } from "solid-js";
import { createSplitText, createStagger, animate } from "solid-drift";
import { DemoShell } from "../../framework/DemoShell";
import { Button } from "../../framework/controls";

/* SplitText: SplitType-grade splitting into chars, words, and lines.
   Nested markup survives the split, and revert() restores the exact
   original HTML. Chars stagger in with a simple rise. */

const HEADLINE_HTML = `Drift <strong>splits</strong> headlines`;

export function SplitTextDemo() {
  let title!: HTMLHeadingElement;
  const [split, setSplit] = createSignal(false);
  const [lineCount, setLineCount] = createSignal(0);
  let controls: ReturnType<typeof createSplitText> | null = null;

  function doSplit() {
    controls?.revert();
    controls = createSplitText(() => title, {
      types: ["chars", "words", "lines"],
    });
    setLineCount(controls.lines.length);
    setSplit(true);
    // Stagger the chars in.
    const delays = createStagger(controls.chars.length, 22);
    controls.chars.forEach((ch, i) => {
      const el = ch as HTMLElement;
      el.style.opacity = "0";
      el.style.transform = "translateY(0.6em)";
      animate(0, 1, {
        duration: 450,
        delay: delays(i),
        easing: "easeOutExpo",
        onUpdate: (t) => {
          el.style.opacity = String(t);
          el.style.transform = `translateY(${(1 - t) * 0.6}em)`;
        },
        onComplete: () => {
          el.style.opacity = "";
          el.style.transform = "";
        },
      });
    });
  }

  function doRevert() {
    controls?.revert();
    controls = null;
    setSplit(false);
    setLineCount(0);
  }

  onMount(() => {
    // Defer one frame so layout exists for line detection.
    const id = requestAnimationFrame(() => doSplit());
    return () => cancelAnimationFrame(id);
  });

  const snippet = `import { createSplitText } from "solid-drift"

const { chars, words, lines, revert } =
  createSplitText(() => title, { types: ["chars", "words", "lines"] })

// nested markup like <strong> survives the split
revert() // restores the exact original HTML`;

  return (
    <DemoShell
      title="Split Text"
      description="Splits a headline into chars, words, and lines. Nested markup survives, and revert() restores the exact original HTML."
      snippet={snippet}
      controls={
        <>
          <Button onClick={doSplit} kind="primary">
            Split & animate
          </Button>
          <Button onClick={doRevert} kind="ghost">
            Revert
          </Button>
        </>
      }
    >
      <div class="stage-row">
        <h1
          ref={title}
          style={{ "font-size": "2rem", "line-height": 1.3, margin: 0 }}
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={HEADLINE_HTML}
        />
      </div>
      <p style={{ "font-size": "0.85rem", color: "var(--muted)" }}>
        {split()
          ? `Split into chars/words${lineCount() ? ` and ${lineCount()} line(s)` : ""}. The <strong> keeps its styling.`
          : "Original HTML, untouched."}
      </p>
    </DemoShell>
  );
}
