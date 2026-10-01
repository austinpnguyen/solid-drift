# Changelog

All notable changes to solid-drift are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Release history before 0.30.0 is summarized; per-version notes start at 0.30.0.

## [Unreleased]

### Added
- New `solid-drift/devtools` subpath with the `DriftDevtools` overlay
  component: shows live animation count, measured FPS, and slow-motion
  buttons (0.25x / 0.5x / 1x). It is never imported by the library root,
  so production bundles that do not import it contain zero devtools code.
  The component also renders nothing unless `import.meta.env.DEV` is true
  (or `forceShow` is set), and it is SSR-safe. Engine gains internal
  `setTimeScale` / `getTimeScale` / `getActiveTaskCount` hooks used only
  by devtools; the time scale defaults to 1 and production behavior is
  unchanged.

## [0.43.0] - 2026-10-01

### Added
- Subpath exports for the 18 README families: `solid-drift/core`,
  `solid-drift/scroll`, `solid-drift/pointer`, `solid-drift/gesture`,
  `solid-drift/cartoon`, `solid-drift/typography`,
  `solid-drift/motion-graphics`, `solid-drift/ai`, `solid-drift/web3`,
  `solid-drift/fun`, `solid-drift/utilities`, `solid-drift/offline`,
  `solid-drift/social`, `solid-drift/network`, `solid-drift/browser`,
  `solid-drift/auth`, `solid-drift/analytics`, `solid-drift/easings`.
  Each has a dedicated entry file under `src/groups/` re-exporting the
  family's primitives. The root import is unchanged. Internal modules
  (engine, color, directive, etc.) are not exposed as subpaths.
- Publish workflow now verifies the version appears on npm after
  publishing (retries for 3 minutes, fails the workflow if missing).

### Fixed
- README "Bundle size" section: sizes re-measured minified + gzipped
  per the 18 README families (full lib ~53 KB, not 118 KB); subpath
  docs corrected to note root and subpath imports bundle identically
  thanks to `sideEffects: false`.

### Added
- New `create*` names for the three `use*` primitives: `createConsent`
  (was `useConsent`), `createLowPowerMode` (was `useLowPowerMode`),
  `createPrefersReducedMotion` (was `usePrefersReducedMotion`). The old
  `use*` names remain as `@deprecated` aliases and keep working exactly
  as before; they will be removed in v1.0. No console warnings are
  emitted. Docs, README, SKILL.md, and the playground now use the new
  names.
- `package.json` now declares `sideEffects: false`, so bundlers can
  tree-shake unused primitives.
- README gains a "Bundle size" section with a per-family gzipped size
  table.
- New `docs/recipes.md` with six multi-primitive recipes: price ticker
  with trend flash, staggered scroll entrance, spring toast, draggable
  snap-back card, AI thinking-to-typing sequence, and eased scroll
  progress bar.

## [0.41.9] - 2026-10-01

### Fixed
- `createTicker`: digit strip wrappers now have a fixed one-line height
  (`1em` with `line-height: 1` and `overflow: hidden`), so only the
  current digit shows instead of all ten digits rendering as a column.
- Playground: `core/createStagger` demo numbers are now centered in each
  square with white bold text instead of overlapping the top-left corner.
- Playground: `core/createTween` demo box is now always visible; only its
  position tweens, so the motion reads clearly from v = 0.
- Playground: the `motion-graphics/createPathDraw` demo built the
  `createPathDraw` primitive inside a reactive `createEffect`, which caused
  an infinite reactive update loop (`RangeError: Maximum call stack size
  exceeded`) on the live site. The demo now builds the primitive
  imperatively on mount and rebuilds it explicitly when the duration
  slider changes.

## [0.41.8] - 2026-09-30

### Added
- Playground: deployed to GitHub Pages at
  https://austinpnguyen.github.io/solid-drift/ via a new
  `.github/workflows/pages.yml` (builds `playground/` on every push to
  `main`). README links it as "Live playground" right under the
  description.
- Playground: every demo now has its own URL (`#/<family>/<demo>`, e.g.
  `#/core/createSpring`). Reloading or sharing the link preserves the
  selected demo, and browser back/forward works.
- Docs: 16 of the 18 `docs/families/*.md` files gained "Try it" links
  (39 links) that open the live demo matching each documented primitive.

### Fixed
- Playground: `createSpring` and `createTween` demos measured travel from
  a fixed pixel value and rendered the value label inside the moving box.
  Both now measure the stage width with `createElementSize` and show the
  value outside the box, so nothing overflows on narrow screens.
- Playground: fresh-clone `npm run build` failed with "Cannot find module
  'solid-js'" because library source outside the playground root resolved
  a different Solid copy. The playground Vite config and tsconfig now pin
  `solid-js` to the playground's own install.
- README: the Sponsors section is now hidden until the first sponsor
  exists; the sponsors workflow creates it automatically on the first
  sponsorship and removes it again if the list ever empties.

### Removed
- ROADMAP: dropped the planned onchain sponsor badges idea.

## [0.41.7] - 2026-09-29

### Changed
- README: shortened from 2,182 lines to 104 lines. The full API reference
  moved into 18 files under `docs/families/`, one per primitive family.
  No implementation changes.

## [0.41.6] - 2026-09-29

### Added
- `playground/`: a complete interactive playground (Vite + SolidJS +
  TypeScript) with 40 live demos covering all 18 primitive families. Each
  demo has live controls bound to the primitive's real options and a code
  snippet generated from the current control values. It runs against the
  current library source through an alias, so demos never go stale. Run it
  with `cd playground && npm install && npm run dev`. The playground is
  dev tooling only and is excluded from the npm package.
- README: a new "Local playground" section.

## [0.41.5] - 2026-09-29

### Fixed
- `peerDependencies`: narrowed `solid-js` from `^1.0.0 || ^2.0.0` to
  `^1.0.0`. Tested against `solid-js@2.0.0-rc.11` (no stable 2.x exists
  yet): 63 type errors and 455 of 780 test failures, caused by Solid 2
  breaking changes (single-arg `createEffect` removed, signal writes
  deferred until `flush()`, `batch` removed). The old range promised
  support that does not exist, so it was removed. Solid 2 support will
  be revisited after the stable 2.0 release; it needs a dedicated
  migration, not a version bump.

## [0.41.4] - 2026-09-29

### Changed
- `FUNDING.yml`: removed the `polar` key. GitHub Sponsors is the only
  funding channel. Sponsorship is thank-you only: no consulting, no
  per-sponsor perks, no issue bounties.
- README: the sponsor badge and the sponsor link in "Support the
  project" are commented out until the GitHub Sponsors profile is
  approved, so no visitor lands on a dead page. "Support the project"
  now states that sponsorship does not include support or feature
  requests.

### Added
- README: a new "Sponsors" section, refreshed automatically by a weekly
  GitHub Action (`.github/workflows/sponsors.yml`) from the Sponsors
  API, so no manual edits are ever needed.
- ROADMAP: planned monetization notes (a Pro recipes pack sold
  one-time through Lemon Squeezy or Gumroad, docs ads later). Not built
  yet.

## [0.41.3] - 2026-09-28

### Added
- `FUNDING.yml`: added the `polar` key, so the repo Sponsor button also
  offers Polar issue funding alongside GitHub Sponsors.
- README: the "Support the project" section now points to Polar for
  funding specific features (issue bounties).

## [0.41.2] - 2026-09-27

### Added
- `FUNDING.yml` and a `funding` field in `package.json`: the GitHub
  Sponsors link, so `npm fund` shows where to support the project.
- README: a table of contents after Quick start, and the API regrouped
  into themed sections (Core, Scroll, Pointer and physics, Gesture,
  Cartoon, Typography, Motion graphics, AI and agent UI, Web3, Fun and
  feedback, Utilities, Offline, Social, Network, Browser, Auth,
  Analytics, Easings), each with a "use when" line.
- README: documented previously undocumented exports: `createStagger`,
  `createScrollProgress`, `createInView`, `usePrefersReducedMotion`,
  `prefersReducedMotion`.
- README: a "Support the project" section and a sponsor badge.

### Changed
- `CHANGELOG.md` created; `ROADMAP.md` now tracks future plans only.

## [0.41.1] - 2026-09-27

### Fixed
- `createWaveform` now restarts when a reactive `enabled()` flips from
  false to true. The render loop used to schedule its engine task once at
  creation, so a waveform created while disabled never drew again (the
  engine drops tasks that return false). The loop is now armed and
  disarmed by a reactive effect on `enabled()`: it starts when enabled
  becomes true, parks when false, and cleans up on disposal. Plain
  boolean `enabled` keeps the previous one-shot behavior.

### Added
- `src/waveform.test.ts`: regression tests for disabled-to-enabled
  re-arm, enabled-to-disabled parking, default-enabled drawing, and
  plain-boolean `false`.

## [0.41.0] - 2026-09-27

### Added
- Analytics lite family: `createTracker` (bring-your-own-backend event
  tracker; events are only sent through an application-provided sink),
  `useConsent` (consent state), `createFunnel` (conversion rates from
  plain step arrays).
- Everything intended for 0.40.0 (`createAuthSession`,
  `decodeJwtPayload`); see the 0.40.0 note below.

## [0.40.0] - 2026-09-27

### Note
- Tagged on GitHub but never published to npm: its CI run failed on a
  flaky red-packet gravity test. Re-running was deliberately skipped
  because `npm publish` would have moved the `latest` dist-tag backward
  from 0.41.0 to 0.40.0. All 0.40.0 code (`createAuthSession`,
  `decodeJwtPayload`) shipped in 0.41.0 instead, so the registry never
  missed it.

## [0.39.0] - 2026-09-27

### Added
- Browser API family: `createGeolocation`, `createElementSize`,
  `createEventListener`, `createHotkey`, `createTimeAgo`,
  `createPermission`, `createScriptLoader`.

## [0.38.0] - 2026-09-27

### Added
- Network family: `createApi`, `createWebSocket`, `createSearch`,
  `createUpload`, `createPagination`, `verifyWebhookSignature`.

## [0.37.0] - 2026-09-27

### Added
- Social kit: `validatePost` (pre-flight validator for text, media, and
  platform limits), `normalizeAnalytics` (unified shape for per-platform
  analytics payloads).

## [0.36.0] - 2026-09-27

### Added
- `createOfflineQueue`: offline mutation queue that replays on
  reconnect, pairing with `createOnline` and `createNetwork`.

### Fixed
- `createOfflineQueue.flush()` race that could drop mutations enqueued
  while an earlier send was still pending.

## [0.35.0] - 2026-09-27

### Added
- `sanitizeOnchain`: pure sanitizer for untrusted onchain strings (token
  names, memos, ENS labels), safe for `innerHTML`.

## [0.34.0] - 2026-09-27

### Added
- Agent trust family: `createApprovalGate` (human-in-the-loop for agent
  flows), `createTokenStream` (streamed text with citation chips).

## [0.33.0] - 2026-09-27

### Added
- Animation presence family: `createPresence` (exit animations that run
  before unmount), `createViewTransition` (View Transitions API wrapper
  with fallback), `createScrollReveal` (scroll-triggered reveal
  choreography with stagger and variants).

## [0.32.0] - 2026-09-26

### Added
- App utilities: `createColorScheme`, `createIdle`, `createOnline`,
  `createInstallPrompt`, `createUndo`, `createFullscreen`.

## [0.31.0] - 2026-09-26

### Added
- `createMarquee` (infinite scroller), `createVariants` (named animation
  states), `createPathDraw` (SVG stroke draw-on), `createPress` and
  `createHover` (press and hover gesture state).

## [0.30.0] - 2026-09-26

### Added
- `createCopy` (clipboard with fallback), `createCountdown`
  (countdown to a date or timestamp).

## 0.7.1 to 0.29.0

Early development releases that built the animation core (springs,
tweens, the `drift` directive, timelines, stagger), scroll and pointer
primitives, gestures, cartoon and physics families, typography effects,
motion graphics, agent UI, the Web3 family, and the fun family
(toasts, slot machine, red packet, confetti, emoji burst, scratch).
Per-version notes were not kept for these releases; see the commit
history for details.
