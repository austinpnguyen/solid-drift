import { onCleanup } from "solid-js";

export interface SplitTextOptions {
  /**
   * Which units to split into. Default `["chars", "words", "lines"]`.
   * Lines require layout measurement.
   */
  types?: ("chars" | "words" | "lines")[];
}

export interface SplitTextResult {
  chars: HTMLElement[];
  words: HTMLElement[];
  lines: HTMLElement[];
  /** Restore the element's original HTML exactly. */
  revert: () => void;
}

/**
 * Split an element's text into chars, words, and lines for
 * SplitType-grade kinetic typography.
 *
 * Unlike `createKineticType` (chars/words only, destroys markup),
 * this preserves nested markup: text nodes are split in place without
 * breaking child tags like `<strong>`.
 *
 * Accessibility: the root keeps `aria-label` with the full text while
 * split spans get `aria-hidden="true"`.
 *
 * Lines are detected by temporarily wrapping each word and measuring
 * layout; they re-split on resize (debounced). `revert()` restores the
 * exact original outerHTML, for cleanup/unmount and reduced-motion
 * toggles.
 *
 * SSR-safe: returns empty arrays and a no-op revert.
 *
 * ```ts
 * const { chars, revert } = createSplitText(() => headline);
 * // stagger chars with createStagger + animate
 * revert(); // restore original HTML
 * ```
 */
export function createSplitText(
  el: () => HTMLElement | null | undefined,
  opts: SplitTextOptions = {},
): SplitTextResult {
  const types = opts.types ?? ["chars", "words", "lines"];
  const wantChars = types.includes("chars");
  const wantWords = types.includes("words");
  const wantLines = types.includes("lines");

  const chars: HTMLElement[] = [];
  const words: HTMLElement[] = [];
  const lines: HTMLElement[] = [];

  const maybeEl = el();
  if (!maybeEl || typeof window === "undefined" || typeof document === "undefined") {
    return { chars, words, lines, revert: () => {} };
  }
  const element: HTMLElement = maybeEl;

  const originalHTML = element.innerHTML;
  const originalAria = element.getAttribute("aria-label");
  const fullText = element.textContent ?? "";
  let reverted = false;

  // Split text nodes in place, preserving nested elements.
  function splitTextNodes(
    root: HTMLElement,
    makeWord: (text: string) => HTMLElement,
    makeChar: ((ch: string, word: HTMLElement) => HTMLElement) | null,
  ): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent?.trim()) textNodes.push(node);
    }
    for (const textNode of textNodes) {
      const text = textNode.textContent ?? "";
      const frag = document.createDocumentFragment();
      // Split on whitespace, preserving it.
      const parts = text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else {
          const wordEl = makeWord(part);
          if (makeChar) {
            for (const ch of part) {
              wordEl.appendChild(makeChar(ch, wordEl));
            }
          } else {
            wordEl.textContent = part;
          }
          frag.appendChild(wordEl);
        }
      }
      textNode.parentNode?.replaceChild(frag, textNode);
    }
  }

  function makeWordEl(text: string): HTMLElement {
    const span = document.createElement("span");
    span.className = "drift-word";
    span.setAttribute("aria-hidden", "true");
    span.style.display = "inline-block";
    if (wantWords) words.push(span);
    void text;
    return span;
  }

  function makeCharEl(ch: string): HTMLElement {
    const span = document.createElement("span");
    span.className = "drift-char";
    span.setAttribute("aria-hidden", "true");
    span.style.display = "inline-block";
    span.textContent = ch === " " ? "\u00A0" : ch;
    if (wantChars) chars.push(span);
    return span;
  }

  // Do the split.
  if (wantChars) {
    splitTextNodes(element, makeWordEl, (ch) => makeCharEl(ch));
  } else if (wantWords) {
    splitTextNodes(
      element,
      (text) => {
        const w = makeWordEl(text);
        w.textContent = text;
        return w;
      },
      null,
    );
  }

  // Accessibility: root announces the full text.
  element.setAttribute("aria-label", fullText);

  // Line detection: wrap each word, measure, group by top.
  function detectLines(): void {
    // Clear old lines.
    lines.length = 0;
    element.querySelectorAll(".drift-line").forEach((l) => {
      const parent = l.parentNode;
      while (l.firstChild) parent?.insertBefore(l.firstChild, l);
      l.remove();
    });
    if (!wantLines) return;

    const wordEls = element.querySelectorAll(".drift-word");
    if (wordEls.length === 0) return;

    // Group words by their vertical position.
    const groups = new Map<number, HTMLElement[]>();
    wordEls.forEach((w) => {
      const top = (w as HTMLElement).offsetTop;
      // Round to handle sub-pixel differences.
      const key = Math.round(top);
      const g = groups.get(key) ?? [];
      g.push(w as HTMLElement);
      groups.set(key, g);
    });

    // Wrap each group in a line element, in document order.
    const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
    for (const key of sortedKeys) {
      const group = groups.get(key)!;
      const lineEl = document.createElement("span");
      lineEl.className = "drift-line";
      lineEl.setAttribute("aria-hidden", "true");
      lineEl.style.display = "block";
      const first = group[0];
      first.parentNode?.insertBefore(lineEl, first);
      for (const w of group) lineEl.appendChild(w);
      lines.push(lineEl);
    }
  }

  if (wantLines) {
    // Defer to next frame so layout is ready.
    requestAnimationFrame(() => {
      if (!reverted) detectLines();
    });
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  function onResize(): void {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (!reverted && wantLines) detectLines();
    }, 150);
  }
  if (wantLines) {
    window.addEventListener("resize", onResize);
  }

  function revert(): void {
    if (reverted) return;
    reverted = true;
    if (resizeTimer) clearTimeout(resizeTimer);
    window.removeEventListener("resize", onResize);
    element.innerHTML = originalHTML;
    if (originalAria === null) element.removeAttribute("aria-label");
    else element.setAttribute("aria-label", originalAria);
    chars.length = 0;
    words.length = 0;
    lines.length = 0;
  }

  onCleanup(revert);

  return { chars, words, lines, revert };
}
