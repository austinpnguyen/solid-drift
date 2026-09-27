/**
 * Client auth session.
 *
 * Keeps the auth session in a memory-only signal: tokens are never written
 * to storage by this primitive. If the app wants persistence, it restores
 * via `initialSession` from its own storage layer. There is no OAuth flow
 * here; the app signs in through its own backend and hands the resulting
 * session to `signIn()`.
 */

import { createSignal, type Accessor } from "solid-js";

export interface AuthSession {
  /** Opaque access token. Memory-only. */
  token: string;
  /** Optional refresh token. Memory-only. */
  refreshToken?: string;
  /** Unix milliseconds when the access token expires. */
  expiresAt?: number;
  /** The authenticated user or profile payload. */
  user?: unknown;
}

export interface AuthSessionOptions {
  /** Initial session, e.g. restored by the app from its own storage. */
  initialSession?: AuthSession;
  /**
   * Called when the access token is expired or missing. Return a fresh
   * session, or undefined when the refresh failed (the user is signed out).
   */
  refresh?: (
    session: AuthSession | undefined,
  ) => Promise<AuthSession | undefined>;
  /** Milliseconds before expiry to treat the token as expired. Default 60000. */
  refreshMarginMs?: number;
  /** Decode the user payload from a token. Defaults to JWT payload decoding. */
  decodeUser?: (token: string) => unknown;
}

export type AuthStatus =
  | "unknown"
  | "authenticated"
  | "unauthenticated"
  | "refreshing";

export interface AuthSessionControls {
  session: Accessor<AuthSession | undefined>;
  token: Accessor<string | undefined>;
  user: Accessor<unknown>;
  status: Accessor<AuthStatus>;
  isAuthenticated: Accessor<boolean>;
  /** "Bearer <token>" or undefined. */
  authHeader: Accessor<string | undefined>;
  signIn: (session: AuthSession) => void;
  signOut: () => void;
  /**
   * Return a valid token, refreshing first when expired and a `refresh`
   * callback is configured. Returns undefined when signed out.
   */
  getToken: () => Promise<string | undefined>;
}

/**
 * Decode the payload of a JWT without verifying its signature.
 * Verification belongs on the server; this is only for reading claims
 * like `sub` or `exp` on the client. Returns undefined for malformed input.
 */
export function decodeJwtPayload(token: string): unknown {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    let json = "";
    if (typeof atob === "function") {
      json = atob(padded);
    } else {
      const BufferImpl = (
        globalThis as {
          Buffer?: {
            from(input: string, encoding: string): { toString(encoding: string): string };
          };
        }
      ).Buffer;
      if (BufferImpl) {
        json = BufferImpl.from(padded, "base64").toString("utf-8");
      }
    }
    if (!json) return undefined;
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Memory-only auth session. `signIn()` stores the session in a signal;
 * `signOut()` clears it. `getToken()` refreshes expired tokens through
 * the `refresh` callback. Nothing is persisted; nothing phones home.
 */
export function createAuthSession(
  options: AuthSessionOptions = {},
): AuthSessionControls {
  const {
    initialSession,
    refresh,
    refreshMarginMs = 60000,
    decodeUser = decodeJwtPayload,
  } = options;

  const [session, setSession] = createSignal<AuthSession | undefined>(
    initialSession,
  );
  const [status, setStatus] = createSignal<AuthStatus>(
    initialSession ? "authenticated" : "unknown",
  );

  const isExpired = (s: AuthSession | undefined): boolean => {
    if (!s) return true;
    if (s.expiresAt === undefined) return false;
    return s.expiresAt - refreshMarginMs < Date.now();
  };

  const applySession = (next: AuthSession | undefined): void => {
    if (!next) {
      setSession(undefined);
      setStatus("unauthenticated");
      return;
    }
    const user = next.user ?? decodeUser(next.token);
    setSession(user === undefined ? next : { ...next, user });
    setStatus("authenticated");
  };

  const signIn = (next: AuthSession): void => {
    applySession(next);
  };

  const signOut = (): void => {
    applySession(undefined);
  };

  const getToken = async (): Promise<string | undefined> => {
    const current = session();
    if (!isExpired(current)) {
      return current?.token;
    }
    if (!refresh) {
      if (current) signOut();
      else setStatus("unauthenticated");
      return undefined;
    }
    setStatus("refreshing");
    try {
      const next = await refresh(current);
      applySession(next ?? undefined);
      return next?.token;
    } catch {
      signOut();
      return undefined;
    }
  };

  return {
    session,
    token: () => session()?.token,
    user: () => session()?.user,
    status,
    isAuthenticated: () => status() === "authenticated",
    authHeader: () => {
      const t = session()?.token;
      return t ? `Bearer ${t}` : undefined;
    },
    signIn,
    signOut,
    getToken,
  };
}
