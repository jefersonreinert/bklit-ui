"use client";

import { BASE_PATH } from "@/lib/use-connectors";
import { forSpeech } from "./prompt";

/**
 * Voice of the guest page: the phone's speech recognition for the guest
 * (free; Safari and Chrome) and a queue that speaks the answer sentence
 * by sentence, with the OpenAI voice when the business enabled it or the
 * phone's own voice otherwise.
 */

/* ------------------------------ recognition ------------------------------ */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionCtor() !== null;

export class ListenError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Listens to one question: ends a moment after the guest stops talking.
 * Resolves with the text ("" when nothing was said).
 */
export function listenOnce(
  lang: string,
  onInterim: (text: string) => void,
  signal: AbortSignal,
  /** Push-to-talk: keep listening through pauses until `signal` aborts. */
  hold = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      reject(new ListenError("unsupported"));
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = hold;
    rec.interimResults = true;
    let final = "";
    let interim = "";
    let failed: ListenError | null = null;
    rec.onresult = (e) => {
      interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) {
          continue;
        }
        if (r.isFinal) {
          final += `${r[0].transcript} `;
        } else {
          interim += r[0].transcript;
        }
      }
      onInterim(`${final}${interim}`.trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        failed = new ListenError(e.error);
      }
    };
    rec.onend = () => {
      signal.removeEventListener("abort", stop);
      if (failed) {
        reject(failed);
        return;
      }
      // Safari sometimes ends without marking the last words final
      resolve((final || interim).trim());
    };
    const stop = () => {
      try {
        rec.stop();
      } catch {
        // already ended
      }
    };
    signal.addEventListener("abort", stop);
    try {
      rec.start();
    } catch {
      reject(new ListenError("busy"));
    }
  });
}

/* --------------------------------- speaking -------------------------------- */

const GOOD_VOICE = /premium|enhanced|natural|neural|siri|google/i;

/** The nicest installed voice for a language (Premium/Enhanced first). */
function bestVoice(lang: string) {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const prefix = lang.slice(0, 2).toLowerCase();
  const same = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const exact = same.filter((v) => v.lang.toLowerCase() === lang.toLowerCase());
  const pool = exact.length ? exact : same;
  return pool.find((v) => GOOD_VOICE.test(v.name)) ?? pool.find((v) => v.localService) ?? pool[0] ?? null;
}

/** A short silent WAV: playing it from a tap unlocks audio on iPhone. */
function silence() {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const d = new DataView(buf);
  const str = (at: number, t: string) => {
    for (let i = 0; i < t.length; i++) {
      d.setUint8(at + i, t.charCodeAt(i));
    }
  };
  str(0, "RIFF");
  d.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVEfmt ");
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, 8000, true);
  d.setUint32(28, 16_000, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  str(36, "data");
  d.setUint32(40, samples * 2, true);
  let bin = "";
  for (const b of new Uint8Array(buf)) {
    bin += String.fromCharCode(b);
  }
  return `data:audio/wav;base64,${btoa(bin)}`;
}

interface Clip {
  text: string;
  /** OpenAI audio, fetched ahead while the previous clip plays. */
  audio: Promise<string | null> | null;
}

export class Speaker {
  private queue: Clip[] = [];
  private playing = false;
  private generation = 0;
  private readonly el: HTMLAudioElement | null;
  private idle: (() => void)[] = [];
  private naturalVoice: boolean;

  constructor(
    private readonly opts: {
      token: string;
      sid: string;
      lang: () => { code: string; speech: string };
      natural: boolean;
      onSpeaking: (on: boolean) => void;
    }
  ) {
    this.naturalVoice = opts.natural;
    this.el = typeof Audio === "undefined" ? null : new Audio();
    if (this.el) {
      this.el.preload = "auto";
      this.el.setAttribute("playsinline", "true");
    }
  }

  /** Call from a tap: iPhone only plays sound started by the user. */
  unlock() {
    if (this.el) {
      this.el.src = silence();
      this.el.play().catch(() => undefined);
    }
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  }

  say(text: string) {
    const clean = forSpeech(text);
    if (!clean) {
      return;
    }
    this.queue.push({
      text: clean,
      audio: this.naturalVoice ? this.fetchAudio(clean) : null,
    });
    if (!this.playing) {
      this.next(this.generation);
    }
  }

  stop() {
    this.generation++;
    this.queue = [];
    this.playing = false;
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute("src");
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.opts.onSpeaking(false);
    this.flushIdle();
  }

  /** Resolves when everything queued so far has been spoken. */
  drained(): Promise<void> {
    if (!(this.playing || this.queue.length)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idle.push(resolve));
  }

  private flushIdle() {
    const waiting = this.idle;
    this.idle = [];
    for (const w of waiting) {
      w();
    }
  }

  private async fetchAudio(text: string) {
    try {
      const res = await fetch(`${BASE_PATH}/api/sommelier/speech/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          t: this.opts.token,
          sid: this.opts.sid,
          lang: this.opts.lang().code,
          text,
        }),
      });
      if (res.status !== 200) {
        // No natural voice today (not set up or limit): phone's voice
        this.naturalVoice = false;
        return null;
      }
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }

  private async next(gen: number) {
    const clip = this.queue.shift();
    if (!clip) {
      this.playing = false;
      this.opts.onSpeaking(false);
      this.flushIdle();
      return;
    }
    this.playing = true;
    this.opts.onSpeaking(true);
    const url = clip.audio ? await clip.audio : null;
    if (gen !== this.generation) {
      if (url) {
        URL.revokeObjectURL(url);
      }
      return;
    }
    if (url && this.el) {
      await this.playUrl(url);
    } else {
      await this.speakNative(clip.text);
    }
    if (gen === this.generation) {
      this.next(gen);
    }
  }

  private playUrl(url: string) {
    const el = this.el as HTMLAudioElement;
    return new Promise<void>((resolve) => {
      const done = () => {
        el.onended = null;
        el.onerror = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      el.onended = done;
      el.onerror = done;
      el.src = url;
      el.play().catch(done);
    });
  }

  private speakNative(text: string) {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      const lang = this.opts.lang().speech;
      u.lang = lang;
      u.rate = 1.02;
      const voice = bestVoice(lang);
      if (voice) {
        u.voice = voice;
      }
      // Safari can drop onend: a generous timer keeps the queue moving
      const guard = setTimeout(resolve, 2000 + text.length * 90);
      u.onend = () => {
        clearTimeout(guard);
        resolve();
      };
      u.onerror = () => {
        clearTimeout(guard);
        resolve();
      };
      window.speechSynthesis.speak(u);
    });
  }
}
