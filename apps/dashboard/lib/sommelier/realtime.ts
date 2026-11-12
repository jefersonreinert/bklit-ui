/**
 * The sommelier's natural voice through the OpenAI Realtime API
 * (gpt-realtime-2.1-mini). The Speech endpoint models (gpt-4o-mini-tts,
 * tts-1) shut down on 2027-01-06; Realtime is their replacement. Claude
 * still writes every answer: Realtime only reads it aloud, as a one-off
 * ("out of band") response with no conversation behind it.
 *
 * Pure helpers here (events, WAV); the socket lives in
 * lib/server/sommelier-voice.ts.
 */

export const REALTIME_MODEL = "gpt-realtime-2.1-mini";
/** Realtime output: 16-bit PCM, mono, 24 kHz. */
export const PCM_RATE = 24_000;

export function readAloudInstructions(langName: string) {
  return `You are the voice of a sommelier at a wine bar. You never answer, comment or add anything: you only read the guest-facing text you are given aloud, word for word, exactly as written, in ${langName}. Sound warm, relaxed and friendly, at a natural pace, with a little smile in the voice. Say wine names, grapes and places the way a sommelier would.`;
}

/** The two events that make the model read `text` aloud, then stop. */
export function readAloudEvents(text: string, voice: string, langName: string) {
  return [
    {
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        instructions: readAloudInstructions(langName),
        audio: {
          output: { format: { type: "audio/pcm", rate: PCM_RATE }, voice },
        },
      },
    },
    {
      type: "response.create",
      response: {
        conversation: "none",
        output_modalities: ["audio"],
        instructions: readAloudInstructions(langName),
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `Read this aloud:\n\n${text}` }],
          },
        ],
      },
    },
  ];
}

export function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** 16-bit mono PCM chunks → one WAV file every browser plays. */
export function pcmToWav(chunks: Uint8Array[], rate = PCM_RATE) {
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(44 + size);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      out[at + i] = s.charCodeAt(i);
    }
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + size, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, size, true);
  let at = 44;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export interface RealtimeEvent {
  type: string;
  delta?: string;
  error?: { message?: string };
  response?: { status?: string; status_details?: unknown };
}

/**
 * Collects the audio of one response from the server events. Returns
 * "done" when the clip is complete, an Error when the model failed.
 */
export class AudioCollector {
  readonly chunks: Uint8Array[] = [];

  push(event: RealtimeEvent): "more" | "done" | Error {
    switch (event.type) {
      case "response.output_audio.delta":
        if (event.delta) {
          this.chunks.push(base64ToBytes(event.delta));
        }
        return "more";
      case "error":
        return new Error(event.error?.message ?? "realtime error");
      case "response.done":
        if (event.response?.status && event.response.status !== "completed") {
          return new Error(`realtime response ${event.response.status}`);
        }
        return this.chunks.length ? "done" : new Error("realtime: no audio");
      default:
        return "more";
    }
  }
}
