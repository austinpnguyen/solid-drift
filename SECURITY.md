# Security Policy

## Reporting a vulnerability

If you find a security issue in solid-drift, please report it
privately:

- Email: austinnguyen89@gmail.com
- Subject: `[solid-drift security] <brief description>`

Include:
- A description of the vulnerability
- Steps to reproduce (code or repo link)
- The affected version(s)
- Your assessment of impact, if any

Please do not open a public GitHub issue for security reports.

## Scope

solid-drift is a client-side animation library with zero runtime
dependencies. Its attack surface is small:

- **No network calls**: the library never fetches, sends, or receives
  data. All streaming primitives (`createChatModel`, `createTokenStream`)
  work with URLs and callbacks you provide; the library does not choose
  endpoints or handle credentials beyond passing through the options you set.
- **No eval or dynamic code**: no `eval`, `new Function`, or dynamic
  script injection. See the [CSP notes](docs/ssr.md#content-security-policy).
- **No DOM injection**: primitives set styles via property bindings,
  not `innerHTML`. Markdown rendering in recipes is your code, sanitize
  it with your library of choice.

## What to check in your app

- **API keys**: `createChatModel` accepts an `apiKey` option. Never
  hardcode keys in client bundles; use a server proxy route (see the
  [Anthropic recipe](docs/recipes.md#stream-from-the-anthropic-sdk-with-markdown-safe-rendering)).
- **Markdown**: if you render streamed markdown, sanitize it. The
  dangling-fence guard in the recipes prevents parser crashes, not XSS.
- **CSP**: the library works under strict CSP without
  `unsafe-inline` or `unsafe-eval`.

## Dependencies

solid-drift has zero runtime dependencies. Security updates to the
library itself are released as patch versions. The playground and
starter template have their own lockfiles; audit them with
`npm audit` in those directories.
