# Auth

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when managing auth sessions and decoding JWTs.

### Auth session

```tsx
import { createAuthSession, decodeJwtPayload } from "solid-drift";

const auth = createAuthSession({
  initialSession: restored, // from the app's own storage, or omit
  refresh: async (old) => {
    const res = await fetch("/api/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: old?.refreshToken }),
    });
    if (!res.ok) return undefined; // signs out
    return res.json(); // { token, refreshToken?, expiresAt?, user? }
  },
});

auth.signIn({ token, refreshToken, expiresAt, user });
await auth.getToken(); // fresh token, refreshing first when expired
fetch("/api/me", { headers: { authorization: auth.authHeader() ?? "" } });
auth.signOut();
```

`createAuthSession({ initialSession?, refresh?, refreshMarginMs?, decodeUser? })`: `{ session, token, user, status, isAuthenticated, authHeader, signIn, getToken, signOut }`. The session lives in a memory-only signal: tokens are never written to storage by this primitive. `status()` is `"unknown"`, `"authenticated"`, `"unauthenticated"`, or `"refreshing"`. `getToken()` returns the current token, or refreshes it through the `refresh` callback when it is expired (or inside `refreshMarginMs`, default 60s); a failed refresh signs out. `authHeader()` returns `"Bearer <token>"` or undefined. `decodeJwtPayload(token)` decodes a JWT payload without verifying the signature (verification belongs on the server). No OAuth flow is implemented; the app signs in through its own backend and hands the session to `signIn()`. [Try it](https://austinpnguyen.github.io/solid-drift/#/auth/decodeJwtPayload)
