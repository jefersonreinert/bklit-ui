import type { AiProviderId } from "@/lib/ai/providers-meta";
import {
  AiError,
  type AiProviderAdapter,
  classifyHttp,
  classifyThrown,
  type ModelInfo,
  retryAfter,
} from "../types";

/**
 * Chat Completions over plain HTTP: OpenAI and xAI (Grok) speak the same
 * protocol, so one adapter serves both with a few options.
 */
interface Options {
  id: AiProviderId;
  name: string;
  baseUrl: string;
  /** OpenAI's newer models want max_completion_tokens. */
  tokensField: "max_tokens" | "max_completion_tokens";
  /** Keeps chat/vision models out of a long list (embeddings, audio…). */
  keepModel: (id: string) => boolean;
  /** Optional richer catalog with input modalities (xAI). */
  modelsDetail?: string;
}

interface ErrorBody {
  error?: { message?: string; type?: string; code?: string } | string;
  code?: string;
  message?: string;
}

async function failure(res: Response, name: string): Promise<AiError> {
  const raw = await res.text().catch(() => "");
  let body: ErrorBody = {};
  try {
    body = JSON.parse(raw) as ErrorBody;
  } catch {
    // not JSON
  }
  const err = typeof body.error === "object" ? body.error : undefined;
  const message =
    err?.message ??
    (typeof body.error === "string" ? body.error : undefined) ??
    body.message ??
    (raw.slice(0, 200) || `${name}: HTTP ${res.status}`);
  return new AiError(
    classifyHttp(res.status, message, err?.code ?? err?.type ?? body.code),
    message,
    { status: res.status, retryAfterMs: retryAfter(res.headers.get("retry-after")) }
  );
}

export function openAiCompatible(o: Options): AiProviderAdapter {
  const call = async (
    key: string,
    path: string,
    signal: AbortSignal,
    body?: unknown
  ) => {
    let res: Response;
    try {
      res = await fetch(`${o.baseUrl}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal,
      });
    } catch (err) {
      throw classifyThrown(err, signal);
    }
    if (!res.ok) {
      throw await failure(res, o.name);
    }
    return (await res.json()) as unknown;
  };

  return {
    id: o.id,

    async listModels(key, signal) {
      if (o.modelsDetail) {
        try {
          const detail = (await call(key, o.modelsDetail, signal)) as {
            models?: { id: string; input_modalities?: string[] }[];
          };
          if (detail.models?.length) {
            return detail.models.map((m) => ({
              id: m.id,
              vision: m.input_modalities?.includes("image"),
            }));
          }
        } catch (err) {
          // Auth problems show on the plain list too; fall through
          if (err instanceof AiError && err.kind !== "model") {
            throw err;
          }
        }
      }
      const list = (await call(key, "/models", signal)) as {
        data?: { id: string; created?: number }[];
      };
      return (list.data ?? [])
        .filter((m) => o.keepModel(m.id))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
        .map((m): ModelInfo => ({ id: m.id }));
    },

    async vision(key, model, req, signal) {
      const data = (await call(key, "/chat/completions", signal, {
        model,
        [o.tokensField]: req.maxTokens,
        messages: [
          { role: "system", content: req.system },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${req.mediaType};base64,${req.image}`,
                  detail: "high",
                },
              },
              { type: "text", text: req.prompt },
            ],
          },
        ],
      })) as {
        model?: string;
        choices?: {
          finish_reason?: string;
          message?: { content?: string | null; refusal?: string | null };
        }[];
      };
      const choice = data.choices?.[0];
      if (choice?.message?.refusal || choice?.finish_reason === "content_filter") {
        throw new AiError(
          "refused",
          choice.message?.refusal || `${o.name} recusou analisar a imagem.`
        );
      }
      return {
        text: (choice?.message?.content ?? "").trim(),
        model: data.model ?? model,
      };
    },
  };
}

const OPENAI_SKIP =
  /audio|realtime|tts|transcribe|whisper|embedding|moderation|image|dall-e|search|instruct|babbage|davinci|codex|computer-use/;

export const openaiAdapter = openAiCompatible({
  id: "openai",
  name: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  tokensField: "max_completion_tokens",
  keepModel: (id) =>
    /^(gpt-|o\d|chatgpt-)/.test(id) && !OPENAI_SKIP.test(id),
});

export const xaiAdapter = openAiCompatible({
  id: "xai",
  name: "xAI",
  baseUrl: "https://api.x.ai/v1",
  tokensField: "max_tokens",
  keepModel: (id) => id.startsWith("grok") && !/image|imagine|video/.test(id),
  modelsDetail: "/language-models",
});
