# Stability and versioning

How solid-drift versions its API, what "stable" means, and what to
expect from future releases.

## Semver policy

solid-drift follows semantic versioning:

- **Patch** (0.44.1): bug fixes, no API changes.
- **Minor** (0.45.0): new primitives, new options, new subpaths. No breaking changes to existing APIs.
- **Major** (1.0.0): breaking changes allowed.

During 0.x, the API is stabilizing. Breaking changes are rare and
always called out in the release notes with a migration path.

## Public API boundary

The public API is:

- The **root entry point** (`solid-drift`): all primitives, utilities,
  and types documented in SKILL.md and the family docs.
- The **18 stable family subpaths** (`solid-drift/core`,
  `solid-drift/gesture`, etc.): one per family, for bundlers that
  prefer granular imports.

What is *not* public API:

- `solid-drift/devtools`: the development overlay (DriftDevtools).
  It is a separate entry point for debugging only, not part of the
  stable family surface. Its API may change without a major bump.
- Internal modules under `dist/`: import only via the documented
  entry points.

## Deprecated aliases

The `use*` aliases (e.g. `useConsent` for `createConsent`,
`useLowPowerMode` for `createLowPowerMode`, `usePrefersReducedMotion`
for `createPrefersReducedMotion`) are deprecated. They still work in
0.x but will be removed in v1.0. Migrate to the `create*` names now;
they are the canonical API.

## Solid 2 plan

solid-drift is built on Solid's primitives (`createSignal`,
`createEffect`, `onCleanup`) and does not depend on Solid internals.
When Solid 2 ships, the library will:

1. Verify all primitives against the Solid 2 reactivity core.
2. Release a minor version with any needed adjustments (no API changes expected).
3. Maintain backward compatibility with Solid 1 for at least one major version.

The signal-native design means the migration risk is low: if
`createSignal` works, solid-drift works.

## Zero dependencies

solid-drift has zero runtime dependencies. It depends only on
`solid-js` as a peer. This will not change: adding a dependency
would be a breaking change requiring a major version bump.
