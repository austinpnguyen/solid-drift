# Changelog

All notable changes to solid-drift are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Release history before 0.30.0 is summarized; per-version notes start at 0.30.0.

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
