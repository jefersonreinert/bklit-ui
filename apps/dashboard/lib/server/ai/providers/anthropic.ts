import Anthropic from "@anthropic-ai/sdk";
import {
  AiError,
  type AiProviderAdapter,
  classifyHttp,
  classifyThrown,
  retryAfter,
} from "../types";

/** Models that take the server-side refusal fallback ("default" routing). */
const FALLBACK_MODELS = /^claude-(fable-5|opus-5|sonnet-5-5)/;
/** Models with the effort control (current generation). */
const EFFORT_MODELS = /^claude-(fable|mythos|opus|sonnet|haiku)-5/;

const client = (apiKey: string) =>
  // No SDK retries: the router decides (avoids paying twice)
  new Anthropic({ apiKey, maxRetries: 0 });

function toAiError(err: unknown, signal: AbortSignal): AiError {
  if (
    err instanceof Anthropic.APIConnectionTimeoutError ||
    err instanceof Anthropic.APIUserAbortError
  ) {
    return new AiError("timeout", "Tempo esgotado esperando a Anthropic.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError("network", "Sem conexão com a Anthropic.");
  }
  if (err instanceof Anthropic.APIError && typeof err.status === "number") {
    const body = err.error as { error?: { type?: string; message?: string } };
    const message = body?.error?.message ?? err.message;
    // 529 = overloaded
    return new AiError(classifyHttp(err.status, message, body?.error?.type), message, {
      status: err.status,
      retryAfterMs: retryAfter(err.headers?.get?.("retry-after")),
    });
  }
  return classifyThrown(err, signal);
}

export const anthropicAdapter: AiProviderAdapter = {
  id: "anthropic",

  async listModels(key, signal) {
    try {
      const page = await client(key).models.list({ limit: 100 }, { signal });
      return page.data.map((m) => ({
        id: m.id,
        name: m.display_name,
        vision: true,
      }));
    } catch (err) {
      throw toAiError(err, signal);
    }
  },

  async vision(key, model, req, signal) {
    const fallback = FALLBACK_MODELS.test(model);
    try {
      const res = await client(key).beta.messages.create(
        {
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          ...(EFFORT_MODELS.test(model)
            ? { output_config: { effort: "low" as const } }
            : {}),
          // Policy declines re-run on a fallback model inside the same call
          ...(fallback
            ? {
                betas: ["server-side-fallback-2026-07-01"],
                fallbacks: "default" as const,
              }
            : {}),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: req.mediaType,
                    data: req.image,
                  },
                },
                { type: "text", text: req.prompt },
              ],
            },
          ],
        },
        { signal }
      );
      if (res.stop_reason === "refusal") {
        throw new AiError("refused", "O Claude recusou analisar a imagem.");
      }
      const text = res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      return { text, model: res.model };
    } catch (err) {
      throw toAiError(err, signal);
    }
  },
};
