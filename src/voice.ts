import { createSignal, onCleanup, type Accessor } from "solid-js";
import { schedule } from "./engine.js";
import { prefersReducedMotion } from "./reduced-motion.js";

type MaybeElement = () => Element | null | undefined;

/* ------------------------------------------------------------------ */
/* Shared browser globals (stub-friendly for tests)                     */
/* ------------------------------------------------------------------ */

const g = globalThis as Record<string, unknown>;

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const ctor = g["SpeechRecognition"] ?? g["webkitSpeechRecognition"];
  return (ctor as (new () => SpeechRecognitionLike) | undefined) ?? null;
}

function getAudioContextCtor(): (new () => AudioContextLike) | null {
  const ctor = g["AudioContext"] ?? g["webkitAudioContext"];
  return (ctor as (new () => AudioContextLike) | undefined) ?? null;
}

/* Minimal structural types for non-standard web APIs. */

interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
  readonly length: number;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResultLike> & { readonly length: number };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface AnalyserNodeLike {
  fftSize: number;
  readonly frequencyBinCount: number;
  getByteTimeDomainData(array: Uint8Array): void;
  getByteFrequencyData(array: Uint8Array): void;
  connect(destination: unknown): void;
}

interface AudioContextLike {
  readonly state: string;
  createMediaStreamSource(stream: unknown): { connect(node: unknown): void };
  createAnalyser(): AnalyserNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* createVoiceState                                                      */
/* ------------------------------------------------------------------ */

/** Phase of a voice interaction. */
export type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceStateControls {
  /** Current phase. */
  state: Accessor<VoiceStatus>;
  toIdle: () => void;
  toListening: () => void;
  toThinking: () => void;
  toSpeaking: () => void;
}

/**
 * The state machine behind a voice assistant turn: the user speaks
 * (`listening`), the app works (`thinking`), the app replies
 * (`speaking`), then back to `idle`. Wire the phases to
 * `createSpeech` (listening), your model call (thinking), and
 * `createTTS` (speaking).
 *
 * ```ts
 * const voice = createVoiceState();
 * voice.toListening();          // mic open
 * // ... transcript arrives
 * voice.toThinking();           // calling the model
 * // ... reply ready
 * voice.toSpeaking();           // TTS playing
 * voice.toIdle();
 * ```
 */
export function createVoiceState(): VoiceStateControls {
  const [state, setState] = createSignal<VoiceStatus>("idle");
  return {
    state,
    toIdle: () => setState("idle"),
    toListening: () => setState("listening"),
    toThinking: () => setState("thinking"),
    toSpeaking: () => setState("speaking"),
  };
}

/* ------------------------------------------------------------------ */
/* createMicLevel                                                        */
/* ------------------------------------------------------------------ */

export interface MicLevelOptions {
  /** Analyser FFT size. Default 512. */
  fftSize?: number;
  /** EMA smoothing factor 0..1 (higher = smoother). Default 0.7. */
  smoothing?: number;
  /** Gain applied to the RMS before clamping to 0..1. Default 3. */
  gain?: number;
  /** Use an existing stream instead of requesting the microphone. */
  stream?: MediaStream;
  /** Called with each smoothed level. */
  onLevel?: (level: number) => void;
}

export interface MicLevelControls {
  /** Smoothed volume 0..1. */
  level: Accessor<number>;
  /** Whether the meter is running. */
  active: Accessor<boolean>;
  /** False on the server or without WebAudio/getUserMedia. */
  supported: boolean;
  /** The analyser node, for wiring into `createWaveform`. */
  analyser: Accessor<AnalyserNode | null>;
  /** The last error, if any. */
  error: Accessor<Error | null>;
  /** Request the mic (call from a user gesture) and start metering. */
  start: () => Promise<void>;
  /** Stop metering and release the microphone. */
  stop: () => void;
}

/**
 * A live microphone volume meter: `getUserMedia` plus an
 * `AnalyserNode`, smoothed to a 0..1 level signal.
 *
 * ```ts
 * const mic = createMicLevel();
 * // in a click handler:
 * await mic.start();
 * <div style={{ width: `${mic.level() * 100}%` }} />
 * ```
 *
 * SSR-safe: `supported` is false without WebAudio/getUserMedia and
 * `start()` rejects there.
 */
export function createMicLevel(options: MicLevelOptions = {}): MicLevelControls {
  const { fftSize = 512, smoothing = 0.7, gain = 3, onLevel } = options;

  const [level, setLevel] = createSignal(0);
  const [active, setActive] = createSignal(false);
  const [analyser, setAnalyser] =
    createSignal<AnalyserNode | null>(null);
  const [error, setError] = createSignal<Error | null>(null);

  const supported =
    getAudioContextCtor() !== null &&
    typeof (g["navigator"] as Navigator | undefined)?.mediaDevices
      ?.getUserMedia === "function";

  let context: AudioContextLike | null = null;
  let stream: MediaStream | null = null;
  let ownsStream = false;
  let cancelLoop: (() => void) | null = null;
  let current = 0;

  const stop = (): void => {
    cancelLoop?.();
    cancelLoop = null;
    if (ownsStream) {
      stream?.getTracks().forEach((t) => t.stop());
    }
    stream = null;
    ownsStream = false;
    if (context) {
      void context.close().catch(() => {});
      context = null;
    }
    setAnalyser(null);
    current = 0;
    setLevel(0);
    setActive(false);
  };

  const start = async (): Promise<void> => {
    if (active()) return;
    setError(null);
    try {
      const Ctor = getAudioContextCtor();
      const gum = (g["navigator"] as Navigator | undefined)?.mediaDevices
        ?.getUserMedia;
      if (!Ctor || !gum) {
        throw new Error(
          "createMicLevel: WebAudio or getUserMedia is not available",
        );
      }
      if (options.stream) {
        stream = options.stream;
        ownsStream = false;
      } else {
        stream = await gum.call(
          (g["navigator"] as Navigator).mediaDevices,
          { audio: true },
        );
        ownsStream = true;
      }
      context = new Ctor();
      if (context.state === "suspended") {
        await context.resume().catch(() => {});
      }
      const node = context.createAnalyser();
      node.fftSize = fftSize;
      context.createMediaStreamSource(stream).connect(node);
      setAnalyser(node as unknown as AnalyserNode);
      const data = new Uint8Array(node.frequencyBinCount);
      setActive(true);
      cancelLoop = schedule(() => {
        if (!active()) return false;
        node.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const target = Math.min(1, rms * gain);
        current = smoothing * current + (1 - smoothing) * target;
        setLevel(current);
        onLevel?.(current);
        return true;
      });
    } catch (e) {
      stop();
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    }
  };

  onCleanup(stop);

  return { level, active, supported, analyser, error, start, stop };
}

/* ------------------------------------------------------------------ */
/* createSpeech (speech-to-text)                                         */
/* ------------------------------------------------------------------ */

export interface SpeechOptions {
  /** BCP-47 language tag. Default the browser language. */
  lang?: string;
  /** Keep listening across utterances. Default false. */
  continuous?: boolean;
  /** Emit interim (non-final) results. Default true. */
  interimResults?: boolean;
  /** Called per result: the result text and whether it is final. */
  onResult?: (transcript: string, isFinal: boolean) => void;
  /** Called on recognition errors. */
  onError?: (error: Error) => void;
}

export interface SpeechControls {
  /** False on the server or without the Web Speech API. */
  supported: boolean;
  /** Whether recognition is running. */
  listening: Accessor<boolean>;
  /** Accumulated final transcript. */
  transcript: Accessor<string>;
  /** Latest interim transcript (empty when the last result was final). */
  interim: Accessor<string>;
  /** The last error, if any. */
  error: Accessor<Error | null>;
  /** Start listening (call from a user gesture). */
  start: () => void;
  /** Stop listening. */
  stop: () => void;
  /** Clear the accumulated transcript. */
  reset: () => void;
}

/**
 * Speech-to-text via the Web Speech API (`SpeechRecognition` with
 * `webkitSpeechRecognition` fallback).
 *
 * ```ts
 * const speech = createSpeech({ lang: "en-US" });
 * // in a click handler:
 * speech.start();
 * <p>{speech.transcript()}<span class="dim">{speech.interim()}</span></p>
 * ```
 *
 * SSR-safe: `supported` is false without the API and `start()` is a
 * no-op there. Note the API itself is a browser/cloud service with
 * per-browser availability and limits.
 */
export function createSpeech(options: SpeechOptions = {}): SpeechControls {
  const {
    continuous = false,
    interimResults = true,
    onResult,
    onError,
  } = options;

  const [listening, setListening] = createSignal(false);
  const [transcript, setTranscript] = createSignal("");
  const [interim, setInterim] = createSignal("");
  const [error, setError] = createSignal<Error | null>(null);

  const Ctor = getSpeechRecognitionCtor();
  const supported = Ctor !== null;

  let recognition: SpeechRecognitionLike | null = null;
  let wantListening = false;

  const ensure = (): SpeechRecognitionLike | null => {
    if (!Ctor) return null;
    if (!recognition) {
      recognition = new Ctor();
      recognition.lang =
        options.lang ??
        (g["navigator"] as Navigator | undefined)?.language ??
        "en-US";
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.onstart = () => setListening(true);
      recognition.onresult = (event) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) {
            setTranscript((prev) => prev + text);
            onResult?.(text, true);
          } else {
            interimText += text;
            onResult?.(text, false);
          }
        }
        setInterim(interimText);
      };
      recognition.onerror = (event) => {
        const err = new Error(
          `Speech recognition error: ${event.error}${event.message ? ` - ${event.message}` : ""}`,
        );
        setError(err);
        onError?.(err);
      };
      recognition.onend = () => {
        setListening(false);
        // Chrome ends the session on silence even when continuous;
        // restart while the user still wants to listen.
        if (wantListening && continuous && recognition) {
          try {
            recognition.start();
          } catch {
            wantListening = false;
          }
        }
      };
    }
    return recognition;
  };

  const start = (): void => {
    const rec = ensure();
    if (!rec) return;
    setError(null);
    wantListening = true;
    try {
      rec.start();
    } catch {
      // Already started; the running session stands.
    }
  };

  const stop = (): void => {
    wantListening = false;
    try {
      recognition?.stop();
    } catch {
      // Already stopped.
    }
    setListening(false);
  };

  const reset = (): void => {
    setTranscript("");
    setInterim("");
  };

  onCleanup(stop);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}

/* ------------------------------------------------------------------ */
/* createWaveform                                                        */
/* ------------------------------------------------------------------ */

export interface WaveformOptions {
  /** Analyser node to draw (wire to `createMicLevel().analyser`). */
  analyser: () => AnalyserNode | null;
  /** Stroke color. Default "#3e6c99". */
  color?: string;
  /** Line width in px. Default 2. */
  lineWidth?: number;
  /** `"line"` draws the time-domain wave, `"bars"` the spectrum. Default `"line"`. */
  mode?: "line" | "bars";
  /** Background fill, or null for a transparent clear. Default null. */
  background?: string | null;
  /** Pause rendering. Default true. */
  enabled?: boolean | Accessor<boolean>;
}

export interface WaveformControls {
  /** Whether the render loop is running. */
  active: Accessor<boolean>;
}

/**
 * A canvas waveform renderer driven by an `AnalyserNode`.
 *
 * ```tsx
 * const mic = createMicLevel();
 * createWaveform(() => canvas, { analyser: mic.analyser, mode: "bars" });
 * <canvas ref={canvas} style={{ width: "100%", height: "64px" }} />
 * ```
 *
 * The canvas is sized to its CSS box times the device pixel ratio.
 * Under reduced motion it redraws at most every 250ms. SSR-safe:
 * nothing renders without a canvas.
 */
export function createWaveform(
  canvas: MaybeElement,
  options: WaveformOptions,
): WaveformControls {
  const {
    analyser,
    color = "#3e6c99",
    lineWidth = 2,
    mode = "line",
    background = null,
    enabled = true,
  } = options;

  const [active, setActive] = createSignal(false);
  const isEnabled = (): boolean =>
    typeof enabled === "function" ? enabled() : enabled;

  if (typeof window === "undefined") return { active };

  let cancel: (() => void) | null = null;
  let lastDraw = 0;
  const reduced = prefersReducedMotion();

  const draw = (t: number): boolean => {
    if (!isEnabled()) {
      setActive(false);
      return false;
    }
    setActive(true);
    if (reduced && t - lastDraw < 250) return true;
    lastDraw = t;
    const el = canvas() as HTMLCanvasElement | null;
    const node = analyser() as unknown as AnalyserNodeLike | null;
    if (!el || typeof el.getContext !== "function") return true;
    const dpr = Math.min(
      2,
      (g["devicePixelRatio"] as number | undefined) ?? 1,
    );
    const w = el.clientWidth * dpr;
    const h = el.clientHeight * dpr;
    if (w <= 0 || h <= 0) return true;
    if (el.width !== Math.round(w) || el.height !== Math.round(h)) {
      el.width = Math.round(w);
      el.height = Math.round(h);
    }
    const ctx = el.getContext("2d");
    if (!ctx) return true;
    ctx.clearRect(0, 0, el.width, el.height);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, el.width, el.height);
    }
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth * dpr;
    if (!node) {
      // Idle baseline.
      ctx.beginPath();
      ctx.moveTo(0, el.height / 2);
      ctx.lineTo(el.width, el.height / 2);
      ctx.stroke();
      return true;
    }
    if (mode === "bars") {
      const data = new Uint8Array(node.frequencyBinCount);
      node.getByteFrequencyData(data);
      const bars = Math.min(64, data.length);
      const bw = el.width / bars;
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * data.length)] / 255;
        const bh = Math.max(2 * dpr, v * el.height);
        ctx.fillRect(i * bw + bw * 0.15, el.height - bh, bw * 0.7, bh);
      }
    } else {
      const data = new Uint8Array(node.frequencyBinCount);
      node.getByteTimeDomainData(data);
      ctx.beginPath();
      const mid = el.height / 2;
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * el.width;
        const y = mid + ((data[i] - 128) / 128) * mid;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return true;
  };

  cancel = schedule(draw);
  onCleanup(() => {
    cancel?.();
    setActive(false);
  });

  return { active };
}

/* ------------------------------------------------------------------ */
/* createTTS (text-to-speech)                                            */
/* ------------------------------------------------------------------ */

/** Cloud TTS upgrade: implement `speak` with your provider. */
export interface TTSProvider {
  speak: (text: string, opts: { signal: AbortSignal }) => Promise<void>;
}

export interface TTSOptions {
  /**
   * `"browser"` uses `speechSynthesis`; pass a `TTSProvider` to
   * upgrade to a cloud voice (fetch the audio in `speak`).
   * Default `"browser"`.
   */
  provider?: "browser" | TTSProvider;
  /** BCP-47 language tag. Default the browser language. */
  lang?: string;
  /** 0.1..10. Default 1. */
  rate?: number;
  /** 0..2. Default 1. */
  pitch?: number;
  /** 0..1. Default 1. */
  volume?: number;
  /**
   * Pick the voice: a voice name, or a function choosing from the
   * available voices.
   */
  voice?:
    | string
    | ((voices: SpeechSynthesisVoice[]) => SpeechSynthesisVoice | undefined);
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export interface TTSControls {
  /** False on the server or without `speechSynthesis` (browser provider). */
  supported: boolean;
  /** Whether speech is currently playing. */
  speaking: Accessor<boolean>;
  /** Available browser voices (loads asynchronously). */
  voices: Accessor<SpeechSynthesisVoice[]>;
  /** Speak the text (cancels anything currently playing). */
  speak: (text: string) => void;
  /** Stop playback. */
  cancel: () => void;
}

/**
 * Text-to-speech with `speechSynthesis` by default and a clean
 * upgrade path to cloud voices.
 *
 * ```ts
 * const tts = createTTS({ rate: 1.05 });
 * tts.speak("Your report is ready.");
 *
 * // Cloud upgrade:
 * const tts = createTTS({
 *   provider: {
 *     speak: async (text, { signal }) => {
 *       const res = await fetch("/api/tts", {
 *         method: "POST",
 *         body: JSON.stringify({ text }),
 *         signal,
 *       });
 *       await playAudioBlob(await res.blob(), signal);
 *     },
 *   },
 * });
 * ```
 *
 * SSR-safe: `supported` is false without `speechSynthesis` and
 * `speak()` is a no-op there.
 */
export function createTTS(options: TTSOptions = {}): TTSControls {
  const {
    provider = "browser",
    rate = 1,
    pitch = 1,
    volume = 1,
    voice,
    onStart,
    onEnd,
    onError,
  } = options;

  const [speaking, setSpeaking] = createSignal(false);
  const [voices, setVoices] = createSignal<SpeechSynthesisVoice[]>([]);

  const synth = (
    g["speechSynthesis"] as SpeechSynthesis | undefined
  ) ?? null;
  const Utterance =
    (g["SpeechSynthesisUtterance"] as
      | (new (text: string) => SpeechSynthesisUtterance)
      | undefined) ?? null;
  const supported = provider !== "browser" || (synth !== null && Utterance !== null);

  let cloudController: AbortController | null = null;

  const refreshVoices = (): void => {
    if (synth) setVoices([...synth.getVoices()]);
  };
  if (synth) {
    refreshVoices();
    const handler = (): void => refreshVoices();
    synth.addEventListener("voiceschanged", handler);
    onCleanup(() => synth.removeEventListener("voiceschanged", handler));
  }

  const pickVoice = (): SpeechSynthesisVoice | undefined => {
    const list = voices();
    if (!voice || list.length === 0) return undefined;
    if (typeof voice === "function") return voice(list);
    return list.find((v) => v.name === voice) ?? undefined;
  };

  const cancel = (): void => {
    cloudController?.abort();
    cloudController = null;
    try {
      synth?.cancel();
    } catch {
      // Already idle.
    }
    setSpeaking(false);
  };

  const speak = (text: string): void => {
    if (!text) return;
    cancel();
    if (typeof provider === "object") {
      cloudController = new AbortController();
      const signal = cloudController.signal;
      setSpeaking(true);
      onStart?.();
      void provider
        .speak(text, { signal })
        .then(() => {
          if (signal.aborted) return;
          setSpeaking(false);
          onEnd?.();
        })
        .catch((e: unknown) => {
          if (signal.aborted) return;
          setSpeaking(false);
          const err = e instanceof Error ? e : new Error(String(e));
          onError?.(err);
        });
      return;
    }
    if (!synth || !Utterance) return;
    const utterance = new Utterance(text);
    utterance.lang =
      options.lang ??
      (g["navigator"] as Navigator | undefined)?.language ??
      "en-US";
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    const chosen = pickVoice();
    if (chosen) utterance.voice = chosen;
    utterance.onstart = () => {
      setSpeaking(true);
      onStart?.();
    };
    utterance.onend = () => {
      setSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setSpeaking(false);
      const err = new Error("Speech synthesis failed");
      onError?.(err);
    };
    synth.speak(utterance);
  };

  onCleanup(cancel);

  return { supported, speaking, voices, speak, cancel };
}

/* ------------------------------------------------------------------ */
/* createThinking                                                        */
/* ------------------------------------------------------------------ */

export interface ThinkingOptions {
  /** Phrases to cycle through. Default `["Thinking"]`. */
  phrases?: string[];
  /** Time per step in ms. Default 400. */
  interval?: number;
}

export interface ThinkingControls {
  /** Current label, e.g. `"Thinking.."`. Empty when stopped. */
  text: Accessor<string>;
  /** Whether the indicator is running. */
  running: Accessor<boolean>;
  /** Start cycling. */
  start: () => void;
  /** Stop and clear the label. */
  stop: () => void;
}

/**
 * An animated "thinking" indicator for voice/AI latency: cycles
 * trailing dots, then moves through phrases.
 *
 * ```ts
 * const thinking = createThinking({ phrases: ["Thinking", "Searching"] });
 * thinking.start();
 * <p>{thinking.text()}</p> // "Thinking", "Thinking.", "Thinking..", ...
 * ```
 */
export function createThinking(
  options: ThinkingOptions = {},
): ThinkingControls {
  const { phrases = ["Thinking"], interval = 400 } = options;
  const safePhrases = phrases.length > 0 ? phrases : ["Thinking"];

  const [text, setText] = createSignal("");
  const [running, setRunning] = createSignal(false);

  let timer: ReturnType<typeof setInterval> | null = null;
  let phrase = 0;
  let dots = 0;

  const stopTimer = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const start = (): void => {
    stopTimer();
    phrase = 0;
    dots = 0;
    setRunning(true);
    setText(safePhrases[0]);
    timer = setInterval(() => {
      dots = (dots + 1) % 4;
      if (dots === 0) phrase = (phrase + 1) % safePhrases.length;
      setText(safePhrases[phrase] + ".".repeat(dots));
    }, interval);
  };

  const stop = (): void => {
    stopTimer();
    setRunning(false);
    setText("");
  };

  onCleanup(stopTimer);

  return { text, running, start, stop };
}

/* ------------------------------------------------------------------ */
/* createPrompt                                                          */
/* ------------------------------------------------------------------ */

export interface PromptOptions {
  /** Called with the submitted text. */
  onSubmit?: (text: string) => void;
  /** Clear the input after submit. Default true. */
  clearOnSubmit?: boolean;
  /** Language for dictation. */
  lang?: string;
}

export interface PromptControls {
  /** Current input text (typed or dictated). */
  value: Accessor<string>;
  /** Set the input text. */
  setValue: (value: string) => void;
  /** Whether the mic is listening. */
  listening: Accessor<boolean>;
  /** Latest interim dictation. */
  interim: Accessor<string>;
  /** False on the server or without the Web Speech API. */
  supported: boolean;
  /** Toggle mic dictation. */
  toggleMic: () => void;
  /** Submit the current text. */
  submit: () => void;
  /** Clear the input. */
  clear: () => void;
}

/**
 * A voice-enabled prompt input: a text value plus mic dictation,
 * built for chat boxes and voice assistants. Dictated finals are
 * appended to the value as they arrive; pairs with `createChatModel`
 * for a full voice loop.
 *
 * ```tsx
 * const prompt = createPrompt({ onSubmit: (t) => chat.send(t) });
 * <input
 *   value={prompt.value()}
 *   onInput={(e) => prompt.setValue(e.currentTarget.value)}
 *   onKeyDown={(e) => e.key === "Enter" && prompt.submit()}
 *   placeholder={prompt.listening() ? prompt.interim() || "Listening..." : "Ask anything"}
 * />
 * <button onClick={() => prompt.toggleMic()}>Mic</button>
 * ```
 */
export function createPrompt(options: PromptOptions = {}): PromptControls {
  const { onSubmit, clearOnSubmit = true, lang } = options;

  const [value, setValue] = createSignal("");

  const speech = createSpeech({
    lang,
    continuous: true,
    onResult: (transcript, isFinal) => {
      if (!isFinal) return;
      setValue((prev) => {
        const needsSpace = prev.length > 0 && !/\s$/.test(prev);
        return prev + (needsSpace ? " " : "") + transcript.trim();
      });
    },
  });

  const toggleMic = (): void => {
    if (speech.listening()) {
      speech.stop();
    } else {
      speech.reset();
      speech.start();
    }
  };

  const clear = (): void => {
    setValue("");
    speech.reset();
  };

  const submit = (): void => {
    const text = value().trim();
    if (speech.listening()) speech.stop();
    if (!text) return;
    onSubmit?.(text);
    if (clearOnSubmit) clear();
  };

  onCleanup(() => speech.stop());

  return {
    value,
    setValue,
    listening: speech.listening,
    interim: speech.interim,
    supported: speech.supported,
    toggleMic,
    submit,
    clear,
  };
}
