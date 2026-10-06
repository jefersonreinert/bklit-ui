import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/ai-context";
import { AI_MODELS, type AiModelId, DEFAULT_MODEL } from "@/lib/ai-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Long answers can take a while; allow up to 5 minutes on Vercel.
export const maxDuration = 300;

const MAX_MESSAGES = 40;
const MAX_CHARS = 12_000;

interface ChatRequest {
  model?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
}

const encoder = new TextEncoder();

type MessageStream = ReturnType<Anthropic["beta"]["messages"]["stream"]>;

/** Forwards text deltas, then appends a note for refusal / truncation. */
async function pipeText(stream: MessageStream, write: (text: string) => void) {
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      write(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    write(
      "\n\n> Não consigo ajudar com esse pedido. Tente reformular a pergunta."
    );
  } else if (final.stop_reason === "max_tokens") {
    write("\n\n> Resposta interrompida pelo limite de tamanho.");
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Anthropic.APIConnectionError) {
    return "Não foi possível conectar à API do Claude. Tente novamente.";
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return "Chave da API inválida. Verifique ANTHROPIC_API_KEY no Vercel.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Limite de uso atingido. Tente novamente em instantes.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Erro da API (${error.status}): ${error.message}`;
  }
  return "Erro ao falar com o Claude.";
}

function isModel(id: string | undefined): id is AiModelId {
  return AI_MODELS.some((m) => m.id === id);
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "missing_api_key" }, { status: 503 });
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const model: AiModelId = isModel(body.model) ? body.model : DEFAULT_MODEL;
  const history = (body.messages ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  if (history.length === 0 || history[0]?.role !== "user") {
    return Response.json({ error: "invalid_messages" }, { status: 400 });
  }

  const client = new Anthropic();
  const isHaiku = model === "claude-haiku-4-5";

  // Opus 5.5 / Sonnet 5.5 think adaptively by default; effort tunes depth.
  // Server-side fallbacks re-run a refused request on another model.
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 16_000,
    system: [
      // Frozen business snapshot → cacheable prefix across turns.
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: history,
    ...(isHaiku
      ? {}
      : {
          output_config: { effort: "medium" as const },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
        }),
  });

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        await pipeText(stream, write);
      } catch (error) {
        write(`\n\n> ⚠️ ${errorMessage(error)}`);
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Model": model,
    },
  });
}
