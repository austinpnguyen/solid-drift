import { describe, expect, it, vi, afterEach } from "vitest";
import { createRoot } from "solid-js";
import {
  createVoiceState,
  createMicLevel,
  createSpeech,
  createWaveform,
  createTTS,
  createThinking,
  createPrompt,
} from "./voice.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const flush = async (): Promise<void> => {
  await sleep(0);
  await sleep(0);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/* Fake Web Speech API recognition. */

interface FakeResultEvent {
  resultIndex: number;
  results: Array<{ isFinal: boolean; 0: { transcript: string }; length: number }>;
}

const recognitionInstances: Array<FakeRecognition> = [];

class FakeRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: FakeResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  constructor() {
    recognitionInstances.push(this);
  }

  start(): void {
    this.started = true;
    this.onstart?.();
  }

  stop(): void {
    this.started = false;
    this.onend?.();
  }

  abort(): void {
    this.started = false;
    this.onend?.();
  }

  emit(transcript: string, isFinal: boolean): void {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal, 0: { transcript }, length: 1 }],
    });
  }
}

const lastRecognition = (): FakeRecognition =>
  recognitionInstances[recognitionInstances.length - 1];

/* Fake WebAudio for the mic meter. */

const analyserData = new Uint8Array(256);

class FakeAnalyser {
  fftSize = 512;
  get frequencyBinCount(): number {
    return 256;
  }
  getByteTimeDomainData(arr: Uint8Array): void {
    arr.set(analyserData);
  }
  getByteFrequencyData(arr: Uint8Array): void {
    arr.fill(100);
  }
  connect(): void {}
}

class FakeAudioContext {
  state = "running";
  createMediaStreamSource(): { connect(): void } {
    return { connect: () => {} };
  }
  createAnalyser(): FakeAnalyser {
    return new FakeAnalyser();
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

const stubAudio = (): void => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [] }),
    },
  });
};

/** Manual rAF driver for the shared engine clock. */
const stubRaf = (): { advance: (ms: number) => void } => {
  let cb: ((t: number) => void) | null = null;
  let t = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: (t: number) => void) => {
    cb = fn;
    return 1;
  });
  return {
    advance: (ms: number) => {
      t += ms;
      const fn = cb;
      cb = null;
      fn?.(t);
    },
  };
};

/* Fake speechSynthesis. */

interface FakeUtterance {
  text: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

const utterances: Array<FakeUtterance & Record<string, unknown>> = [];

class FakeUtteranceImpl {
  text: string;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
    utterances.push(this as unknown as FakeUtterance & Record<string, unknown>);
  }
}

const stubSpeechSynthesis = (): void => {
  utterances.length = 0;
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [{ name: "Test Voice", lang: "en-US" }],
    speak: (_u: unknown) => {},
    cancel: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtteranceImpl);
};

describe("createVoiceState", () => {
  it("walks the idle/listening/thinking/speaking cycle", () => {
    createRoot((dispose) => {
      const voice = createVoiceState();
      expect(voice.state()).toBe("idle");
      voice.toListening();
      expect(voice.state()).toBe("listening");
      voice.toThinking();
      expect(voice.state()).toBe("thinking");
      voice.toSpeaking();
      expect(voice.state()).toBe("speaking");
      voice.toIdle();
      expect(voice.state()).toBe("idle");
      dispose();
    });
  });
});

describe("createMicLevel", () => {
  it("reports unsupported without WebAudio/getUserMedia and rejects start()", async () => {
    await createRoot(async (dispose) => {
      const mic = createMicLevel();
      expect(mic.supported).toBe(false);
      expect(mic.active()).toBe(false);
      await expect(mic.start()).rejects.toThrow();
      expect(mic.error()).not.toBeNull();
      dispose();
    });
  });

  it("meters volume from the analyser and stops cleanly", async () => {
    stubAudio();
    const raf = stubRaf();
    // Loud square wave around the 128 center.
    for (let i = 0; i < analyserData.length; i++) {
      analyserData[i] = i % 2 === 0 ? 0 : 255;
    }
    const onLevel = vi.fn();
    let mic!: ReturnType<typeof createMicLevel>;
    const dispose = createRoot((d) => {
      mic = createMicLevel({ onLevel });
      return d;
    });
    expect(mic.supported).toBe(true);
    await mic.start();
    expect(mic.active()).toBe(true);
    expect(mic.analyser()).not.toBeNull();
    for (let i = 0; i < 10; i++) raf.advance(16);
    expect(mic.level()).toBeGreaterThan(0.3);
    expect(mic.level()).toBeLessThanOrEqual(1);
    expect(onLevel).toHaveBeenCalled();
    mic.stop();
    expect(mic.active()).toBe(false);
    expect(mic.level()).toBe(0);
    dispose();
  });

  it("stays near zero for silence", async () => {
    stubAudio();
    const raf = stubRaf();
    analyserData.fill(128);
    let mic!: ReturnType<typeof createMicLevel>;
    const dispose = createRoot((d) => {
      mic = createMicLevel({ smoothing: 0 });
      return d;
    });
    await mic.start();
    for (let i = 0; i < 5; i++) raf.advance(16);
    expect(mic.level()).toBeCloseTo(0, 3);
    dispose();
  });
});

describe("createSpeech", () => {
  it("reports unsupported without the API and start() is a safe no-op", () => {
    createRoot((dispose) => {
      const speech = createSpeech();
      expect(speech.supported).toBe(false);
      expect(() => speech.start()).not.toThrow();
      expect(speech.listening()).toBe(false);
      dispose();
    });
  });

  it("accumulates finals and tracks interims with the fake API", () => {
    recognitionInstances.length = 0;
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const seen: Array<[string, boolean]> = [];
    let speech!: ReturnType<typeof createSpeech>;
    const dispose = createRoot((d) => {
      speech = createSpeech({
        lang: "en-US",
        onResult: (t, isFinal) => seen.push([t, isFinal]),
      });
      return d;
    });
    expect(speech.supported).toBe(true);
    speech.start();
    const rec = lastRecognition();
    expect(rec.lang).toBe("en-US");
    expect(speech.listening()).toBe(true);
    rec.emit("hel", false);
    expect(speech.interim()).toBe("hel");
    expect(speech.transcript()).toBe("");
    rec.emit("hello", true);
    expect(speech.transcript()).toBe("hello");
    expect(speech.interim()).toBe("");
    rec.emit(" world", true);
    expect(speech.transcript()).toBe("hello world");
    expect(seen).toEqual([
      ["hel", false],
      ["hello", true],
      [" world", true],
    ]);
    speech.stop();
    expect(speech.listening()).toBe(false);
    speech.reset();
    expect(speech.transcript()).toBe("");
    dispose();
  });

  it("surfaces recognition errors", () => {
    recognitionInstances.length = 0;
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const onError = vi.fn();
    let speech!: ReturnType<typeof createSpeech>;
    const dispose = createRoot((d) => {
      speech = createSpeech({ onError });
      return d;
    });
    speech.start();
    lastRecognition().onerror?.({ error: "not-allowed" });
    expect(speech.error()?.message).toContain("not-allowed");
    expect(onError).toHaveBeenCalledTimes(1);
    dispose();
  });
});

describe("createWaveform", () => {
  it("is a no-op on the server", () => {
    createRoot((dispose) => {
      const wf = createWaveform(() => null, { analyser: () => null });
      expect(wf.active()).toBe(false);
      dispose();
    });
  });
});

describe("createTTS", () => {
  it("reports unsupported without speechSynthesis and speak() is a safe no-op", () => {
    createRoot((dispose) => {
      const tts = createTTS();
      expect(tts.supported).toBe(false);
      expect(() => tts.speak("hello")).not.toThrow();
      expect(tts.speaking()).toBe(false);
      dispose();
    });
  });

  it("drives the browser speechSynthesis through utterance events", () => {
    stubSpeechSynthesis();
    let tts!: ReturnType<typeof createTTS>;
    const dispose = createRoot((d) => {
      tts = createTTS({ rate: 1.2 });
      return d;
    });
    expect(tts.supported).toBe(true);
    expect(tts.voices()).toHaveLength(1);
    tts.speak("hello there");
    expect(utterances).toHaveLength(1);
    expect(utterances[0].text).toBe("hello there");
    expect(utterances[0].rate).toBe(1.2);
    const utt = utterances[0] as FakeUtterance;
    utt.onstart?.();
    expect(tts.speaking()).toBe(true);
    utt.onend?.();
    expect(tts.speaking()).toBe(false);
    dispose();
  });

  it("routes speak() through a cloud provider and honors cancel()", async () => {
    let resolveSpeak!: () => void;
    const seen: { signal: AbortSignal | null } = { signal: null };
    const providerSpeak = vi.fn(
      (_text: string, opts: { signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          seen.signal = opts.signal;
          resolveSpeak = resolve;
        }),
    );
    const onEnd = vi.fn();
    let tts!: ReturnType<typeof createTTS>;
    const dispose = createRoot((d) => {
      tts = createTTS({ provider: { speak: providerSpeak }, onEnd });
      return d;
    });
    expect(tts.supported).toBe(true);
    tts.speak("cloud hello");
    expect(providerSpeak).toHaveBeenCalledTimes(1);
    expect(providerSpeak.mock.calls[0][0]).toBe("cloud hello");
    expect(tts.speaking()).toBe(true);
    resolveSpeak();
    await flush();
    expect(tts.speaking()).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
    // A second utterance cancelled mid-flight stays silent.
    tts.speak("again");
    expect(tts.speaking()).toBe(true);
    tts.cancel();
    expect(tts.speaking()).toBe(false);
    expect(seen.signal?.aborted).toBe(true);
    dispose();
  });
});

describe("createThinking", () => {
  it("cycles dots and phrases on a timer", () => {
    vi.useFakeTimers();
    let thinking!: ReturnType<typeof createThinking>;
    const dispose = createRoot((d) => {
      thinking = createThinking({ phrases: ["Thinking", "Searching"], interval: 400 });
      return d;
    });
    expect(thinking.running()).toBe(false);
    expect(thinking.text()).toBe("");
    thinking.start();
    expect(thinking.running()).toBe(true);
    expect(thinking.text()).toBe("Thinking");
    vi.advanceTimersByTime(400);
    expect(thinking.text()).toBe("Thinking.");
    vi.advanceTimersByTime(400);
    expect(thinking.text()).toBe("Thinking..");
    vi.advanceTimersByTime(800);
    expect(thinking.text()).toBe("Searching");
    vi.advanceTimersByTime(400);
    expect(thinking.text()).toBe("Searching.");
    thinking.stop();
    expect(thinking.running()).toBe(false);
    expect(thinking.text()).toBe("");
    dispose();
  });
});

describe("createPrompt", () => {
  it("submits typed text and clears by default", () => {
    const submitted: string[] = [];
    let prompt!: ReturnType<typeof createPrompt>;
    const dispose = createRoot((d) => {
      prompt = createPrompt({ onSubmit: (t) => submitted.push(t) });
      return d;
    });
    expect(prompt.supported).toBe(false);
    prompt.setValue("hello");
    expect(prompt.value()).toBe("hello");
    prompt.submit();
    expect(submitted).toEqual(["hello"]);
    expect(prompt.value()).toBe("");
    // Empty submit does nothing.
    prompt.submit();
    expect(submitted).toHaveLength(1);
    dispose();
  });

  it("keeps the value when clearOnSubmit is false", () => {
    const submitted: string[] = [];
    let prompt!: ReturnType<typeof createPrompt>;
    const dispose = createRoot((d) => {
      prompt = createPrompt({
        onSubmit: (t) => submitted.push(t),
        clearOnSubmit: false,
      });
      return d;
    });
    prompt.setValue("keep me");
    prompt.submit();
    expect(submitted).toEqual(["keep me"]);
    expect(prompt.value()).toBe("keep me");
    prompt.clear();
    expect(prompt.value()).toBe("");
    dispose();
  });

  it("dictates into the value through the fake speech API", () => {
    recognitionInstances.length = 0;
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const submitted: string[] = [];
    let prompt!: ReturnType<typeof createPrompt>;
    const dispose = createRoot((d) => {
      prompt = createPrompt({ onSubmit: (t) => submitted.push(t) });
      return d;
    });
    expect(prompt.supported).toBe(true);
    prompt.toggleMic();
    expect(prompt.listening()).toBe(true);
    const rec = lastRecognition();
    rec.emit("drafting", false);
    expect(prompt.interim()).toBe("drafting");
    expect(prompt.value()).toBe("");
    rec.emit("hello world", true);
    expect(prompt.value()).toBe("hello world");
    rec.emit("again", true);
    expect(prompt.value()).toBe("hello world again");
    prompt.submit();
    expect(prompt.listening()).toBe(false);
    expect(submitted).toEqual(["hello world again"]);
    expect(prompt.value()).toBe("");
    dispose();
  });
});
