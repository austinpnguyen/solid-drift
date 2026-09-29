# Motion graphics

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when you are directing scenes: cameras, cuts, beats, showreels.

### `createScenePlayer(scenes)`

Scene orchestrator for showreels and launch films: an ordered list of scenes, each with a `duration` and `onEnter`/`onExit` hooks. `scene()` tells your view which scene is live; the hooks trigger each scene's choreography (a `createKineticType`, a camera move, a color shift).

```ts
const player = createScenePlayer([
  { duration: 1200, onEnter: () => hookTitle.play() },
  { duration: 2000, onEnter: () => cameraZoom.play() },
  { duration: 1500, onEnter: () => showLogo() }, // final frame
]);
await player.play(); // resolves after the last scene
```

Returns `{ scene, status, play, pause, stop, replay, next, prev, goTo }`. `pause()` freezes the clock and `play()` resumes where it left off. Under reduced motion `play()` jumps straight to the last scene (the clean final frame).

### `createCamera(keyframes, options)`

Camera moves for a motion-design stage: pan (`x`/`y` in px) and zoom (`scale`) through keyframes, driven by a 0-to-1 progress signal. Returns a compositor-friendly transform string (`translate3d(...) scale(...)`).

```tsx
const [p, setP] = createSignal(0);
const cam = createCamera(
  [
    { at: 0, x: 0, y: 0, scale: 1 },
    { at: 1, x: -120, y: 40, scale: 1.6, easing: "easeInOutCubic" },
  ],
  { progress: p },
);
<div style={{ transform: cam() }}>...</div>
```

Keyframes sort themselves by `at`; progress outside the range clamps to the end poses. Pure computation, no listeners. Under reduced motion it holds the final keyframe's pose.

### `createColorShift(stops, options?)`

Time-based color interpolation across stops: the sibling of `createScrollColor` for motion graphics, where color shifts run on a clock instead of scroll. Colors interpolate in linear light and alpha channels interpolate too.

```ts
const shift = createColorShift(
  [
    { at: 0, color: "#0a1220" },
    { at: 0.5, color: "#2f8fdd" },
    { at: 1, color: "#d9a441", easing: "easeInOutQuad" },
  ],
  { duration: 2000, format: "hex" },
);
shift.color(); // "#0a1220" ... "#d9a441" as it plays
await shift.play();
```

Returns `{ color, play, stop, replay, status }`. Under reduced motion `play()` jumps to the final stop's color.

### `createTransition(options?)`

Match-cut style scene handoffs: `outgoing()` and `incoming()` return style objects for the two scene layers, driven by one 0-to-1 progress.

```tsx
const cut = createTransition({ type: "wipe", direction: "left", duration: 600 });
const go = async () => {
  showSceneB();
  await cut.play();
};
<div style={cut.outgoing()}>{sceneA}</div>
<div style={cut.incoming()}>{sceneB}</div>
```

Types: `"cut"` (instant swap), `"fade"` (crossfade), `"slide"` (layers move in opposite directions), `"wipe"` (incoming scene reveals over the outgoing one with a clip-path). Directions for slide/wipe: `"left"`, `"right"`, `"up"`, `"down"`. Everything animates on opacity, transform, or clip-path, so handoffs stay on the compositor. Under reduced motion every type degrades to a cut.

### `createBeat(options?)`

A beat clock for cutting on the music: `onBeat` fires your scene cuts, kinetic type replays, or color shifts in time. `phase()` gives the fractional position inside the current beat for syncing continuous motion to the rhythm.

```ts
const beat = createBeat({ bpm: 128, beatsPerBar: 4 });
const off = beat.onBeat((b) => {
  if (b % 8 === 0) player.next(); // cut scenes every 2 bars
});
beat.start();
```

Returns `{ beat, bar, beatsPerBar, phase, onBeat, start, stop, status }`. `onBeat` returns an unsubscribe function. Beats are timing, not motion, so the clock keeps ticking under reduced motion (your callbacks decide what that means visually).

### `createShowreel(scenes)`

A guided showreel recipe on top of `createScenePlayer`: scenes carry a `kind` label (`"title"`, `"camera"`, `"color"`, `"cut"`, `"custom"`) so the reel reads like a shot list. It returns the full scene player controls, so `play`, `pause`, `next`, `prev`, and `goTo` all work unchanged.

```ts
const reel = createShowreel([
  { kind: "title", duration: 1200, onEnter: () => titleCard.play() },
  { kind: "camera", duration: 2000, onEnter: () => dolly.play() },
  { kind: "color", duration: 1500, onEnter: () => finale.play() },
  { kind: "cut", duration: 400, onEnter: () => wipe.play() },
]);
await reel.play(); // resolves after the last scene
```

Showreel recipe: combine `createKineticType` (title cards), `createCamera` (dolly moves), `createColorShift` (finale grade), `createTransition` (match cuts), `createBeat` (rhythm), and `createShowreel` (the shot list). Under reduced motion `play()` jumps straight to the last scene.

### `createBeatCuts(beat, player, options?)`

Beat-synced scene cuts: advances the player every N beats through the beat clock's `onBeat`. The default interval is the beat clock's `beatsPerBar`, so a cut lands on every downbeat. Returns a cleanup function that unsubscribes the cut listener.

```ts
const beat = createBeat({ bpm: 128, beatsPerBar: 4 });
const stopCuts = createBeatCuts(beat, player); // cut every bar
// const stopCuts = createBeatCuts(beat, player, { every: 8 }); // every 2 bars
beat.start();
await player.play();
stopCuts();
```

Cuts only fire while the player is running, so pausing the reel pauses the cuts too. Beat timing is not motion, so cuts keep firing under reduced motion (pair with a reduced-motion-safe `onEnter` if the cut itself animates).
