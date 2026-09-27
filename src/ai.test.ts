import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import {
  createStreamReveal,
  createAgentState,
  parseDriftSpec,
  createSpecPlayer,
  DriftSpecError,
  type DriftSpec,
  type AgentTxControls,
  type AgentTxProposal,
} from "./ai.js";

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
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: (t: number) => void): number => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("performance", { now: () => fakeTime });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });

  return {
    async run(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step;
        rafQueue.splice(0).forEach((cb) => cb(fakeTime));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}

/** Minimal fake DOM element: just enough for the text splitter. */
function fakeElement(initialText = "") {
  type FakeSpan = {
    textContent: string;
    style: Record<string, string>;
    setAttribute: () => void;
  };
  const spans: FakeSpan[] = [];
  const children: Array<{ textContent: string }> = [];
  let text = initialText;
  const el = {
    get textContent(): string | null {
      return children.length
        ? children.map((c) => c.textContent).join("")
        : text;
    },
    set textContent(v: string | null) {
      children.length = 0;
      spans.length = 0;
      text = v ?? "";
    },
    spans,
    setAttribute: () => {},
    removeAttribute: () => {},
    appendChild: (c: { textContent: string }) => {
      children.push(c);
      return c;
    },
    ownerDocument: {
      createElement: () => {
        const s: FakeSpan = {
          textContent: "",
          style: {},
          setAttribute: () => {},
        };
        spans.push(s);
        return s;
      },
      createTextNode: (t: string) => ({ textContent: t }),
    },
  };
  return el;
}

const asElement = (el: ReturnType<typeof fakeElement>) =>
  el as unknown as Element;

describe("createStreamReveal", () => {
  it("batches pushes on the batch cadence and reveals units in order", async () => {
    const b = stubBrowser();
    const el = fakeElement();
    let stream!: ReturnType<typeof createStreamReveal>;
    const dispose = createRoot((d) => {
      stream = createStreamReveal(() => asElement(el), {
        batchMs: 100,
        maxBatch: 100,
        duration: 450,
        stagger: 20,
      });
      return d;
    });
    stream.push("ab");
    stream.push("cd");
    expect(stream.pending()).toBe(4);
    expect(stream.status()).toBe("streaming");
    expect(el.spans.length).toBe(0);
    await b.run(8); // past the 100ms batch cadence
    expect(el.spans.length).toBe(4);
    expect(stream.pending()).toBe(0);
    expect(el.spans.map((s) => s.textContent).join("")).toBe("abcd");
    // Staggered entrances: the first unit is further along than the last.
    expect(el.spans[0].style.transform).not.toBe(
      el.spans[3].style.transform,
    );
    stream.complete();
    await b.run(40);
    expect(stream.status()).toBe("done");
    dispose();
  });

  it("flushes early when the queue exceeds maxBatch", async () => {
    const b = stubBrowser();
    const el = fakeElement();
    let stream!: ReturnType<typeof createStreamReveal>;
    const dispose = createRoot((d) => {
      stream = createStreamReveal(() => asElement(el), {
        batchMs: 10000,
        maxBatch: 4,
      });
      return d;
    });
    stream.push("abcdef");
    await b.run(1);
    expect(el.spans.length).toBe(6);
    expect(stream.pending()).toBe(0);
    dispose();
  });

  it("complete() with an empty queue settles to done immediately", () => {
    stubBrowser();
    const el = fakeElement();
    let stream!: ReturnType<typeof createStreamReveal>;
    const dispose = createRoot((d) => {
      stream = createStreamReveal(() => asElement(el));
      return d;
    });
    stream.complete();
    expect(stream.status()).toBe("done");
    dispose();
  });

  it("reduced motion: full text after one push, no transforms set", () => {
    stubBrowser({ reduced: true });
    const el = fakeElement();
    let stream!: ReturnType<typeof createStreamReveal>;
    const dispose = createRoot((d) => {
      stream = createStreamReveal(() => asElement(el));
      return d;
    });
    stream.push("hello");
    expect(el.textContent).toBe("hello");
    for (const s of el.spans) {
      expect("transform" in s.style).toBe(false);
    }
    stream.complete();
    expect(stream.status()).toBe("done");
    dispose();
  });

  it("SSR: push is a no-op, status is done, pending is 0", () => {
    // No stubBrowser: no window at all.
    let stream!: ReturnType<typeof createStreamReveal>;
    const dispose = createRoot((d) => {
      stream = createStreamReveal(() => null);
      return d;
    });
    expect(() => stream.push("hello")).not.toThrow();
    expect(stream.pending()).toBe(0);
    expect(stream.status()).toBe("done");
    stream.complete();
    expect(stream.status()).toBe("done");
    dispose();
  });
});

describe("createAgentState", () => {
  it("walks through states tracking state() and prev()", () => {
    let agent!: ReturnType<typeof createAgentState>;
    const dispose = createRoot((d) => {
      agent = createAgentState();
      return d;
    });
    agent.set("thinking");
    agent.set("streaming");
    agent.set("tool-call");
    agent.set("done");
    expect(agent.state()).toBe("done");
    expect(agent.prev()).toBe("tool-call");
    dispose();
  });

  it("ignores illegal transitions when allowed is set", () => {
    let agent!: ReturnType<typeof createAgentState>;
    const dispose = createRoot((d) => {
      agent = createAgentState({
        allowed: [
          { from: "idle", to: "thinking" },
          { from: "thinking", to: "done" },
        ],
      });
      return d;
    });
    agent.set("streaming"); // not in the allowed list
    expect(agent.state()).toBe("idle");
    agent.set("thinking");
    expect(agent.state()).toBe("thinking");
    agent.set("streaming"); // thinking -> streaming is not allowed
    expect(agent.state()).toBe("thinking");
    dispose();
  });

  it("calls onExit then onEnter with the right states", () => {
    const calls: Array<[string, string, string]> = [];
    let agent!: ReturnType<typeof createAgentState>;
    const dispose = createRoot((d) => {
      agent = createAgentState({
        onEnter: (s, p) => calls.push(["enter", s, p]),
        onExit: (s, n) => calls.push(["exit", s, n]),
      });
      return d;
    });
    agent.set("thinking");
    expect(calls).toEqual([
      ["exit", "idle", "thinking"],
      ["enter", "thinking", "idle"],
    ]);
    dispose();
  });

  it("reset() returns to the initial state", () => {
    let agent!: ReturnType<typeof createAgentState>;
    const dispose = createRoot((d) => {
      agent = createAgentState({ initial: "thinking" });
      return d;
    });
    agent.set("streaming");
    expect(agent.state()).toBe("streaming");
    agent.reset();
    expect(agent.state()).toBe("thinking");
    expect(agent.prev()).toBe("streaming");
    dispose();
  });

  it("is() reports the current state", () => {
    let agent!: ReturnType<typeof createAgentState>;
    const dispose = createRoot((d) => {
      agent = createAgentState();
      return d;
    });
    expect(agent.is("idle")).toBe(true);
    expect(agent.is("thinking")).toBe(false);
    agent.set("thinking");
    expect(agent.is("thinking")).toBe(true);
    expect(agent.is("idle")).toBe(false);
    dispose();
  });
});

describe("parseDriftSpec", () => {
  it("parses a valid spec", () => {
    const spec = parseDriftSpec({
      version: 1,
      scenes: [
        {
          primitive: "kineticType",
          target: "title",
          options: { duration: 500 },
          duration: 1200,
        },
        { primitive: "beat", options: { bpm: 128 } },
      ],
    });
    expect(spec.version).toBe(1);
    expect(spec.scenes.length).toBe(2);
    expect(spec.scenes[0].target).toBe("title");
    expect(spec.scenes[0].duration).toBe(1200);
    expect(spec.scenes[1].target).toBeUndefined();
  });

  it("rejects a wrong version with path version", () => {
    let path = "";
    try {
      parseDriftSpec({ version: 2, scenes: [{ primitive: "beat" }] });
    } catch (e) {
      expect(e).toBeInstanceOf(DriftSpecError);
      path = (e as DriftSpecError).path;
    }
    expect(path).toBe("version");
  });

  it("rejects an unknown primitive with its scene path", () => {
    let path = "";
    try {
      parseDriftSpec({
        version: 1,
        scenes: [{ primitive: "beat" }, { primitive: "spin" }],
      });
    } catch (e) {
      path = (e as DriftSpecError).path;
    }
    expect(path).toBe("scenes[1].primitive");
  });

  it("rejects mistyped options with a precise path", () => {
    let path = "";
    try {
      parseDriftSpec({
        version: 1,
        scenes: [
          {
            primitive: "kineticType",
            target: "title",
            options: { duration: "fast" },
          },
        ],
      });
    } catch (e) {
      path = (e as DriftSpecError).path;
    }
    expect(path).toBe("scenes[0].options.duration");
  });

  it("rejects a missing target for DOM primitives", () => {
    let path = "";
    try {
      parseDriftSpec({
        version: 1,
        scenes: [{ primitive: "kineticType" }],
      });
    } catch (e) {
      path = (e as DriftSpecError).path;
    }
    expect(path).toBe("scenes[0].target");
  });

  it("rejects empty scenes", () => {
    let path = "";
    try {
      parseDriftSpec({ version: 1, scenes: [] });
    } catch (e) {
      path = (e as DriftSpecError).path;
    }
    expect(path).toBe("scenes");
  });
});

describe("createSpecPlayer", () => {
  const spec: DriftSpec = {
    version: 1,
    scenes: [
      {
        primitive: "kineticType",
        target: "title",
        options: { duration: 50, stagger: 5 },
      },
      { primitive: "transition", options: { duration: 50 } },
      { primitive: "beat", options: { bpm: 120 }, duration: 80 },
    ],
  };

  it("plays scenes in order and ends done", async () => {
    const b = stubBrowser();
    const el = fakeElement();
    const seen: number[] = [];
    let player!: ReturnType<typeof createSpecPlayer>;
    const dispose = createRoot((d) => {
      player = createSpecPlayer(spec, { title: () => asElement(el) });
      return d;
    });
    const p = player.play();
    // Scene 0 is entered synchronously inside play(); sample it before
    // the first frame so the fast first scene is not missed.
    seen.push(player.scene());
    for (let i = 0; i < 25; i++) {
      await b.run(1);
      seen.push(player.scene());
    }
    await p;
    const order = [...new Set(seen.filter((s) => s >= 0))];
    expect(order).toEqual([0, 1, 2]);
    expect(player.scene()).toBe(2);
    expect(player.status()).toBe("done");
    dispose();
  });

  it("stop() mid-play resolves the play promise", async () => {
    const b = stubBrowser();
    // The element needs real text: an empty element makes kineticType
    // finish instantly, so there would be no mid-play to stop.
    const el = fakeElement("hello");
    const long: DriftSpec = {
      version: 1,
      scenes: [
        {
          primitive: "kineticType",
          target: "title",
          options: { duration: 5000, stagger: 10 },
        },
      ],
    };
    let player!: ReturnType<typeof createSpecPlayer>;
    const dispose = createRoot((d) => {
      player = createSpecPlayer(long, { title: () => asElement(el) });
      return d;
    });
    const p = player.play();
    await b.run(3);
    expect(player.status()).toBe("running");
    player.stop();
    await p;
    expect(player.status()).toBe("idle");
    dispose();
  });

  it("reduced motion: play() jumps straight to the last scene", () => {
    stubBrowser({ reduced: true });
    const el = fakeElement();
    let player!: ReturnType<typeof createSpecPlayer>;
    const dispose = createRoot((d) => {
      player = createSpecPlayer(spec, { title: () => asElement(el) });
      return d;
    });
    void player.play();
    expect(player.scene()).toBe(2);
    expect(player.status()).toBe("done");
    dispose();
  });

  it("a step duration caps the step budget", async () => {
    const b = stubBrowser();
    // Without the budget this beat step would run 2000ms.
    const budgeted: DriftSpec = {
      version: 1,
      scenes: [{ primitive: "beat", duration: 100 }],
    };
    let player!: ReturnType<typeof createSpecPlayer>;
    const dispose = createRoot((d) => {
      player = createSpecPlayer(budgeted, {});
      return d;
    });
    const p = player.play();
    await b.run(20); // 334ms, well under the 2000ms default
    await p;
    expect(player.status()).toBe("done");
    dispose();
  });
});

describe("DriftSpec web3 steps", () => {
  const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const HASH =
    "0x5c504ed432cb51138bcf09aa5e8c31c3a5a25d00d5e2c38595411db5493f7b00";

  it("parses agentTx and txReceipt steps", () => {
    const spec = parseDriftSpec({
      version: 1,
      scenes: [
        {
          primitive: "agentTx",
          options: {
            to: ADDR,
            description: "Swap 1 ETH for USDC.",
            value: "1000000000000000000",
            chainId: 1,
          },
        },
        { primitive: "txReceipt", options: { hash: HASH, timeout: 5000 } },
      ],
    });
    expect(spec.scenes[0].primitive).toBe("agentTx");
    expect(spec.scenes[1].primitive).toBe("txReceipt");
  });

  it("rejects an agentTx step with a bad address", () => {
    let path = "";
    try {
      parseDriftSpec({
        version: 1,
        scenes: [
          { primitive: "agentTx", options: { to: "nope", description: "x" } },
        ],
      });
    } catch (e) {
      path = (e as DriftSpecError).path;
    }
    expect(path).toBe("scenes[0].options.to");
  });

  it("rejects an agentTx step without a description", () => {
    let path = "";
    try {
      parseDriftSpec({
        version: 1,
        scenes: [{ primitive: "agentTx", options: { to: ADDR } }],
      });
    } catch (e) {
      path = (e as DriftSpecError).path;
    }
    expect(path).toBe("scenes[0].options.description");
  });

  it("rejects a txReceipt step with a bad hash", () => {
    let path = "";
    try {
      parseDriftSpec({
        version: 1,
        scenes: [{ primitive: "txReceipt", options: { hash: "0x123" } }],
      });
    } catch (e) {
      path = (e as DriftSpecError).path;
    }
    expect(path).toBe("scenes[0].options.hash");
  });

  it("agentTx step proposes and waits for the host to approve", async () => {
    const b = stubBrowser();
    let seen: { proposal: AgentTxProposal; tx: AgentTxControls } | undefined;
    const spec: DriftSpec = {
      version: 1,
      scenes: [
        {
          primitive: "agentTx",
          options: { to: ADDR, description: "Swap 1 ETH for USDC." },
        },
      ],
    };
    let player!: ReturnType<typeof createSpecPlayer>;
    const dispose = createRoot((d) => {
      player = createSpecPlayer(spec, {}, {
        onAgentTxStep: (proposal, tx) => {
          seen = { proposal, tx };
        },
      });
      return d;
    });
    const p = player.play();
    await b.run(3);
    expect(seen?.proposal.to).toBe(ADDR);
    expect(seen?.tx.state()).toBe("proposed");
    expect(player.status()).toBe("running");
    // The host shows its approval UI, then drives the flow.
    seen!.tx.approve();
    await seen!.tx.execute();
    await b.run(2);
    expect(seen!.tx.state()).toBe("executing");
    seen!.tx.tx.set("success");
    await b.run(3);
    await p;
    expect(player.status()).toBe("done");
    dispose();
  });

  it("autoApprove approves the step without a host gesture", async () => {
    const b = stubBrowser();
    let txRef: AgentTxControls | undefined;
    const spec: DriftSpec = {
      version: 1,
      scenes: [
        {
          primitive: "agentTx",
          options: { to: ADDR, description: "x", autoApprove: true },
        },
      ],
    };
    let player!: ReturnType<typeof createSpecPlayer>;
    const dispose = createRoot((d) => {
      player = createSpecPlayer(spec, {}, {
        onAgentTxStep: (_p, tx) => {
          txRef = tx;
        },
      });
      return d;
    });
    const p = player.play();
    await b.run(3);
    expect(txRef?.state()).toBe("approved");
    // The host still executes and reports the outcome.
    await txRef!.execute();
    txRef!.tx.set("success");
    await b.run(3);
    await p;
    expect(player.status()).toBe("done");
    dispose();
  });

  it("stop() skips a waiting agentTx step", async () => {
    const b = stubBrowser();
    const spec: DriftSpec = {
      version: 1,
      scenes: [
        { primitive: "agentTx", options: { to: ADDR, description: "x" } },
      ],
    };
    let player!: ReturnType<typeof createSpecPlayer>;
    const dispose = createRoot((d) => {
      player = createSpecPlayer(spec, {}, {});
      return d;
    });
    const p = player.play();
    await b.run(3);
    expect(player.status()).toBe("running");
    player.stop();
    await p;
    expect(player.status()).toBe("idle");
    dispose();
  });

  it("txReceipt step waits for the hash to mine", async () => {
    const b = stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          result: {
            transactionHash: HASH,
            blockNumber: "0x10",
            status: "0x1",
            gasUsed: "0x5208",
          },
        }),
      })),
    );
    const spec: DriftSpec = {
      version: 1,
      scenes: [{ primitive: "txReceipt", options: { hash: HASH } }],
    };
    let player!: ReturnType<typeof createSpecPlayer>;
    const dispose = createRoot((d) => {
      player = createSpecPlayer(spec, {});
      return d;
    });
    const p = player.play();
    await b.run(10);
    await p;
    expect(player.status()).toBe("done");
    dispose();
  });
});
