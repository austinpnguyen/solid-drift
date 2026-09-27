/**
 * Internal text utilities shared by the motion-graphics primitives.
 *
 * Not part of the public API: family modules import from here, but
 * nothing in this file is re-exported from the package index.
 */

/** Document owning the element, with an SSR-safe fallback. */
export function ownerDoc(el: Element): Document | undefined {
  const od = (el as unknown as { ownerDocument?: Document | null })
    .ownerDocument;
  if (od) return od ?? undefined;
  return typeof document !== "undefined" ? document : undefined;
}

function pushUnit(
  doc: Document,
  parent: Element,
  content: string,
): HTMLElement {
  const s = doc.createElement("span") as HTMLElement;
  s.textContent = content;
  s.setAttribute("aria-hidden", "true");
  s.style.display = "inline-block";
  s.style.willChange = "transform, opacity, filter";
  parent.appendChild(s);
  return s;
}

function appendTokens(
  doc: Document,
  parent: Element,
  text: string,
  unit: "chars" | "words",
): HTMLElement[] {
  const spans: HTMLElement[] = [];
  if (unit === "words") {
    for (const word of text.split(/(\s+)/)) {
      if (word.length === 0) continue;
      if (/^\s+$/.test(word)) {
        parent.appendChild(doc.createTextNode(word));
      } else {
        spans.push(pushUnit(doc, parent, word));
      }
    }
  } else {
    for (const ch of text) spans.push(pushUnit(doc, parent, ch === " " ? " " : ch));
  }
  return spans;
}

/**
 * Split an element's text into per-unit inline-block spans so each
 * letter (or word) can be transformed independently. The original text
 * is preserved as an aria-label for screen readers. Any previous
 * content is replaced.
 */
export function splitUnits(
  el: Element,
  unit: "chars" | "words",
): HTMLElement[] {
  const doc = ownerDoc(el);
  if (!doc) return [];
  const text = el.textContent ?? "";
  el.textContent = "";
  el.setAttribute("aria-label", text);
  return appendTokens(doc, el, text, unit);
}

/**
 * Append per-unit inline-block spans for `text` to the element's
 * existing content, without clearing it. Used by streaming text, where
 * each flushed batch adds new units while earlier units keep playing.
 */
export function appendUnits(
  el: Element,
  text: string,
  unit: "chars" | "words",
): HTMLElement[] {
  const doc = ownerDoc(el);
  if (!doc) return [];
  return appendTokens(doc, el, text, unit);
}

/**
 * Deterministic pseudo-random generator (mulberry32). Used for
 * per-unit variance so seeded jitter renders identically on every
 * run, which keeps tests stable and output reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
