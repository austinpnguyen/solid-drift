import { describe, it, expect, vi } from "vitest";
import { createRoot } from "solid-js";
import {
  createAuthSession,
  decodeJwtPayload,
  type AuthSession,
} from "./auth.js";

function setup<T>(fn: () => T): { result: T; dispose: () => void } {
  let result!: T;
  let dispose!: () => void;
  createRoot((d) => {
    result = fn();
    dispose = d;
  });
  return { result, dispose };
}

const base64url = (value: string): string =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const jwt = (payload: unknown): string =>
  `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(payload))}.`;

describe("decodeJwtPayload", () => {
  it("decodes the payload of a JWT", () => {
    expect(decodeJwtPayload(jwt({ sub: "123", name: "austin" }))).toEqual({
      sub: "123",
      name: "austin",
    });
  });

  it("returns undefined for malformed input", () => {
    expect(decodeJwtPayload("not-a-token")).toBeUndefined();
    expect(decodeJwtPayload("")).toBeUndefined();
  });
});

describe("createAuthSession", () => {
  it("starts unknown without an initial session", () => {
    const { result: auth, dispose } = setup(() => createAuthSession());
    expect(auth.status()).toBe("unknown");
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeUndefined();
    dispose();
  });

  it("signIn stores the session in memory", () => {
    const { result: auth, dispose } = setup(() => createAuthSession());
    auth.signIn({
      token: "tok-1",
      refreshToken: "ref-1",
      user: { id: "u1" },
    });
    expect(auth.status()).toBe("authenticated");
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.token()).toBe("tok-1");
    expect(auth.user()).toEqual({ id: "u1" });
    expect(auth.authHeader()).toBe("Bearer tok-1");
    expect(auth.session()?.refreshToken).toBe("ref-1");
    dispose();
  });

  it("decodes the user from a JWT when no user is given", () => {
    const { result: auth, dispose } = setup(() => createAuthSession());
    auth.signIn({ token: jwt({ sub: "u9" }) });
    expect(auth.user()).toEqual({ sub: "u9" });
    dispose();
  });

  it("accepts an initial session", () => {
    const { result: auth, dispose } = setup(() =>
      createAuthSession({ initialSession: { token: "tok-0" } }),
    );
    expect(auth.status()).toBe("authenticated");
    expect(auth.token()).toBe("tok-0");
    dispose();
  });

  it("signOut clears everything", () => {
    const { result: auth, dispose } = setup(() =>
      createAuthSession({ initialSession: { token: "tok-0" } }),
    );
    auth.signOut();
    expect(auth.status()).toBe("unauthenticated");
    expect(auth.token()).toBeUndefined();
    expect(auth.authHeader()).toBeUndefined();
    dispose();
  });

  it("getToken returns the token when fresh", async () => {
    const refresh = vi.fn();
    const { result: auth, dispose } = setup(() =>
      createAuthSession({
        initialSession: { token: "tok-1", expiresAt: Date.now() + 3600000 },
        refresh,
      }),
    );
    await expect(auth.getToken()).resolves.toBe("tok-1");
    expect(refresh).not.toHaveBeenCalled();
    dispose();
  });

  it("getToken refreshes an expired token", async () => {
    const refresh = vi.fn(async (_old: AuthSession | undefined) => ({
      token: "tok-2",
      expiresAt: Date.now() + 3600000,
    }));
    const { result: auth, dispose } = setup(() =>
      createAuthSession({
        initialSession: { token: "tok-1", expiresAt: Date.now() - 1000 },
        refresh,
      }),
    );
    await expect(auth.getToken()).resolves.toBe("tok-2");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(auth.token()).toBe("tok-2");
    expect(auth.status()).toBe("authenticated");
    dispose();
  });

  it("getToken signs out when refresh returns undefined", async () => {
    const refresh = vi.fn(async () => undefined);
    const { result: auth, dispose } = setup(() =>
      createAuthSession({
        initialSession: { token: "tok-1", expiresAt: Date.now() - 1000 },
        refresh,
      }),
    );
    await expect(auth.getToken()).resolves.toBeUndefined();
    expect(auth.status()).toBe("unauthenticated");
    dispose();
  });

  it("getToken signs out when refresh throws", async () => {
    const refresh = vi.fn(async () => {
      throw new Error("refresh down");
    });
    const { result: auth, dispose } = setup(() =>
      createAuthSession({
        initialSession: { token: "tok-1", expiresAt: Date.now() - 1000 },
        refresh,
      }),
    );
    await expect(auth.getToken()).resolves.toBeUndefined();
    expect(auth.status()).toBe("unauthenticated");
    dispose();
  });

  it("getToken without refresh signs out an expired session", async () => {
    const { result: auth, dispose } = setup(() =>
      createAuthSession({
        initialSession: { token: "tok-1", expiresAt: Date.now() - 1000 },
      }),
    );
    await expect(auth.getToken()).resolves.toBeUndefined();
    expect(auth.status()).toBe("unauthenticated");
    dispose();
  });

  it("getToken returns undefined when never signed in", async () => {
    const { result: auth, dispose } = setup(() => createAuthSession());
    await expect(auth.getToken()).resolves.toBeUndefined();
    expect(auth.status()).toBe("unauthenticated");
    dispose();
  });

  it("treats tokens inside the refresh margin as expired", async () => {
    const refresh = vi.fn(async () => ({
      token: "tok-fresh",
      expiresAt: Date.now() + 3600000,
    }));
    const { result: auth, dispose } = setup(() =>
      createAuthSession({
        initialSession: { token: "tok-1", expiresAt: Date.now() + 30000 },
        refresh,
        refreshMarginMs: 60000,
      }),
    );
    await expect(auth.getToken()).resolves.toBe("tok-fresh");
    expect(refresh).toHaveBeenCalledTimes(1);
    dispose();
  });
});
