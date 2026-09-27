import { describe, expect, it, vi, afterEach } from "vitest";
import { createRoot } from "solid-js";
import { createCopy, type CopyControls } from "./copy.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const owned = (): { clipboard: CopyControls; dispose: () => void } => {
  let clipboard!: CopyControls;
  const dispose = createRoot((d) => {
    clipboard = createCopy({ resetDelay: 1000 });
    return d;
  });
  return { clipboard, dispose };
};

describe("createCopy", () => {
  it("copies through the async Clipboard API", async () => {
    vi.useFakeTimers();
    let written = "";
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          written = text;
        },
      },
    });
    const { clipboard, dispose } = owned();
    await clipboard.copy("hello");
    expect(written).toBe("hello");
    expect(clipboard.copied()).toBe(true);
    expect(clipboard.error()).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(clipboard.copied()).toBe(false);
    dispose();
  });

  it("falls back to execCommand when the Clipboard API is missing", async () => {
    let execCommandArg = "";
    const area = {
      value: "",
      setAttribute: vi.fn(),
      style: {} as Record<string, string>,
      select: vi.fn(),
    };
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: () => area,
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: (command: string) => {
        execCommandArg = command;
        return true;
      },
    });
    const { clipboard, dispose } = owned();
    await clipboard.copy("fallback text");
    expect(execCommandArg).toBe("copy");
    expect(area.value).toBe("fallback text");
    expect(area.select).toHaveBeenCalled();
    expect(clipboard.copied()).toBe(true);
    dispose();
  });

  it("reports an error when nothing can copy", async () => {
    vi.stubGlobal("navigator", {});
    const { clipboard, dispose } = owned();
    await expect(clipboard.copy("x")).rejects.toThrow("not supported");
    expect(clipboard.copied()).toBe(false);
    expect(clipboard.error()).not.toBeNull();
    dispose();
  });

  it("respects noFallback", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: () => ({}),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: () => true,
    });
    let clipboard!: CopyControls;
    const dispose = createRoot((d) => {
      clipboard = createCopy({ noFallback: true });
      return d;
    });
    await expect(clipboard.copy("x")).rejects.toThrow("not supported");
    dispose();
  });

  it("reset clears the copied flag", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: async () => {} },
    });
    const { clipboard, dispose } = owned();
    await clipboard.copy("x");
    expect(clipboard.copied()).toBe(true);
    clipboard.reset();
    expect(clipboard.copied()).toBe(false);
    dispose();
  });
});
