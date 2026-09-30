import type { Component } from "solid-js";

import { SpringDemo } from "./core/spring";
import { TweenDemo } from "./core/tween";
import { AnimateDemo } from "./core/animate";
import { StaggerDemo } from "./core/stagger";
import { DriftDemo } from "./core/drift";
import { ScrollProgressDemo } from "./scroll/scroll-progress";
import { InViewDemo } from "./scroll/in-view";
import { EasingCurvesDemo } from "./easings/easing-curves";
import { TiltCardDemo } from "./pointer/tilt-card";
import { MagneticDemo } from "./pointer/magnetic";
import { DragDemo } from "./gesture/drag";
import { SwipeDemo } from "./gesture/swipe";
import { PressHoverDemo } from "./gesture/press-hover";
import { SquashStretchDemo } from "./cartoon/squash-stretch";
import { WobbleDemo } from "./cartoon/wobble";
import { AnticipationDemo } from "./cartoon/anticipation";
import { TypingDemo } from "./typography/typing";
import { CountUpDemo } from "./typography/count-up";
import { KineticTypeDemo } from "./typography/kinetic-type";
import { PathDrawDemo } from "./motion-graphics/path-draw";
import { MarqueeDemo } from "./motion-graphics/marquee";
import { ConfettiDemo } from "./fun/confetti";
import { SlotMachineDemo } from "./fun/slot-machine";
import { RedPacketDemo } from "./fun/red-packet";
import { ToastDemo } from "./fun/toast";
import { StreamRevealDemo } from "./ai/stream-reveal";
import { ThinkingDemo } from "./ai/thinking";
import { ApprovalGateDemo } from "./ai/approval-gate";
import { TickerDemo } from "./web3/ticker";
import { AddressUtilsDemo } from "./web3/address-utils";
import { ValidatePostDemo } from "./social/validate-post";
import { WebhookVerifyDemo } from "./network/webhook-verify";
import { ConsentDemo } from "./analytics/consent";
import { JwtDecodeDemo } from "./auth/jwt-decode";
import { TimeAgoDemo } from "./browser/time-ago";
import { OfflineQueueDemo } from "./offline/offline-queue";
import { CopyDemo } from "./utilities/copy";
import { CountdownDemo } from "./utilities/countdown";
import { HapticDemo } from "./utilities/haptic";
import { MediaQueryDemo } from "./utilities/media-query";

/* Demo registry. Adding a new demo is two steps:
   1. Write the component in src/demos/<family>/<demo>.tsx using DemoShell
      and the shared controls.
   2. Add one entry to the right family below (about ten lines).
   The entry id is the demo's URL slug: #/<family>/<id>. Use the
   primitive's export name when the demo showcases one primitive
   (createSpring, validatePost); a short kebab-case name otherwise
   (press-hover, address-utils). */

export interface DemoEntry {
  id: string;
  title: string;
  description: string;
  component: Component;
}

export interface DemoFamily {
  id: string;
  name: string;
  useWhen: string;
  demos: DemoEntry[];
}

function entry(
  id: string,
  title: string,
  description: string,
  component: Component,
): DemoEntry {
  return { id, title, description, component };
}

export const families: DemoFamily[] = [
  {
    id: "core",
    name: "Core",
    useWhen:
      "Basic building blocks: springs, tweens, staggered lists, timelines, imperative animation.",
    demos: [
      entry(
        "createSpring",
        "createSpring",
        "A signal that chases its target with spring physics.",
        SpringDemo,
      ),
      entry(
        "createTween",
        "createTween",
        "A signal that tweens toward its source over a fixed duration.",
        TweenDemo,
      ),
      entry(
        "animate",
        "animate",
        "Imperative one-shot animation with per-frame updates and a finished promise.",
        AnimateDemo,
      ),
      entry(
        "createStagger",
        "createStagger",
        "A delay lookup so list items entrance one after another.",
        StaggerDemo,
      ),
      entry(
        "drift",
        "drift directive",
        "Binds signals straight to an element's style with use:drift.",
        DriftDemo,
      ),
    ],
  },
  {
    id: "scroll",
    name: "Scroll",
    useWhen: "Animation or state that follows scroll position.",
    demos: [
      entry(
        "createScrollProgress",
        "createScrollProgress",
        "A 0..1 signal tracking scroll progress for the page or one element.",
        ScrollProgressDemo,
      ),
      entry(
        "createInView",
        "createInView",
        "A boolean signal reporting whether an element is visible.",
        InViewDemo,
      ),
    ],
  },
  {
    id: "pointer",
    name: "Pointer and physics",
    useWhen: "Elements that react to the pointer or simulate real physics.",
    demos: [
      entry(
        "createTiltCard",
        "Tilt Card",
        "Holographic 3D card tilt with glare and shine that follow the pointer.",
        TiltCardDemo,
      ),
      entry(
        "createMagnetic",
        "Magnetic Button",
        "A button that gets pulled toward the pointer and springs back on release.",
        MagneticDemo,
      ),
    ],
  },
  {
    id: "gesture",
    name: "Gesture",
    useWhen: "Drag or swipe interactions with touch parity.",
    demos: [
      entry(
        "createDrag",
        "Drag",
        "Draggable box with axis lock, elastic constraints, and momentum.",
        DragDemo,
      ),
      entry(
        "createSwipe",
        "Swipe",
        "Swipe the card left or right; direction, distance, and velocity are reported.",
        SwipeDemo,
      ),
      entry(
        "press-hover",
        "Press and Hover",
        "Button state that reacts to press and hover, with keyboard parity.",
        PressHoverDemo,
      ),
    ],
  },
  {
    id: "cartoon",
    name: "Cartoon",
    useWhen: "Cartoon-style motion: squash, anticipation, wobble.",
    demos: [
      entry(
        "createSquashStretch",
        "Squash and Stretch",
        "A bouncing ball that stretches in flight and pancakes on impact.",
        SquashStretchDemo,
      ),
      entry(
        "createWobble",
        "Wobble",
        "Jelly badge that wobbles with decaying rotation and counter-phase scale.",
        WobbleDemo,
      ),
      entry(
        "createAnticipation",
        "Anticipation",
        "A box that winds up backwards, holds, then jumps forward.",
        AnticipationDemo,
      ),
    ],
  },
  {
    id: "typography",
    name: "Typography",
    useWhen: "Text itself as the animation.",
    demos: [
      entry(
        "createTyping",
        "Typing",
        "Types out text with human-like timing jitter and a blinking cursor.",
        TypingDemo,
      ),
      entry(
        "createCountUp",
        "Count Up",
        "A numeric signal glides to each new value as a formatted string.",
        CountUpDemo,
      ),
      entry(
        "createKineticType",
        "Kinetic Type",
        "Characters fly in with blur, scale and position on one master clock.",
        KineticTypeDemo,
      ),
    ],
  },
  {
    id: "motion-graphics",
    name: "Motion graphics",
    useWhen: "Directing scenes: cameras, cuts, beats, showreels.",
    demos: [
      entry(
        "createPathDraw",
        "Path Draw",
        "An SVG stroke draws itself on via animated stroke-dashoffset.",
        PathDrawDemo,
      ),
      entry(
        "createMarquee",
        "Marquee",
        "An infinite scroller with a doubled strip looping seamlessly.",
        MarqueeDemo,
      ),
    ],
  },
  {
    id: "ai",
    name: "AI and agent UI",
    useWhen: "AI chat, voice, streaming, and agent interfaces.",
    demos: [
      entry(
        "createStreamReveal",
        "Stream Reveal",
        "Simulated LLM tokens revealing with calm, batched entrances.",
        StreamRevealDemo,
      ),
      entry(
        "createThinking",
        "Thinking Indicator",
        "Voice-style thinking label that cycles dots, then phrases.",
        ThinkingDemo,
      ),
      entry(
        "createApprovalGate",
        "Approval Gate",
        "Human-in-the-loop approval for agent actions.",
        ApprovalGateDemo,
      ),
    ],
  },
  {
    id: "web3",
    name: "Web3",
    useWhen: "Onchain UI: transactions, prices, NFTs, identity.",
    demos: [
      entry(
        "createTicker",
        "Price Ticker",
        "Per-digit roll with a direction flash on every update.",
        TickerDemo,
      ),
      entry(
        "address-utils",
        "Address Utils",
        "Validate, shorten, and format EVM addresses and amounts.",
        AddressUtilsDemo,
      ),
    ],
  },
  {
    id: "fun",
    name: "Fun and feedback",
    useWhen: "Delight: toasts, gacha, confetti, scratch-offs.",
    demos: [
      entry(
        "createConfetti",
        "Confetti",
        "Celebration bursts of confetti particles on a canvas layer.",
        ConfettiDemo,
      ),
      entry(
        "createSlotMachine",
        "Slot Machine",
        "Gacha reels that launch fast and stop left to right.",
        SlotMachineDemo,
      ),
      entry(
        "createRedPacket",
        "Red Packet",
        "Tap the envelope: coins burst out and the amount reveals.",
        RedPacketDemo,
      ),
      entry(
        "createToast",
        "Toast",
        "A signal-native toast queue with a choreographed lifecycle.",
        ToastDemo,
      ),
    ],
  },
  {
    id: "utilities",
    name: "Utilities",
    useWhen: "Everyday app glue: DOM helpers, haptics, storage, gesture state.",
    demos: [
      entry(
        "createCopy",
        "Copy to clipboard",
        "Copy text with a built-in copied flag for transient feedback.",
        CopyDemo,
      ),
      entry(
        "createCountdown",
        "Countdown",
        "Countdown to a wall-clock moment with start, pause, and reset.",
        CountdownDemo,
      ),
      entry(
        "createHaptic",
        "Haptics",
        "Tactile presets through the Vibration API with an enabled switch.",
        HapticDemo,
      ),
      entry(
        "createMediaQuery",
        "Media query",
        "Boolean signals that track CSS media queries and update live.",
        MediaQueryDemo,
      ),
    ],
  },
  {
    id: "offline",
    name: "Offline",
    useWhen: "Mutations that survive flaky networks.",
    demos: [
      entry(
        "createOfflineQueue",
        "Offline queue",
        "Mutations that wait while offline and replay in order on reconnect.",
        OfflineQueueDemo,
      ),
    ],
  },
  {
    id: "social",
    name: "Social",
    useWhen: "Validating posts and normalizing analytics across platforms.",
    demos: [
      entry(
        "validatePost",
        "Validate Post",
        "Check a draft against platform character limits.",
        ValidatePostDemo,
      ),
    ],
  },
  {
    id: "network",
    name: "Network",
    useWhen: "Talking to HTTP APIs, WebSockets, uploads, verifying webhooks.",
    demos: [
      entry(
        "verifyWebhookSignature",
        "Webhook Verify",
        "Sign a payload locally, then verify it with the library.",
        WebhookVerifyDemo,
      ),
    ],
  },
  {
    id: "browser",
    name: "Browser",
    useWhen: "Browser and mobile hardware APIs wrapped as signals.",
    demos: [
      entry(
        "createTimeAgo",
        "Time ago",
        "Relative timestamps that refresh on an interval, in any locale.",
        TimeAgoDemo,
      ),
    ],
  },
  {
    id: "auth",
    name: "Auth",
    useWhen: "Auth sessions and JWT decoding.",
    demos: [
      entry(
        "decodeJwtPayload",
        "JWT decode",
        "Read the claims out of a JWT payload without verifying its signature.",
        JwtDecodeDemo,
      ),
    ],
  },
  {
    id: "analytics",
    name: "Analytics",
    useWhen: "Lightweight, consent-aware analytics.",
    demos: [
      entry(
        "useConsent",
        "Consent banner",
        "A cookie consent banner: accept, decline, persist the choice, reset.",
        ConsentDemo,
      ),
    ],
  },
  {
    id: "easings",
    name: "Easings",
    useWhen: "The easing curves everything runs on.",
    demos: [
      entry(
        "easings",
        "Easing curves",
        "Plot every easing in the library and ride a dot along the curve.",
        EasingCurvesDemo,
      ),
    ],
  },
];

export function findDemo(
  familyId: string,
  demoId: string,
): { family: DemoFamily; demo: DemoEntry } | null {
  const fam = families.find((f) => f.id === familyId);
  const demo = fam?.demos.find((d) => d.id === demoId);
  return fam && demo ? { family: fam, demo } : null;
}
