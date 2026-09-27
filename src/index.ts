/**
 * solid-drift: signal-native animation for SolidJS.
 *
 * Animate values, not elements: springs and tweens follow your signals, and
 * retargeting mid-flight is seamless by design.
 */

export { createSpring, type SpringOptions, springPresets } from "./spring.js";
export { createTween, type TweenOptions } from "./tween.js";
export {
  animate,
  type AnimateOptions,
  type AnimationControls,
} from "./animate.js";
export { drift, type DriftProps } from "./directive.js";
export { createScrollProgress, type ScrollTarget } from "./scroll.js";
export { createInView, type InViewOptions } from "./inview.js";
export {
  usePrefersReducedMotion,
  prefersReducedMotion,
} from "./reduced-motion.js";
export {
  isLowPowerMode,
  useLowPowerMode,
  type LowPowerOptions,
} from "./power.js";
export {
  createSlotMachine,
  type SlotMachineControls,
  type SlotMachineOptions,
  type SlotMachineStatus,
  createRedPacket,
  type RedPacketCoin,
  type RedPacketControls,
  type RedPacketOptions,
  type RedPacketStatus,
  createConfetti,
  type ConfettiControls,
  type ConfettiOptions,
  createEmojiBurst,
  type EmojiBurstControls,
  type EmojiBurstOptions,
  createScratch,
  type ScratchControls,
  type ScratchOptions,
} from "./fun.js";
export { createStagger } from "./stagger.js";
export {
  createDebounced,
  createThrottled,
  createLocalStorage,
  type LocalStorageOptions,
  type LocalStorageControls,
  createMediaQuery,
  createClickOutside,
  type ClickOutsideOptions,
  createScrollLock,
  type ScrollLockControls,
  createInfiniteScroll,
  type InfiniteScrollOptions,
} from "./dom.js";
export {
  createHaptic,
  hapticPatterns,
  type HapticOptions,
  type HapticControls,
  type HapticPattern,
  createHapticBeat,
  hapticBeatPresets,
  type HapticBeatOptions,
  type HapticBeatControls,
} from "./haptic.js";
export {
  createBottomSheet,
  type BottomSheetOptions,
  type BottomSheetControls,
} from "./sheet.js";
export {
  createHorizontalScroll,
  type HorizontalScrollOptions,
  type HorizontalScrollResult,
} from "./horizontal.js";
export { createScrub, type ScrubKeyframe, type ScrubOptions } from "./scrub.js";
export {
  createScrollColor,
  type ScrollColorStop,
  type ScrollColorOptions,
  type ScrollColorFormat,
  createScrollTracking,
  type ScrollTrackingOptions,
  createScrollLine,
  type ScrollLineOptions,
  type ScrollLineStyle,
  type ScrollLineAxis,
  type ScrollLineOrigin,
} from "./scrollfx.js";
export { createVelocity, type VelocityOptions } from "./velocity.js";
export {
  createMagnetic,
  type MagneticOptions,
  type MagneticResult,
  createTilt,
  type TiltOptions,
  type TiltResult,
  createTiltCard,
  type TiltCardOptions,
  type TiltCardResult,
} from "./pointer.js";
export { createTrail, type TrailOptions } from "./trail.js";
export {
  createDepixelate,
  type DepixelateOptions,
  type DepixelateStatus,
  type DepixelateControls,
} from "./depixelate.js";
export {
  createTimeline,
  type TimelineStep,
  type TimelineStatus,
  type TimelineControls,
} from "./timeline.js";
export {
  animateFlip,
  type FlipOptions,
  createSharedLayout,
  type SharedLayoutOptions,
  type SharedLayoutResult,
} from "./flip.js";
export {
  createToast,
  type Toast,
  type ToastControls,
  type ToastKind,
  type ToastOptions,
  type ToastQueueOptions,
  type ToastState,
} from "./toast.js";
export {
  createSquashStretch,
  type SquashStretchOptions,
  type SquashStretchResult,
  createFollowThrough,
  type FollowThroughOptions,
  createAnticipation,
  type AnticipationOptions,
  createWobble,
  type WobbleOptions,
  type WobbleResult,
} from "./cartoon.js";
export {
  createGravity,
  type GravityOptions,
  type GravityResult,
  createPendulum,
  type PendulumOptions,
  type PendulumResult,
  createFling,
  type FlingOptions,
  type FlingResult,
} from "./physics.js";
export {
  createFontSwap,
  type FontSwapOptions,
  type FontSwapResult,
  createTyping,
  type TypingOptions,
  type TypingResult,
  createTextPhysics,
  type TextPhysicsOptions,
  type TextPhysicsResult,
  createTextTunnel,
  type TextTunnelOptions,
  type TextTunnelResult,
  createTextCutout,
  type TextCutoutOptions,
  createTextGradient,
  type TextGradientOptions,
  createTextScramble,
  type TextScrambleOptions,
  type TextScrambleResult,
  createTextWave,
  type TextWaveOptions,
  createCountUp,
  type CountUpOptions,
} from "./typography.js";
export {
  easings,
  cubicBezier,
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeOutExpo,
  easeOutBack,
  easeInBack,
  easeInOutBack,
  easeOutElastic,
  easeOutBounce,
  resolveEasing,
  type Easing,
  type EasingName,
} from "./easing.js";

export {
  createKineticType,
  createScenePlayer,
  createShowreel,
  createCamera,
  createColorShift,
  createTransition,
  createBeat,
  createBeatCuts,
} from "./motion.js";
export type {
  KineticTypeFrom,
  KineticTypeOptions,
  KineticTypeStatus,
  KineticTypeControls,
  MotionScene,
  ScenePlayerStatus,
  ScenePlayerControls,
  ShowreelScene,
  ShowreelSceneKind,
  CameraKeyframe,
  CameraOptions,
  ColorShiftOptions,
  ColorShiftStatus,
  ColorShiftControls,
  TransitionType,
  TransitionDirection,
  TransitionOptions,
  TransitionLayerStyle,
  TransitionStatus,
  TransitionControls,
  BeatOptions,
  BeatStatus,
  BeatControls,
  BeatCutOptions,
} from "./motion.js";
export {
  createDrag,
  type DragStatus,
  type DragAxis,
  type DragConstraints,
  type DragEndInfo,
  type DragOptions,
  type DragControls,
  createSwipe,
  type SwipeDirection,
  type SwipeDetails,
  type SwipeOptions,
  type SwipeControls,
} from "./gesture.js";
export {
  createStreamReveal,
  createTokenStream,
  createAgentState,
  createApprovalGate,
  parseDriftSpec,
  createSpecPlayer,
  DriftSpecError,
} from "./ai.js";
export type {
  StreamRevealStatus,
  StreamRevealOptions,
  StreamRevealControls,
  TokenCitation,
  TokenSegment,
  TokenStreamOptions,
  TokenStreamControls,
  AgentState,
  AgentStateTransition,
  AgentStateOptions,
  AgentStateControls,
  ApprovalStatus,
  ApprovalRequest,
  ApprovalGateOptions,
  ApprovalGateControls,
  DriftSpecPrimitive,
  DriftSpecStep,
  DriftSpec,
  SpecPlayerStatus,
  SpecPlayerHooks,
  SpecPlayerControls,
} from "./ai.js";
export {
  createTxLifecycle,
  createTicker,
  createMintReveal,
  createConnectButton,
  createAgentTx,
} from "./web3.js";
export type {
  TxState,
  TxStatusInput,
  TxLifecycleOptions,
  TxLifecycleControls,
  TickerOptions,
  TickerControls,
  MintRevealStatus,
  MintRevealOptions,
  MintRevealControls,
  ConnectButtonOptions,
  ConnectButtonStatus,
  ConnectButtonControls,
  AgentTxState,
  AgentTxProposal,
  AgentTxOptions,
  AgentTxControls,
} from "./web3.js";
export {
  createPoll,
  shortenAddress,
  isAddress,
  formatUnits,
  parseUnits,
  sanitizeOnchain,
  CHAINS,
  createChain,
  createTokenPrice,
  createPriceChange,
  createPriceCompare,
  createGasPrice,
  createBalance,
  createTxReceipt,
  createBlockNumber,
  createChainlinkPrice,
  createNFTMetadata,
  createENS,
  createIdenticon,
} from "./web3data.js";
export type {
  PollStatus,
  PollOptions,
  PollControls,
  ChainInfo,
  SanitizeOnchainOptions,
  TokenPrice,
  TokenPriceOptions,
  PriceChangeOptions,
  GasPriceOptions,
  GasPriceData,
  BalanceOptions,
  BalanceData,
  TxReceiptData,
  TxReceiptOptions,
  BlockNumberOptions,
  ChainlinkPriceOptions,
  NFTMetadata,
  NFTMetadataOptions,
  ENSOptions,
  IdenticonOptions,
} from "./web3data.js";
export {
  createSSEParser,
  createSSE,
  createChatModel,
} from "./stream.js";
export type {
  SSEEvent,
  StreamStatus,
  SSEOptions,
  SSEControls,
  ChatMessage,
  ChatProviderKind,
  CustomChatProvider,
  ChatModelOptions,
  ChatModelControls,
} from "./stream.js";
export {
  createVoiceState,
  createMicLevel,
  createSpeech,
  createWaveform,
  createTTS,
  createThinking,
  createPrompt,
} from "./voice.js";
export type {
  VoiceStatus,
  VoiceStateControls,
  MicLevelOptions,
  MicLevelControls,
  SpeechOptions,
  SpeechControls,
  WaveformOptions,
  WaveformControls,
  TTSProvider,
  TTSOptions,
  TTSControls,
  ThinkingOptions,
  ThinkingControls,
  PromptOptions,
  PromptControls,
} from "./voice.js";
export {
  createBattery,
  createNetwork,
  createWakeLock,
  createContactPick,
  createOTP,
  createShare,
  createNFC,
  createTorch,
  createGyro,
  createShake,
  createScanline,
} from "./hardware.js";
export type {
  BatteryState,
  NetworkState,
  WakeLockState,
  PickedContact,
  ContactPickState,
  OTPState,
  ShareState,
  NFCRecord,
  NFCMessage,
  NFCState,
  TorchState,
  GyroState,
  ShakeOptions,
  ShakeState,
  ScanlineOptions,
  ScanlineState,
} from "./hardware.js";
export { createOptimistic } from "./optimistic.js";
export type { OptimisticControls } from "./optimistic.js";
export { createSkeleton } from "./skeleton.js";
export type { SkeletonOptions, SkeletonControls } from "./skeleton.js";
export { createScrollSpy } from "./scrollspy.js";
export type { ScrollSpyOptions, ScrollSpyControls } from "./scrollspy.js";
export { createCopy } from "./copy.js";
export type { CopyOptions, CopyControls } from "./copy.js";
export { createCountdown } from "./countdown.js";
export type { CountdownOptions, CountdownControls } from "./countdown.js";
export { createMarquee } from "./marquee.js";
export type {
  MarqueeDirection,
  MarqueeOptions,
  MarqueeControls,
} from "./marquee.js";
export { createVariants } from "./variants.js";
export type {
  VariantDef,
  VariantsOptions,
  VariantsControls,
} from "./variants.js";
export { createPathDraw } from "./pathdraw.js";
export type { PathDrawOptions, PathDrawControls } from "./pathdraw.js";
export { createPress, createHover } from "./press.js";
export type {
  PressOptions,
  PressControls,
  HoverOptions,
  HoverControls,
} from "./press.js";
export {
  createColorScheme,
  createIdle,
  createOnline,
  createInstallPrompt,
  createUndo,
  createFullscreen,
} from "./apputils.js";
export type {
  ColorScheme,
  ColorSchemePreference,
  ColorSchemeOptions,
  ColorSchemeControls,
  IdleOptions,
  IdleControls,
  OnlineControls,
  BeforeInstallPromptEvent,
  InstallPromptControls,
  UndoOptions,
  UndoControls,
  FullscreenOptions,
  FullscreenControls,
} from "./apputils.js";
export {
  createPresence,
  createViewTransition,
  createScrollReveal,
} from "./presence.js";
export type {
  PresenceStatus,
  PresenceOptions,
  PresenceControls,
  ViewTransitionControls,
  RevealVariant,
  ScrollRevealOptions,
  ScrollRevealItem,
  ScrollRevealControls,
} from "./presence.js";
export { createOfflineQueue } from "./offline.js";
export type {
  OfflineQueueStatus,
  QueuedMutation,
  OfflineQueueOptions,
  OfflineQueueControls,
} from "./offline.js";
