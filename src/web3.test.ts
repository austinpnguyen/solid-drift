import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createTxLifecycle,
  createTicker,
  createMintReveal,
  createConnectButton,
  createAgentTx,
  type TxStatusInput,
} from "./web3.js";

afterEach(() => {
  vi.unstubAllGlobals();
  // Do NOT clear rafQueue or reset fakeTime here: the animation engine
  // remembers a pending rAF id across tests, and clearing the queue
  // would strand it so later animations never run.
});

// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test.
let fakeTime = 0;
const rafQueue: Array<(t: number) => void> = [];

function stubBrowser(opts: { reduced?: boolean } = {}) {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: (t: number) => void): number => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });
  const addEventListener = vi.fn(
    (type: string, fn: (event: unknown) => void) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn);
    },
  );
  vi.stubGlobal("window", {
    addEventListener,
    removeEventListener: vi.fn((type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    }),
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  return {
    frames(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
      }
    },
    async run(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    fire(type: string, event: unknown = {}) {
      listeners.get(type)?.forEach((fn) => fn(event));
    },
  };
}

/** Fake element with a style bag, children, and a tiny document. */
function fakeEl() {
  type FakeNode = {
    textContent: string;
    style: Record<string, string>;
    children: FakeNode[];
    setAttribute: () => void;
    appendChild: (c: FakeNode) => FakeNode;
    firstChild: FakeNode | null;
  };
  const makeNode = (): FakeNode => {
    const node: FakeNode = {
      textContent: "",
      style: {},
      children: [],
      setAttribute: () => {},
      appendChild: (c: FakeNode) => {
        node.children.push(c);
        return c;
      },
      get firstChild() {
        return node.children[0] ?? null;
      },
    };
    return node;
  };
  const children: FakeNode[] = [];
  let text = "";
  const el = {
    style: {} as Record<string, string>,
    get textContent(): string {
      return children.length
        ? children.map((c) => c.textContent).join("")
        : text;
    },
    set textContent(v: string | null) {
      children.length = 0;
      text = v ?? "";
    },
    appendChild: (c: FakeNode) => {
      children.push(c);
      return c;
    },
    children,
    getBoundingClientRect: () => ({
      left: 100,
      top: 100,
      width: 200,
      height: 100,
      right: 300,
      bottom: 200,
    }),
    ownerDocument: { createElement: () => makeNode() },
  };
  return el;
}

const asElement = (el: ReturnType<typeof fakeEl>) => el as unknown as Element;

describe("createTxLifecycle", () => {
  it("maps source status idle, pending, success to tx states", () => {
    stubBrowser();
    const [input, setInput] = createSignal<TxStatusInput>({ status: "idle" });
    let tx!: ReturnType<typeof createTxLifecycle>;
    const dispose = createRoot((d) => {
      tx = createTxLifecycle({ source: input });
      return d;
    });
    expect(tx.state()).toBe("idle");
    setInput({ status: "pending" });
    expect(tx.state()).toBe("pending");
    setInput({ status: "success" });
    expect(tx.state()).toBe("success");
    dispose();
  });

  it("promotes pending to confirming at the confirmation threshold", () => {
    stubBrowser();
    const [input, setInput] = createSignal<TxStatusInput>({ status: "idle" });
    let tx!: ReturnType<typeof createTxLifecycle>;
    const dispose = createRoot((d) => {
      tx = createTxLifecycle({ source: input, requiredConfirmations: 3 });
      return d;
    });
    setInput({ status: "pending", confirmations: 2 });
    expect(tx.state()).toBe("pending");
    setInput({ status: "pending", confirmations: 3 });
    expect(tx.state()).toBe("confirming");
    dispose();
  });

  it("manual signing followed by a source error ends failed", () => {
    stubBrowser();
    const [input, setInput] = createSignal<TxStatusInput>({ status: "idle" });
    let tx!: ReturnType<typeof createTxLifecycle>;
    const dispose = createRoot((d) => {
      tx = createTxLifecycle({ source: input });
      return d;
    });
    tx.set("signing");
    expect(tx.state()).toBe("signing");
    setInput({ status: "error" });
    expect(tx.state()).toBe("failed");
    dispose();
  });

  it("progress() rises monotonically across the lifecycle", () => {
    const b = stubBrowser();
    let tx!: ReturnType<typeof createTxLifecycle>;
    const dispose = createRoot((d) => {
      tx = createTxLifecycle();
      return d;
    });
    const settled: number[] = [];
    for (const s of ["signing", "pending", "confirming", "success"] as const) {
      tx.set(s);
      b.frames(150);
      settled.push(tx.progress());
    }
    expect(settled[0]).toBeCloseTo(0.25, 1);
    expect(settled[1]).toBeCloseTo(0.5, 1);
    expect(settled[2]).toBeCloseTo(0.75, 1);
    expect(settled[3]).toBeCloseTo(1, 1);
    expect(
      settled.every((v, i) => i === 0 || v > settled[i - 1]),
    ).toBe(true);
    dispose();
  });

  it("reduced motion: progress() jumps to the target immediately", () => {
    stubBrowser({ reduced: true });
    let tx!: ReturnType<typeof createTxLifecycle>;
    const dispose = createRoot((d) => {
      tx = createTxLifecycle();
      return d;
    });
    tx.set("signing");
    expect(tx.progress()).toBe(0.25);
    tx.set("success");
    expect(tx.progress()).toBe(1);
    dispose();
  });
});

describe("createAgentTx", () => {
  const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const PROPOSAL = {
    to: ADDR,
    value: "1000000000000000000",
    description: "Swap 1 ETH for USDC at the current rate.",
  };

  it("walks propose, approve, execute to confirmed", async () => {
    stubBrowser();
    let agent!: ReturnType<typeof createAgentTx>;
    const dispose = createRoot((d) => {
      agent = createAgentTx({ execute: async () => "0xhash" });
      return d;
    });
    expect(agent.state()).toBe("idle");
    agent.propose(PROPOSAL);
    expect(agent.state()).toBe("proposed");
    expect(agent.proposal()?.description).toBe(PROPOSAL.description);
    agent.approve();
    expect(agent.state()).toBe("approved");
    await agent.execute();
    expect(agent.state()).toBe("executing");
    expect(agent.tx.state()).toBe("pending");
    // The host reports the receipt landing.
    agent.tx.set("success");
    expect(agent.state()).toBe("confirmed");
    dispose();
  });

  it("a throwing execute ends failed", async () => {
    stubBrowser();
    let agent!: ReturnType<typeof createAgentTx>;
    const dispose = createRoot((d) => {
      agent = createAgentTx({
        execute: async () => {
          throw new Error("user denied");
        },
      });
      return d;
    });
    agent.propose(PROPOSAL);
    agent.approve();
    await agent.execute();
    expect(agent.state()).toBe("failed");
    expect(agent.tx.state()).toBe("failed");
    dispose();
  });

  it("reject() ends rejected and reset() returns to idle", () => {
    stubBrowser();
    let agent!: ReturnType<typeof createAgentTx>;
    const dispose = createRoot((d) => {
      agent = createAgentTx();
      return d;
    });
    agent.propose(PROPOSAL);
    agent.reject();
    expect(agent.state()).toBe("rejected");
    agent.reset();
    expect(agent.state()).toBe("idle");
    expect(agent.proposal()).toBeUndefined();
    dispose();
  });

  it("invalid transitions are no-ops", async () => {
    stubBrowser();
    let agent!: ReturnType<typeof createAgentTx>;
    const dispose = createRoot((d) => {
      agent = createAgentTx();
      return d;
    });
    // Nothing to approve or execute from idle.
    agent.approve();
    await agent.execute();
    expect(agent.state()).toBe("idle");
    agent.propose(PROPOSAL);
    // Cannot execute before approval, cannot re-propose mid-flow.
    await agent.execute();
    expect(agent.state()).toBe("proposed");
    agent.propose({ ...PROPOSAL, description: "sneaky" });
    expect(agent.proposal()?.description).toBe(PROPOSAL.description);
    dispose();
  });

  it("propose() validates the proposal", () => {
    stubBrowser();
    let agent!: ReturnType<typeof createAgentTx>;
    const dispose = createRoot((d) => {
      agent = createAgentTx();
      return d;
    });
    expect(() => agent.propose({ ...PROPOSAL, to: "nope" })).toThrow(
      "not a valid address",
    );
    expect(() => agent.propose({ ...PROPOSAL, description: "" })).toThrow(
      "needs a description",
    );
    expect(agent.state()).toBe("idle");
    dispose();
  });

  it("source drives executing to confirmed", async () => {
    stubBrowser();
    const [input, setInput] = createSignal<TxStatusInput>({ status: "idle" });
    let agent!: ReturnType<typeof createAgentTx>;
    const dispose = createRoot((d) => {
      agent = createAgentTx({
        source: input,
        execute: async () => "0xhash",
      });
      return d;
    });
    agent.propose(PROPOSAL);
    agent.approve();
    await agent.execute();
    expect(agent.state()).toBe("executing");
    setInput({ status: "success" });
    expect(agent.state()).toBe("confirmed");
    dispose();
  });

  it("onEnter reports transitions in order", async () => {
    stubBrowser();
    const seen: string[] = [];
    let agent!: ReturnType<typeof createAgentTx>;
    const dispose = createRoot((d) => {
      agent = createAgentTx({
        execute: async () => "0xhash",
        onEnter: (state, prev) => seen.push(`${prev}->${state}`),
      });
      return d;
    });
    agent.propose(PROPOSAL);
    agent.approve();
    await agent.execute();
    agent.tx.set("success");
    expect(seen).toEqual([
      "idle->proposed",
      "proposed->approved",
      "approved->executing",
      "executing->confirmed",
    ]);
    dispose();
  });

  it("progress() rises across the flow", async () => {
    const b = stubBrowser();
    let agent!: ReturnType<typeof createAgentTx>;
    const dispose = createRoot((d) => {
      agent = createAgentTx();
      return d;
    });
    const settled: number[] = [];
    agent.propose(PROPOSAL);
    b.frames(150);
    settled.push(agent.progress());
    agent.approve();
    b.frames(150);
    settled.push(agent.progress());
    await agent.execute();
    b.frames(150);
    settled.push(agent.progress());
    agent.tx.set("success");
    b.frames(150);
    settled.push(agent.progress());
    expect(settled[0]).toBeCloseTo(0.2, 1);
    expect(settled[1]).toBeCloseTo(0.35, 1);
    expect(settled[2]).toBeCloseTo(0.65, 1);
    expect(settled[3]).toBeCloseTo(1, 1);
    expect(
      settled.every((v, i) => i === 0 || v > settled[i - 1]),
    ).toBe(true);
    dispose();
  });
});

describe("createTicker", () => {
  it("formats with decimals and grouping per locale", () => {
    stubBrowser();
    const [price] = createSignal(1234.5);
    let ticker!: ReturnType<typeof createTicker>;
    const dispose = createRoot((d) => {
      ticker = createTicker(price, () => null, {
        decimals: 2,
        locale: "en-US",
      });
      return d;
    });
    expect(ticker.display()).toBe("1,234.50");
    dispose();
  });

  it("rolls digits up on a rising price", () => {
    const b = stubBrowser();
    const el = fakeEl();
    const [price, setPrice] = createSignal(10);
    let ticker!: ReturnType<typeof createTicker>;
    const dispose = createRoot((d) => {
      ticker = createTicker(price, () => asElement(el), { decimals: 2 });
      return d;
    });
    b.frames(5); // initial build of the digit strips
    setPrice(20);
    b.frames(6); // effect, scheduled render, then the roll
    expect(ticker.direction()).toBe("up");
    expect(ticker.display()).toBe("20.00");
    const transforms = el.children.map(
      (w) => w.firstChild?.style.transform ?? "",
    );
    // The changed digit's strip moves up: a negative translateY.
    expect(transforms.some((t) => /^translateY\(-/.test(t))).toBe(true);
    dispose();
  });

  it("flashes the down color, then reverts", () => {
    const b = stubBrowser();
    const el = fakeEl();
    const [price, setPrice] = createSignal(20);
    let ticker!: ReturnType<typeof createTicker>;
    const dispose = createRoot((d) => {
      ticker = createTicker(price, () => asElement(el), {
        decimals: 2,
        flashMs: 600,
      });
      return d;
    });
    b.frames(5);
    setPrice(5);
    b.frames(3);
    expect(ticker.direction()).toBe("down");
    expect(el.style.color).toBe("#dc2626");
    b.frames(60); // past the 600ms flash
    expect(el.style.color).toBe("");
    dispose();
  });

  it("batches rapid updates: only the latest value renders", () => {
    const b = stubBrowser();
    const el = fakeEl();
    const [price, setPrice] = createSignal(100);
    let ticker!: ReturnType<typeof createTicker>;
    const dispose = createRoot((d) => {
      ticker = createTicker(price, () => asElement(el), { decimals: 2 });
      return d;
    });
    b.frames(5);
    for (let i = 1; i <= 10; i++) setPrice(100 + i);
    b.frames(5);
    expect(ticker.display()).toBe("110.00");
    dispose();
  });

  it("SSR: display() formats with no DOM", () => {
    // No stubBrowser: no window at all.
    const [price] = createSignal(42.5);
    let ticker!: ReturnType<typeof createTicker>;
    const dispose = createRoot((d) => {
      ticker = createTicker(price, () => null, { decimals: 2 });
      return d;
    });
    expect(ticker.display()).toBe("42.50");
    expect(ticker.direction()).toBe("flat");
    dispose();
  });

  it("reduced motion: text swaps instantly, no transforms, no flash", () => {
    const b = stubBrowser({ reduced: true });
    const el = fakeEl();
    const [price, setPrice] = createSignal(10);
    let ticker!: ReturnType<typeof createTicker>;
    const dispose = createRoot((d) => {
      ticker = createTicker(price, () => asElement(el), { decimals: 2 });
      return d;
    });
    b.frames(5);
    expect(el.textContent).toBe("10.00");
    setPrice(20);
    b.frames(5);
    expect(el.textContent).toBe("20.00");
    expect(ticker.direction()).toBe("up");
    expect(el.style.color ?? "").toBe("");
    expect(el.children.length).toBe(0);
    dispose();
  });

  it("clips each digit strip to one line: wrapper height 1em with overflow hidden", () => {
    // Regression test: without the fixed one-line height, the wrapper
    // grows to fit the whole 0-9 strip and all ten digits show as a
    // column below the price.
    const b = stubBrowser();
    const el = fakeEl();
    const [price] = createSignal(48210.5);
    let ticker!: ReturnType<typeof createTicker>;
    const dispose = createRoot((d) => {
      ticker = createTicker(price, () => asElement(el), { decimals: 2 });
      return d;
    });
    b.frames(5); // initial build of the digit strips
    expect(ticker.display()).toBe("48,210.50");
    // "48,210.50" has 7 digits, each wrapped in a clipping container.
    const wrappers = el.children.filter((c) => c.firstChild !== null);
    expect(wrappers.length).toBe(7);
    for (const wrap of wrappers) {
      expect(wrap.style.height).toBe("1em");
      expect(wrap.style.overflow).toBe("hidden");
      const strip = wrap.firstChild!;
      // The strip holds exactly the 10 digit cells, each one line tall.
      expect(strip.children.length).toBe(10);
      for (const cell of strip.children) {
        expect(cell.style.height).toBe("1em");
      }
    }
    dispose();
  });
});

describe("createMintReveal", () => {
  it("plays anticipation, flip, revealed in order", async () => {
    const b = stubBrowser();
    const el = fakeEl();
    let reveal!: ReturnType<typeof createMintReveal>;
    const dispose = createRoot((d) => {
      reveal = createMintReveal(() => asElement(el), {
        shakeDuration: 60,
        flipDuration: 80,
      });
      return d;
    });
    const seq: string[] = [];
    const p = reveal.play();
    expect(reveal.status()).toBe("anticipating");
    for (let i = 0; i < 16; i++) {
      await b.run(1);
      seq.push(reveal.status());
    }
    await p;
    expect(seq).toContain("anticipating");
    expect(seq).toContain("flipping");
    expect(seq[seq.length - 1]).toBe("revealed");
    expect(reveal.status()).toBe("revealed");
    dispose();
  });

  it("calls onFlip at the flip midpoint", async () => {
    const b = stubBrowser();
    const el = fakeEl();
    let atFlip = "";
    let statusAtFlip = "";
    let calls = 0;
    let reveal!: ReturnType<typeof createMintReveal>;
    const dispose = createRoot((d) => {
      reveal = createMintReveal(() => asElement(el), {
        shakeDuration: 30,
        flipDuration: 120,
        onFlip: () => {
          calls++;
          atFlip = el.style.transform ?? "";
          statusAtFlip = reveal.status();
        },
      });
      return d;
    });
    // Run frames while the play promise is pending: awaiting play()
    // first would strand the fake rAF clock and hang the test.
    const p = reveal.play();
    await b.run(20);
    await p;
    expect(calls).toBe(1);
    // The swap callback fires mid-flip, while the card is turning.
    expect(statusAtFlip).toBe("flipping");
    expect(atFlip).toMatch(/^rotateY\(/);
    dispose();
  });

  it("squash: false sets no scale property", async () => {
    const b = stubBrowser();
    const el = fakeEl();
    const setProperty = vi.fn();
    (el.style as Record<string, unknown>).setProperty = setProperty;
    let reveal!: ReturnType<typeof createMintReveal>;
    const dispose = createRoot((d) => {
      reveal = createMintReveal(() => asElement(el), {
        shakeDuration: 30,
        flipDuration: 60,
        squash: false,
      });
      return d;
    });
    const p = reveal.play();
    await b.run(15);
    await p;
    expect(setProperty).not.toHaveBeenCalled();
    dispose();
  });

  it("reduced motion: reveals immediately", () => {
    stubBrowser({ reduced: true });
    const el = fakeEl();
    let flipped = false;
    let reveal!: ReturnType<typeof createMintReveal>;
    const dispose = createRoot((d) => {
      reveal = createMintReveal(() => asElement(el), {
        onFlip: () => {
          flipped = true;
        },
      });
      return d;
    });
    void reveal.play();
    expect(reveal.status()).toBe("revealed");
    expect(flipped).toBe(true);
    dispose();
  });

  it("reset() returns to idle", async () => {
    const b = stubBrowser();
    const el = fakeEl();
    let reveal!: ReturnType<typeof createMintReveal>;
    const dispose = createRoot((d) => {
      reveal = createMintReveal(() => asElement(el), {
        shakeDuration: 30,
        flipDuration: 60,
      });
      return d;
    });
    const p = reveal.play();
    await b.run(15);
    await p;
    expect(reveal.status()).toBe("revealed");
    reveal.reset();
    expect(reveal.status()).toBe("idle");
    dispose();
  });
});

describe("createConnectButton", () => {
  it("pulls toward the pointer on hover", () => {
    const b = stubBrowser();
    const el = fakeEl();
    let connect!: ReturnType<typeof createConnectButton>;
    const dispose = createRoot((d) => {
      connect = createConnectButton(() => asElement(el), { strength: 0.35 });
      return d;
    });
    // Pointer 40px right of the button center.
    b.fire("pointermove", { clientX: 240, clientY: 150 });
    b.frames(150);
    // Magnetic target x = 40 * 0.35 * (1 - 40/140) = 10.
    expect(el.style.transform ?? "").toContain("translate(10px");
    dispose();
  });

  it("copyTick() ticks then returns to idle", async () => {
    const b = stubBrowser();
    const el = fakeEl();
    let connect!: ReturnType<typeof createConnectButton>;
    const dispose = createRoot((d) => {
      connect = createConnectButton(() => asElement(el));
      return d;
    });
    connect.copyTick();
    expect(connect.status()).toBe("ticking");
    await b.run(45); // past the 280ms pop + 220ms fade
    expect(connect.status()).toBe("idle");
    // The check overlay was staged inside the button.
    expect(el.children.some((c) => c.textContent === "✓")).toBe(true);
    dispose();
  });

  it("chainPulse() pulses then returns to idle", async () => {
    const b = stubBrowser();
    const el = fakeEl();
    let connect!: ReturnType<typeof createConnectButton>;
    const dispose = createRoot((d) => {
      connect = createConnectButton(() => asElement(el));
      return d;
    });
    connect.chainPulse();
    expect(connect.status()).toBe("pulsing");
    await b.run(45); // past the 600ms pulse
    expect(connect.status()).toBe("idle");
    dispose();
  });

  it("reduced motion: hover sets no transform", () => {
    const b = stubBrowser({ reduced: true });
    const el = fakeEl();
    let connect!: ReturnType<typeof createConnectButton>;
    const dispose = createRoot((d) => {
      connect = createConnectButton(() => asElement(el));
      return d;
    });
    b.fire("pointermove", { clientX: 240, clientY: 150 });
    b.frames(50);
    expect(el.style.transform ?? "").toBe("");
    dispose();
  });
});
