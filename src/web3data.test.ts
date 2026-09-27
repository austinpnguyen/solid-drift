import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, createSignal, type Accessor } from "solid-js";
import {
  CHAINS,
  createBalance,
  createBlockNumber,
  createChain,
  createChainlinkPrice,
  createENS,
  createGasPrice,
  createIdenticon,
  createNFTMetadata,
  createPoll,
  createPriceChange,
  createPriceCompare,
  createTokenPrice,
  createTxReceipt,
  formatUnits,
  isAddress,
  keccak256,
  parseUnits,
  sanitizeOnchain,
  shortenAddress,
} from "./web3data.js";

let dispose: (() => void) | undefined;

beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stub fetch as a JSON-RPC endpoint dispatching on the method name. */
function stubRpc(handler: (method: string, params: unknown[]) => unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (...args: unknown[]) => {
      const init = args[1] as { body?: unknown } | undefined;
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };
      return {
        ok: true,
        json: async () => ({ result: handler(body.method, body.params) }),
      };
    }),
  );
}

/** ABI-encode a string return value the way eth_call returns it. */
function abiString(s: string): string {
  const bytes = new TextEncoder().encode(s);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const len = (hex.length / 2).toString(16).padStart(64, "0");
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
  return `0x${"0".repeat(64)}${len}${padded}`;
}

const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

describe("keccak256", () => {
  it("hashes the empty string to the known vector", () => {
    expect(bytesToHex(keccak256(new Uint8Array(0)))).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("hashes 'hello' to the known vector", () => {
    expect(bytesToHex(keccak256(new TextEncoder().encode("hello")))).toBe(
      "1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8",
    );
  });

  it("hashes 'abc' to the known vector", () => {
    expect(bytesToHex(keccak256(new TextEncoder().encode("abc")))).toBe(
      "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });
});

describe("formatUnits", () => {
  it("formats 1 ether", () => {
    expect(formatUnits(1000000000000000000n)).toBe("1");
  });

  it("formats fractional values", () => {
    expect(formatUnits("1500000000000000000")).toBe("1.5");
  });

  it("formats zero", () => {
    expect(formatUnits(0n)).toBe("0");
  });

  it("formats tiny values without float artifacts", () => {
    expect(formatUnits(1n)).toBe("0.000000000000000001");
  });

  it("respects custom decimals", () => {
    expect(formatUnits(1500000n, 6)).toBe("1.5");
  });

  it("throws on non-integer input", () => {
    expect(() => formatUnits("1.5")).toThrow();
    expect(() => formatUnits("abc")).toThrow();
  });
});

describe("parseUnits", () => {
  it("parses 1 ether", () => {
    expect(parseUnits("1")).toBe(1000000000000000000n);
  });

  it("parses fractional values", () => {
    expect(parseUnits("1.5")).toBe(1500000000000000000n);
  });

  it("parses zero", () => {
    expect(parseUnits("0")).toBe(0n);
  });

  it("round-trips with formatUnits", () => {
    expect(formatUnits(parseUnits("123.456"))).toBe("123.456");
  });

  it("throws on invalid input and excess decimals", () => {
    expect(() => parseUnits("abc")).toThrow();
    expect(() => parseUnits("1.0000000000000000001")).toThrow();
  });
});

describe("isAddress", () => {
  it("accepts lowercase and checksummed addresses", () => {
    expect(isAddress(ADDR.toLowerCase())).toBe(true);
    expect(isAddress(ADDR)).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isAddress("0x1234")).toBe(false);
    expect(isAddress("1234567890123456789012345678901234567890")).toBe(false);
    expect(isAddress("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ")).toBe(false);
  });
});

describe("shortenAddress", () => {
  it("shortens with 4 chars by default", () => {
    expect(shortenAddress(ADDR)).toBe("0xd8dA…6045");
  });

  it("respects a custom char count", () => {
    expect(shortenAddress(ADDR, 6)).toBe("0xd8dA6B…A96045");
  });

  it("returns invalid input unchanged", () => {
    expect(shortenAddress("not-an-address")).toBe("not-an-address");
  });
});

describe("CHAINS", () => {
  it("registers ethereum mainnet", () => {
    expect(CHAINS[1]).toMatchObject({
      name: "Ethereum",
      currency: "ETH",
      decimals: 18,
    });
  });

  it("covers seven chains including sepolia", () => {
    expect(Object.keys(CHAINS)).toHaveLength(7);
    expect(CHAINS[11155111].name).toBe("Sepolia");
    expect(CHAINS[137].currency).toBe("POL");
  });
});

describe("createChain", () => {
  it("looks up a static chain id", () => {
    let chain: Accessor<{ name: string } | undefined> | undefined;
    dispose = createRoot((d) => {
      chain = createChain(1);
      return d;
    });
    expect(chain!()?.name).toBe("Ethereum");
  });

  it("reacts to a signal and returns undefined for unknown ids", () => {
    const [id, setId] = createSignal(8453);
    let chain: Accessor<{ name: string } | undefined> | undefined;
    dispose = createRoot((d) => {
      chain = createChain(id);
      return d;
    });
    expect(chain!()?.name).toBe("Base");
    setId(999999);
    expect(chain!()).toBeUndefined();
  });
});

describe("createPoll", () => {
  it("fetches immediately and reports success", async () => {
    vi.useFakeTimers();
    let api: ReturnType<typeof createPoll<number>> | undefined;
    dispose = createRoot((d) => {
      api = createPoll(async () => 42, { interval: 1000 });
      return d;
    });
    expect(api!.status()).toBe("loading");
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.data()).toBe(42);
    expect(api!.error()).toBeNull();
    expect(api!.status()).toBe("success");
  });

  it("reports errors on the error signal", async () => {
    vi.useFakeTimers();
    let api: ReturnType<typeof createPoll<number>> | undefined;
    dispose = createRoot((d) => {
      api = createPoll(
        async () => {
          throw new Error("boom");
        },
        { interval: 1000 },
      );
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.status()).toBe("error");
    expect(api!.error()?.message).toBe("boom");
  });

  it("backs off on error and resets on success", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let api: ReturnType<typeof createPoll<string>> | undefined;
    dispose = createRoot((d) => {
      api = createPoll(
        async () => {
          calls++;
          if (calls < 3) throw new Error("boom");
          return "ok";
        },
        { interval: 1000, backoff: 2, maxInterval: 5000 },
      );
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls).toBe(3);
    expect(api!.data()).toBe("ok");
    expect(api!.status()).toBe("success");
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(4);
  });

  it("abort stops further polling", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let api: ReturnType<typeof createPoll<number>> | undefined;
    dispose = createRoot((d) => {
      api = createPoll(
        async () => {
          calls++;
          return calls;
        },
        { interval: 1000 },
      );
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    api!.abort();
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls).toBe(1);
  });

  it("retry fetches immediately and resets the backoff", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let api: ReturnType<typeof createPoll<number>> | undefined;
    dispose = createRoot((d) => {
      api = createPoll(
        async () => {
          calls++;
          if (calls === 1) throw new Error("boom");
          return calls;
        },
        { interval: 10000, immediate: false },
      );
      return d;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(0);
    api!.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    expect(api!.status()).toBe("error");
    api!.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
    expect(api!.status()).toBe("success");
  });

  it("never fetches on the server", async () => {
    vi.unstubAllGlobals();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => 1 }));
    vi.stubGlobal("fetch", fetchMock);
    let api: ReturnType<typeof createPoll<number>> | undefined;
    dispose = createRoot((d) => {
      api = createPoll(async () => 1, { interval: 1000 });
      return d;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(api!.status()).toBe("idle");
  });
});

describe("createTokenPrice", () => {
  it("parses price and 24h change", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ethereum: { usd: 2500, usd_24h_change: 2.5 } }),
      })),
    );
    let api: ReturnType<typeof createTokenPrice> | undefined;
    dispose = createRoot((d) => {
      api = createTokenPrice("ethereum", { interval: 60000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.price()).toBe(2500);
    expect(api!.change24h()).toBe(2.5);
    expect(api!.status()).toBe("success");
  });

  it("errors when the token is missing from the response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
      })),
    );
    let api: ReturnType<typeof createTokenPrice> | undefined;
    dispose = createRoot((d) => {
      api = createTokenPrice("nope", { interval: 60000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.status()).toBe("error");
    expect(api!.price()).toBeUndefined();
  });

  it("errors on HTTP failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429 })),
    );
    let api: ReturnType<typeof createTokenPrice> | undefined;
    dispose = createRoot((d) => {
      api = createTokenPrice("ethereum", { interval: 60000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.status()).toBe("error");
    expect(api!.error()?.message).toContain("429");
  });
});

describe("createPriceChange", () => {
  it("is undefined until two samples exist", async () => {
    vi.useFakeTimers();
    const [v] = createSignal<number | undefined>(100);
    let change: Accessor<number | undefined> | undefined;
    dispose = createRoot((d) => {
      change = createPriceChange(v).change;
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(change!()).toBeUndefined();
  });

  it("reports percent change between first and last sample", async () => {
    vi.useFakeTimers();
    const [v, setV] = createSignal<number | undefined>(100);
    let change: Accessor<number | undefined> | undefined;
    dispose = createRoot((d) => {
      change = createPriceChange(v).change;
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    setV(110);
    await vi.advanceTimersByTimeAsync(0);
    expect(change!()).toBeCloseTo(10);
    setV(90);
    await vi.advanceTimersByTimeAsync(0);
    expect(change!()).toBeCloseTo(-10);
  });

  it("prunes samples outside the window", async () => {
    vi.useFakeTimers();
    const [v, setV] = createSignal<number | undefined>(100);
    let change: Accessor<number | undefined> | undefined;
    dispose = createRoot((d) => {
      change = createPriceChange(v, {
        windowMs: 1000,
        sampleMs: 400,
      }).change;
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    setV(110);
    await vi.advanceTimersByTimeAsync(0);
    expect(change!()).toBeCloseTo(10);
    await vi.advanceTimersByTimeAsync(1500);
    expect(change!()).toBeCloseTo(0);
  });

  it("reset clears the samples", async () => {
    vi.useFakeTimers();
    const [v, setV] = createSignal<number | undefined>(100);
    let api: ReturnType<typeof createPriceChange> | undefined;
    dispose = createRoot((d) => {
      api = createPriceChange(v);
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    setV(110);
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.change()).toBeCloseTo(10);
    api!.reset();
    expect(api!.change()).toBeUndefined();
  });
});

describe("createPriceCompare", () => {
  it("computes ratio and percent difference", () => {
    const [a] = createSignal<number | undefined>(200);
    const [b] = createSignal<number | undefined>(100);
    let api: ReturnType<typeof createPriceCompare> | undefined;
    dispose = createRoot((d) => {
      api = createPriceCompare(a, b);
      return d;
    });
    expect(api!.ratio()).toBe(2);
    expect(api!.diffPercent()).toBe(100);
    expect(api!.leader()).toBe("a");
  });

  it("reports the other leader and ties", () => {
    const [a, setA] = createSignal<number | undefined>(50);
    const [b] = createSignal<number | undefined>(100);
    let api: ReturnType<typeof createPriceCompare> | undefined;
    dispose = createRoot((d) => {
      api = createPriceCompare(a, b);
      return d;
    });
    expect(api!.leader()).toBe("b");
    expect(api!.diffPercent()).toBe(-50);
    setA(100);
    expect(api!.leader()).toBe("tie");
  });

  it("is undefined while either side is missing", () => {
    const [a] = createSignal<number | undefined>(undefined);
    const [b] = createSignal<number | undefined>(100);
    let api: ReturnType<typeof createPriceCompare> | undefined;
    dispose = createRoot((d) => {
      api = createPriceCompare(a, b);
      return d;
    });
    expect(api!.ratio()).toBeUndefined();
    expect(api!.diffPercent()).toBeUndefined();
    expect(api!.leader()).toBeUndefined();
  });
});

describe("createGasPrice", () => {
  it("reads eth_gasPrice as wei and gwei", async () => {
    vi.useFakeTimers();
    stubRpc((method) => {
      expect(method).toBe("eth_gasPrice");
      return "0x174876e800";
    });
    let api: ReturnType<typeof createGasPrice> | undefined;
    dispose = createRoot((d) => {
      api = createGasPrice({ interval: 15000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.wei()).toBe(100000000000n);
    expect(api!.gwei()).toBe(100);
  });
});

describe("createBalance", () => {
  it("reads the native balance and formats it", async () => {
    vi.useFakeTimers();
    stubRpc((method, params) => {
      expect(method).toBe("eth_getBalance");
      expect(params[0]).toBe(ADDR);
      return "0xde0b6b3a7640000";
    });
    let api: ReturnType<typeof createBalance> | undefined;
    dispose = createRoot((d) => {
      api = createBalance(ADDR, { interval: 20000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.balance()).toBe(1000000000000000000n);
    expect(api!.formatted()).toBe("1");
  });

  it("calls balanceOf for ERC20 tokens", async () => {
    vi.useFakeTimers();
    const token = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    let seenData = "";
    stubRpc((method, params) => {
      expect(method).toBe("eth_call");
      const call = params[0] as { to: string; data: string };
      expect(call.to).toBe(token);
      seenData = call.data;
      return `0x${(5000000n).toString(16).padStart(64, "0")}`;
    });
    let api: ReturnType<typeof createBalance> | undefined;
    dispose = createRoot((d) => {
      api = createBalance(ADDR, { token, decimals: 6, interval: 20000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(seenData.startsWith("0x70a08231")).toBe(true);
    expect(seenData).toContain(ADDR.slice(2).toLowerCase());
    expect(api!.formatted()).toBe("5");
  });

  it("throws on an invalid address", () => {
    expect(() =>
      createRoot(() => createBalance("not-an-address")),
    ).toThrow("invalid address");
  });

  it("surfaces RPC errors", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ error: { message: "limit exceeded" } }),
      })),
    );
    let api: ReturnType<typeof createBalance> | undefined;
    dispose = createRoot((d) => {
      api = createBalance(ADDR, { interval: 20000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.status()).toBe("error");
    expect(api!.error()?.message).toContain("limit exceeded");
  });
});

describe("createTxReceipt", () => {
  const HASH =
    "0x5c504ed432cb51138bcf09aa5e8c31c3a5a25d00d5e2c38595411db5493f7b";

  it("waits for the receipt then stops polling", async () => {
    vi.useFakeTimers();
    let calls = 0;
    stubRpc((method, params) => {
      expect(method).toBe("eth_getTransactionReceipt");
      expect(params[0]).toBe(HASH);
      calls++;
      return calls === 1
        ? null
        : {
            transactionHash: HASH,
            blockNumber: "0x10",
            status: "0x1",
            gasUsed: "0x5208",
          };
    });
    let api: ReturnType<typeof createTxReceipt> | undefined;
    dispose = createRoot((d) => {
      api = createTxReceipt(HASH, { interval: 4000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.mined()).toBe(false);
    expect(api!.receipt()).toBeNull();
    await vi.advanceTimersByTimeAsync(4000);
    expect(api!.mined()).toBe(true);
    expect(api!.receipt()).toMatchObject({
      transactionHash: HASH,
      blockNumber: 16,
      success: true,
      gasUsed: 21000n,
    });
    await vi.advanceTimersByTimeAsync(20000);
    expect(calls).toBe(2);
  });

  it("reports reverted transactions as failed", async () => {
    vi.useFakeTimers();
    stubRpc(() => ({
      transactionHash: HASH,
      blockNumber: "0x11",
      status: "0x0",
      gasUsed: "0x5208",
    }));
    let api: ReturnType<typeof createTxReceipt> | undefined;
    dispose = createRoot((d) => {
      api = createTxReceipt(HASH, { interval: 4000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.mined()).toBe(true);
    expect(api!.receipt()?.success).toBe(false);
  });
});

describe("createBlockNumber", () => {
  it("parses the hex block number", async () => {
    vi.useFakeTimers();
    stubRpc((method) => {
      expect(method).toBe("eth_blockNumber");
      return "0x100";
    });
    let api: ReturnType<typeof createBlockNumber> | undefined;
    dispose = createRoot((d) => {
      api = createBlockNumber({ interval: 12000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.blockNumber()).toBe(256);
  });
});

describe("createChainlinkPrice", () => {
  it("reads decimals once then the latest answer", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    stubRpc((method, params) => {
      expect(method).toBe("eth_call");
      const data = (params[0] as { data: string }).data;
      seen.push(data);
      if (data.startsWith("0x313ce567")) return "0x08";
      const answer = (250000000000n).toString(16).padStart(64, "0");
      return `0x${"0".repeat(64)}${answer}${"0".repeat(64 * 3)}`;
    });
    let api: ReturnType<typeof createChainlinkPrice> | undefined;
    dispose = createRoot((d) => {
      api = createChainlinkPrice(FEED, { interval: 30000 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.price()).toBe(2500);
    expect(seen.filter((s) => s.startsWith("0x313ce567"))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(seen.filter((s) => s.startsWith("0x313ce567"))).toHaveLength(1);
    expect(api!.price()).toBe(2500);
  });

  it("throws on an invalid feed address", () => {
    expect(() =>
      createRoot(() => createChainlinkPrice("nope")),
    ).toThrow("invalid feed address");
  });
});

describe("createNFTMetadata", () => {
  const CONTRACT = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";

  function stubNft(meta: { ok: boolean; json?: unknown; status?: number }): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (...args: unknown[]) => {
        const url = String(args[0]);
        const init = args[1] as { body?: unknown } | undefined;
        if (url.startsWith("https://rpc.test")) {
          return {
            ok: true,
            json: async () => ({ result: abiString("ipfs://QmMeta") }),
          };
        }
        expect(url).toBe("https://ipfs.io/ipfs/QmMeta");
        void init;
        return {
          ok: meta.ok,
          status: meta.status ?? 200,
          json: async () => meta.json,
        };
      }),
    );
  }

  it("resolves tokenURI and rewrites ipfs image URLs", async () => {
    vi.useFakeTimers();
    stubNft({
      ok: true,
      json: {
        name: "Cool NFT",
        description: "A very cool NFT",
        image: "ipfs://QmImg",
        attributes: [{ trait_type: "bg", value: "blue" }],
      },
    });
    let api: ReturnType<typeof createNFTMetadata> | undefined;
    dispose = createRoot((d) => {
      api = createNFTMetadata(CONTRACT, 42, { endpoint: "https://rpc.test" });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.status()).toBe("success");
    expect(api!.metadata()?.name).toBe("Cool NFT");
    expect(api!.image()).toBe("https://ipfs.io/ipfs/QmImg");
    expect(api!.metadata()?.attributes).toHaveLength(1);
  });

  it("surfaces metadata fetch failures", async () => {
    vi.useFakeTimers();
    stubNft({ ok: false, status: 404 });
    let api: ReturnType<typeof createNFTMetadata> | undefined;
    dispose = createRoot((d) => {
      api = createNFTMetadata(CONTRACT, 42, { endpoint: "https://rpc.test" });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.status()).toBe("error");
    expect(api!.error()?.message).toContain("404");
  });

  it("throws on an invalid contract address", () => {
    expect(() =>
      createRoot(() => createNFTMetadata("nope", 1)),
    ).toThrow("invalid contract address");
  });
});

describe("createENS", () => {
  it("returns undefined when no name is set", async () => {
    vi.useFakeTimers();
    stubRpc(() => `0x${"0".repeat(64)}`);
    let api: ReturnType<typeof createENS> | undefined;
    dispose = createRoot((d) => {
      api = createENS(ADDR, { endpoint: "https://rpc.test" });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.status()).toBe("success");
    expect(api!.name()).toBeUndefined();
  });

  it("reverse-resolves a name through the resolver", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    stubRpc((_method, params) => {
      const data = (params[0] as { data: string }).data;
      seen.push(data);
      if (data.startsWith("0x0178b8bf")) {
        return `0x${"0".repeat(24)}${"ab".repeat(20)}`;
      }
      expect(data.startsWith("0x691f3431")).toBe(true);
      return abiString("vitalik.eth");
    });
    let api: ReturnType<typeof createENS> | undefined;
    dispose = createRoot((d) => {
      api = createENS(ADDR, { endpoint: "https://rpc.test" });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api!.name()).toBe("vitalik.eth");
    expect(seen).toHaveLength(2);
  });

  it("throws on an invalid address", () => {
    expect(() => createRoot(() => createENS("nope"))).toThrow(
      "invalid address",
    );
  });
});

describe("createIdenticon", () => {
  it("is deterministic per address", () => {
    let a: Accessor<string> | undefined;
    dispose = createRoot((d) => {
      a = createIdenticon(ADDR);
      return d;
    });
    expect(a!()).toBe(createIdenticon(ADDR)());
  });

  it("differs between addresses", () => {
    let a: Accessor<string> | undefined;
    let b: Accessor<string> | undefined;
    dispose = createRoot((d) => {
      a = createIdenticon(ADDR);
      b = createIdenticon("0x0000000000000000000000000000000000000001");
      return d;
    });
    expect(a!()).not.toBe(b!());
  });

  it("returns an SVG data URI", () => {
    let a: Accessor<string> | undefined;
    dispose = createRoot((d) => {
      a = createIdenticon(ADDR, { size: 64 });
      return d;
    });
    const uri = a!();
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<rect");
  });

  it("reacts to a signal address", () => {
    const [addr, setAddr] = createSignal(ADDR);
    let a: Accessor<string> | undefined;
    dispose = createRoot((d) => {
      a = createIdenticon(addr);
      return d;
    });
    const first = a!();
    setAddr("0x0000000000000000000000000000000000000001");
    expect(a!()).not.toBe(first);
  });
});

describe("sanitizeOnchain", () => {
  it("escapes HTML markup", () => {
    expect(sanitizeOnchain("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(sanitizeOnchain("a & b")).toBe("a &amp; b");
    expect(sanitizeOnchain('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("strips event handler attributes", () => {
    expect(sanitizeOnchain('<img src="x" onerror="alert(1)">')).toBe(
      "&lt;img src=&quot;x&quot;&gt;",
    );
    expect(sanitizeOnchain("<div ONCLICK=alert(1)>x</div>")).toBe(
      "&lt;div&gt;x&lt;/div&gt;",
    );
    expect(sanitizeOnchain("<a onmouseover = 'evil()'>x</a>")).toBe(
      "&lt;a&gt;x&lt;/a&gt;",
    );
  });

  it("neutralizes javascript: URLs in link attributes", () => {
    expect(sanitizeOnchain('<a href="javascript:alert(1)">x</a>')).toBe(
      "&lt;a href=&quot;#&quot;&gt;x&lt;/a&gt;",
    );
    expect(sanitizeOnchain("<a href=JaVaScRiPt:alert(1)>x</a>")).toBe(
      "&lt;a href=#&gt;x&lt;/a&gt;",
    );
    expect(sanitizeOnchain('<form action="vbscript:msgbox(1)">')).toBe(
      "&lt;form action=&quot;#&quot;&gt;",
    );
  });

  it("blocks dangerous data: URLs but keeps images and safe schemes", () => {
    expect(sanitizeOnchain('<img src="data:text/html,<b>x</b>">')).toBe(
      "&lt;img src=&quot;#&quot;&gt;",
    );
    expect(sanitizeOnchain('<img src="data:image/png;base64,AAA">')).toBe(
      "&lt;img src=&quot;data:image/png;base64,AAA&quot;&gt;",
    );
    expect(sanitizeOnchain('<a href="https://example.com">x</a>')).toBe(
      "&lt;a href=&quot;https://example.com&quot;&gt;x&lt;/a&gt;",
    );
    expect(sanitizeOnchain('<a href="/path?q=1">x</a>')).toBe(
      "&lt;a href=&quot;/path?q=1&quot;&gt;x&lt;/a&gt;",
    );
    expect(sanitizeOnchain('<a href="#top">x</a>')).toBe(
      "&lt;a href=&quot;#top&quot;&gt;x&lt;/a&gt;",
    );
  });

  it("respects a custom allowed scheme list", () => {
    expect(
      sanitizeOnchain('<a href="ipfs://Qm123">x</a>', {
        allowedSchemes: ["ipfs"],
      }),
    ).toBe("&lt;a href=&quot;ipfs://Qm123&quot;&gt;x&lt;/a&gt;");
    expect(sanitizeOnchain('<a href="ipfs://Qm123">x</a>')).toBe(
      "&lt;a href=&quot;#&quot;&gt;x&lt;/a&gt;",
    );
  });

  it("handles combined payloads", () => {
    expect(
      sanitizeOnchain(
        'Evil<img src=x onerror=alert(document.domain)> <a href="javascript:steal()">claim</a>',
      ),
    ).toBe(
      "Evil&lt;img src=x&gt; &lt;a href=&quot;#&quot;&gt;claim&lt;/a&gt;",
    );
  });

  it("coerces non-string input", () => {
    expect(sanitizeOnchain(null)).toBe("");
    expect(sanitizeOnchain(undefined)).toBe("");
    expect(sanitizeOnchain(123)).toBe("123");
  });

  it("truncates to maxLength", () => {
    expect(sanitizeOnchain("abcdef", { maxLength: 3 })).toBe("abc");
    expect(sanitizeOnchain("ab", { maxLength: 10 })).toBe("ab");
  });

  it("leaves ordinary token names readable", () => {
    expect(sanitizeOnchain("Wrapped Ether")).toBe("Wrapped Ether");
    expect(sanitizeOnchain("USDC (v2)")).toBe("USDC (v2)");
  });
});
