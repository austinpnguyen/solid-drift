import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import { createSplitText } from "./splittext.js";

describe("createSplitText", () => {
  let window: Window;

  beforeEach(() => {
    window = new Window();
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", window.document);
    vi.stubGlobal("NodeFilter", window.NodeFilter);
    vi.useFakeTimers();
    // Deterministic rAF: runs on the next fake-timer tick.
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      return setTimeout(() => cb(Date.now()), 0) as unknown as number;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      clearTimeout(id);
    });
    window.document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function flushRaf() {
    vi.advanceTimersByTime(1);
  }

  function mockLineTops(wordEls: HTMLElement[], tops: number[]) {
    wordEls.forEach((w, i) => {
      Object.defineProperty(w, "offsetTop", {
        value: tops[i] ?? 0,
        configurable: true,
      });
    });
  }

  it("splits chars and words, keeps nested markup intact", () => {
    document.body.innerHTML =
      '<h1 id="h">Hello <strong>brave</strong> world</h1>';
    const el = document.getElementById("h") as HTMLElement;

    const { chars, words } = createSplitText(() => el, {
      types: ["chars", "words"],
    });

    // 3 words, 15 chars (Hello=5, brave=5, world=5).
    expect(words).toHaveLength(3);
    expect(chars).toHaveLength(15);
    // Nested <strong> still wraps its words.
    const strong = el.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong!.querySelectorAll(".drift-word")).toHaveLength(1);
    expect(strong!.querySelectorAll(".drift-char")).toHaveLength(5);
    // Word text preserved.
    expect(words.map((w) => w.textContent)).toEqual([
      "Hello",
      "brave",
      "world",
    ]);
  });

  it("sets aria-label on root and aria-hidden on spans", () => {
    document.body.innerHTML = '<p id="p">Hi there</p>';
    const el = document.getElementById("p") as HTMLElement;

    createSplitText(() => el);

    expect(el.getAttribute("aria-label")).toBe("Hi there");
    for (const s of el.querySelectorAll(".drift-word, .drift-char")) {
      expect(s.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("revert restores the exact original HTML", () => {
    const html = 'Hello <strong>brave</strong> <em>new</em> world';
    document.body.innerHTML = `<h1 id="h">${html}</h1>`;
    const el = document.getElementById("h") as HTMLElement;
    const before = el.outerHTML;

    const { revert } = createSplitText(() => el, {
      types: ["chars", "words"],
    });
    expect(el.outerHTML).not.toBe(before);

    revert();
    expect(el.outerHTML).toBe(before);
    // Revert is idempotent.
    expect(() => revert()).not.toThrow();
    expect(el.outerHTML).toBe(before);
  });

  it("detects lines and re-splits on resize", () => {
    document.body.innerHTML = '<p id="p">one two three four</p>';
    const el = document.getElementById("p") as HTMLElement;

    const { words, lines } = createSplitText(() => el, {
      types: ["words", "lines"],
    });
    expect(words).toHaveLength(4);

    // Simulate two visual lines: words 0-1 on line 1, words 2-3 on line 2.
    mockLineTops(words, [0, 0, 24, 24]);
    flushRaf();
    expect(lines).toHaveLength(2);
    expect(lines[0].querySelectorAll(".drift-word")).toHaveLength(2);
    expect(lines[1].querySelectorAll(".drift-word")).toHaveLength(2);

    // Resize re-splits: now three lines.
    mockLineTops(words, [0, 24, 24, 48]);
    window.dispatchEvent(new window.Event("resize"));
    vi.advanceTimersByTime(200);
    expect(lines).toHaveLength(3);
  });

  it("honors the types option", () => {
    document.body.innerHTML = '<p id="p">just words here</p>';
    const el = document.getElementById("p") as HTMLElement;

    const r = createSplitText(() => el, { types: ["words"] });
    expect(r.words).toHaveLength(3);
    expect(r.chars).toHaveLength(0);
    expect(el.querySelectorAll(".drift-char")).toHaveLength(0);

    r.revert();
  });

  it("returns empty result for a null element", () => {
    const r = createSplitText(() => null);
    expect(r.chars).toEqual([]);
    expect(r.words).toEqual([]);
    expect(r.lines).toEqual([]);
    expect(() => r.revert()).not.toThrow();
  });
});
