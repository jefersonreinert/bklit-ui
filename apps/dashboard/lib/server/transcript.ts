import type { YtTranscript, YtTranscriptSegment } from "@/lib/youtube-types";

/**
 * Full transcripts of public YouTube videos through the Gemini API, which
 * accepts a YouTube URL as video input (Google's supported route; the
 * YouTube Data API only serves captions to the video's owner).
 * https://ai.google.dev/gemini-api/docs/video-understanding
 */

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";
/** Tried in order when a model is overloaded (503) or rate limited (429). */
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.7-flash"];
const RETRYABLE = new Set([429, 500, 503]);
const LINE = /^\s*\[?(\d{1,2}:)?(\d{1,2}):(\d{2})\]?\s*[-–—:]?\s*(.*)$/;

const PROMPT = `Transcreva INTEGRALMENTE a fala deste vídeo, do início ao fim, no idioma original falado.
Regras:
- Uma linha por trecho de fala, começando com o tempo em que o trecho começa, no formato [MM:SS] (ou [H:MM:SS] após 1 hora).
- Não resuma, não traduza, não comente e não pule partes. Mantenha palavras repetidas e hesitações relevantes apenas quando mudarem o sentido.
- Se houver mais de uma pessoa falando, prefixe com o nome ou "Pessoa 1:", "Pessoa 2:".
- Se não houver fala, descreva em uma linha entre colchetes, por exemplo [música].
Responda somente com a transcrição.`;

export class TranscriptError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const geminiKey = () => process.env.GEMINI_API_KEY || null;
export const geminiModel = () => process.env.GEMINI_MODEL || DEFAULT_MODEL;

export function parseSegments(text: string): YtTranscriptSegment[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = LINE.exec(line);
      if (!m) {
        return { start: null, text: line };
      }
      const h = m[1] ? Number(m[1].slice(0, -1)) : 0;
      return {
        start: h * 3600 + Number(m[2]) * 60 + Number(m[3]),
        text: m[4] ?? "",
      };
    });
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

function requestBody(videoId: string) {
  return JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            file_data: {
              file_uri: `https://www.youtube.com/watch?v=${videoId}`,
            },
          },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 65_536 },
  });
}

async function callModel(model: string, key: string, videoId: string) {
  const res = await fetch(
    `${API}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: requestBody(videoId),
    }
  );
  const body = (await res.json().catch(() => ({}))) as GeminiResponse;
  return { status: res.status, ok: res.ok, body };
}

function extractText(model: string, videoId: string, body: GeminiResponse) {
  if (body.promptFeedback?.blockReason) {
    throw new TranscriptError(
      422,
      "O Gemini não aceitou transcrever este vídeo."
    );
  }
  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new TranscriptError(502, "O Gemini não devolveu a transcrição.");
  }
  const full =
    candidate?.finishReason === "MAX_TOKENS"
      ? `${text}\n[transcrição cortada: vídeo muito longo]`
      : text;
  return { videoId, segments: parseSegments(full), text: full, model };
}

export async function transcribeVideo(videoId: string): Promise<YtTranscript> {
  const key = geminiKey();
  if (!key) {
    throw new TranscriptError(503, "GEMINI_API_KEY não configurada");
  }
  const models = [...new Set([geminiModel(), ...FALLBACK_MODELS])];
  let last: { status: number; body: GeminiResponse } | null = null;
  for (const model of models) {
    const res = await callModel(model, key, videoId);
    if (res.ok) {
      return extractText(model, videoId, res.body);
    }
    last = res;
    // Overloaded or retired model → try the next one; anything else is final
    if (!(RETRYABLE.has(res.status) || res.status === 404)) {
      break;
    }
  }
  const status = last?.status ?? 502;
  throw new TranscriptError(
    status,
    status === 503
      ? "O Gemini está sobrecarregado agora. Tente de novo em instantes."
      : (last?.body.error?.message ?? `Gemini respondeu ${status}`)
  );
}

const AUDIO_PROMPT = `Transcreva exatamente a fala deste trecho de áudio, no idioma falado (normalmente português do Brasil).
Responda somente com o texto falado, sem comentários, sem tempos e sem aspas. Se não houver fala compreensível, responda exatamente: [sem fala]`;

const AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
]);

/** Short microphone clips (base64) → text, with the same model fallbacks. */
export async function transcribeAudio(base64: string, mimeType: string) {
  const key = geminiKey();
  if (!key) {
    throw new TranscriptError(503, "GEMINI_API_KEY não configurada");
  }
  const mime = mimeType.split(";")[0]?.trim() ?? "";
  if (!AUDIO_TYPES.has(mime)) {
    throw new TranscriptError(415, `Formato de áudio não suportado: ${mime}`);
  }
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: mime, data: base64 } },
          { text: AUDIO_PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 4096 },
  });
  let lastStatus = 502;
  for (const model of [...new Set([geminiModel(), ...FALLBACK_MODELS])]) {
    const res = await fetch(
      `${API}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
      }
    );
    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (res.ok) {
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      return text === "[sem fala]" ? "" : text;
    }
    lastStatus = res.status;
    if (!(RETRYABLE.has(res.status) || res.status === 404)) {
      throw new TranscriptError(
        res.status,
        json.error?.message ?? `Gemini respondeu ${res.status}`
      );
    }
  }
  throw new TranscriptError(
    lastStatus,
    "O Gemini está sobrecarregado agora. Tente de novo em instantes."
  );
}
