"use client";

import type { ChatStreamEvent } from "@/lib/ai-events";
import { BASE_PATH } from "@/lib/use-connectors";

/**
 * Browser-side voice pieces for the Voz page:
 * - continuous speech recognition (Safari/Chrome, free) that restarts itself
 * - clip recorder for Gemini transcription (more accurate, works anywhere)
 * - text-to-speech for spoken replies
 * - a plain-text call to the assistant (/api/chat)
 */

/* ------------------------------ recognition ------------------------------ */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () =>
  typeof window !== "undefined" && recognitionCtor() !== null;

export interface ListenerCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
}

const ERRORS: Record<string, string> = {
  "not-allowed":
    "Permita o microfone: Ajustes → Safari → Microfone (ou toque em Permitir).",
  "service-not-allowed":
    "O reconhecimento de voz do iPhone está desativado. Ative o Ditado em Ajustes → Geral → Teclado, ou use o modo Gemini.",
  "audio-capture":
    "Nenhum microfone encontrado. Conecte o fone e tente de novo.",
  network: "Sem internet para reconhecer a fala. Tentando de novo…",
};

/**
 * Continuous listener. Browsers end recognition after silences or ~1 min;
 * while `running`, it simply starts again.
 */
export class Listener {
  private rec: Recognition | null = null;
  private running = false;
  private restarts = 0;

  private readonly cb: ListenerCallbacks;

  constructor(cb: ListenerCallbacks) {
    this.cb = cb;
  }

  start() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      this.cb.onError(
        "Este navegador não tem reconhecimento de voz. Use o modo Gemini."
      );
      return;
    }
    this.running = true;
    this.restarts = 0;
    this.spawn(Ctor);
  }

  private spawn(Ctor: RecognitionCtor) {
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      this.restarts = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) {
          continue;
        }
        const text = r[0].transcript.trim();
        if (r.isFinal) {
          if (text) {
            this.cb.onFinal(text);
          }
        } else {
          interim += `${text} `;
        }
      }
      this.cb.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") {
        return;
      }
      this.cb.onError(ERRORS[e.error] ?? `Erro no microfone (${e.error}).`);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.running = false;
      }
    };
    rec.onend = () => {
      this.cb.onInterim("");
      if (!this.running) {
        return;
      }
      // Back-off if it keeps ending immediately (e.g. permission prompt)
      this.restarts += 1;
      const delay = Math.min(250 * this.restarts, 3000);
      setTimeout(() => {
        if (this.running) {
          this.spawn(Ctor);
        }
      }, delay);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      // already started — onend will retry
    }
  }

  stop() {
    this.running = false;
    try {
      this.rec?.stop();
    } catch {
      // ignore
    }
    this.rec = null;
  }

  get active() {
    return this.running;
  }
}

/* ------------------------------ clip recorder ---------------------------- */

const MIME_PREFERENCE = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg",
];

/**
 * Records the microphone in back-to-back clips (stop/start, so each clip is
 * a complete file) and hands every clip over for transcription.
 */
export class ClipRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  private readonly seconds: number;
  private readonly onClip: (blob: Blob) => void;

  constructor(seconds: number, onClip: (blob: Blob) => void) {
    this.seconds = seconds;
    this.onClip = onClip;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.running = true;
    this.next();
  }

  private next() {
    if (!(this.running && this.stream)) {
      return;
    }
    const mimeType = MIME_PREFERENCE.find((m) =>
      MediaRecorder.isTypeSupported(m)
    );
    const recorder = new MediaRecorder(
      this.stream,
      mimeType ? { mimeType } : undefined
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, {
        type: recorder.mimeType || mimeType || "audio/mp4",
      });
      if (blob.size > 2000) {
        this.onClip(blob);
      }
      this.next();
    };
    recorder.start();
    this.recorder = recorder;
    this.timer = setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, this.seconds * 1000);
  }

  /** Ends the current clip now (it is still delivered). */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (this.recorder?.state === "recording") {
      this.recorder.stop();
    }
  }

  stop() {
    this.running = false;
    this.flush();
    for (const t of this.stream?.getTracks() ?? []) {
      t.stop();
    }
    this.stream = null;
  }
}

async function blobToBase64(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x80_00) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x80_00));
  }
  return btoa(binary);
}

export async function transcribeClip(blob: Blob): Promise<string> {
  const res = await fetch(`${BASE_PATH}/api/voice/transcribe/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: await blobToBase64(blob),
      mimeType: blob.type,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return body.text ?? "";
}

/* --------------------------------- speech -------------------------------- */

const MD = /[*_`#>|]/g;
const LINKS = /\[([^\]]+)\]\([^)]+\)/g;
const URLS = /https?:\/\/\S+/g;
const BULLETS = /^\s*[-•]\s+/gm;

export const speakable = (text: string) =>
  text
    .replace(LINKS, "$1")
    .replace(URLS, "link")
    .replace(BULLETS, "")
    .replace(MD, "")
    .trim();

function ptVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "pt-BR" && v.localService) ??
    voices.find((v) => v.lang === "pt-BR") ??
    voices.find((v) => v.lang.startsWith("pt")) ??
    null
  );
}

/** Speaks the text on the current audio output (the headphones). */
export function speak(text: string, rate = 1.05): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window && text.trim())) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    u.lang = "pt-BR";
    u.rate = rate;
    const voice = ptVoice();
    if (voice) {
      u.voice = voice;
    }
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/* ------------------------------- assistant ------------------------------- */

export interface VoiceTurn {
  role: "user" | "assistant";
  content: string;
}

/** Sends the conversation to /api/chat and returns the reply as text. */
export async function askAssistant(opts: {
  messages: VoiceTurn[];
  model: string;
  style: "voice" | "notes";
  user: { name: string; role: string };
  signal?: AbortSignal;
  onText?: (soFar: string) => void;
}): Promise<string> {
  const res = await fetch(`${BASE_PATH}/api/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      style: opts.style,
      user: opts.user,
    }),
    signal: opts.signal,
  });
  if (res.status === 503) {
    throw new Error(
      "Configure ANTHROPIC_API_KEY no Vercel para usar o Claude."
    );
  }
  if (!(res.ok && res.body)) {
    throw new Error(`Erro ${res.status} ao falar com o assistente.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const handle = (line: string) => {
    if (!line.trim()) {
      return;
    }
    try {
      const e = JSON.parse(line) as ChatStreamEvent;
      if (e.type === "text") {
        text += e.text;
        opts.onText?.(text);
      } else if (e.type === "notice") {
        text += `${text ? "\n" : ""}${e.text}`;
      }
    } catch {
      // ignore malformed line
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);
  return text.trim();
}

/* -------------------------------- wake lock ------------------------------ */

interface Sentinel {
  release(): Promise<void>;
}

/** Keeps the screen on while listening (iOS stops the mic when it locks). */
export async function keepAwake(): Promise<Sentinel | null> {
  const nav = navigator as Navigator & {
    wakeLock?: { request(type: "screen"): Promise<Sentinel> };
  };
  try {
    return (await nav.wakeLock?.request("screen")) ?? null;
  } catch {
    return null;
  }
}
