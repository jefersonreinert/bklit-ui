import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/ai-context";
import type { ChatStreamEvent } from "@/lib/ai-events";
import { AI_MODELS, type AiModelId, DEFAULT_MODEL } from "@/lib/ai-models";
import {
  CONNECTION_COOKIE,
  cookieOptions,
  ensureFreshToken,
  NOTION_MCP_URL,
  sealConnection,
} from "@/lib/server/notion-connector";
import { connectorsSecret } from "@/lib/server/sealed-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Long answers (and MCP tool calls) can take a while; allow up to 5 minutes.
export const maxDuration = 300;

const MAX_MESSAGES = 40;
const MAX_CHARS = 12_000;
/** Server-tool loops can pause; resume a few times before giving up. */
const MAX_CONTINUATIONS = 4;

const NOTION_INSTRUCTIONS = `O workspace do Notion da gerente está conectado (servidor MCP "notion"). Use as ferramentas do Notion quando a pergunta envolver documentos, fichas, procedimentos, atas, escalas ou qualquer conteúdo que possa estar lá: busque antes de responder e cite o título das páginas usadas. Antes de criar ou alterar páginas, confirme com a usuária o que será escrito, a menos que ela tenha pedido explicitamente.`;

interface ChatRequest {
  model?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  connectors?: string[];
}

type BetaParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

const encoder = new TextEncoder();

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

function sanitizeHistory(messages: ChatRequest["messages"]) {
  return (messages ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

/**
 * Streams one request, forwarding text and MCP tool activity. Returns the
 * final message so the caller can resume a `pause_turn`.
 */
async function streamOnce(
  client: Anthropic,
  params: BetaParams,
  emit: (e: ChatStreamEvent) => void,
  signal: AbortSignal
) {
  const stream = client.beta.messages.stream(params, { signal });
  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "mcp_tool_use") {
        emit({ type: "tool", server: block.server_name, name: block.name });
      } else if (block.type === "mcp_tool_result") {
        emit({ type: "tool_done", error: Boolean(block.is_error) });
      }
    } else if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      emit({ type: "text", text: event.delta.text });
    }
  }
  return stream.finalMessage();
}

export async function POST(request: NextRequest) {
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
  const history = sanitizeHistory(body.messages);
  if (history.length === 0 || history[0]?.role !== "user") {
    return Response.json({ error: "invalid_messages" }, { status: 400 });
  }

  // Notion MCP: only when this browser connected it and the user enabled it
  const wantsNotion = body.connectors?.includes("notion") ?? false;
  const notion =
    wantsNotion && connectorsSecret() ? await ensureFreshToken(request) : null;

  const isHaiku = model === "claude-haiku-4-5";
  const betas = [
    ...(isHaiku ? [] : ["server-side-fallback-2026-07-01"]),
    ...(notion ? ["mcp-client-2025-11-20"] : []),
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = history;
  const baseParams: BetaParams = {
    model,
    max_tokens: 16_000,
    system: [
      // Frozen business snapshot → cacheable prefix across turns
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      ...(notion ? [{ type: "text" as const, text: NOTION_INSTRUCTIONS }] : []),
    ],
    messages,
    ...(betas.length > 0 ? { betas } : {}),
    ...(isHaiku
      ? {}
      : {
          // Opus 5.5 / Sonnet 5.5 think adaptively; effort tunes depth.
          // Server-side fallbacks re-run a refused request on another model.
          output_config: { effort: "medium" as const },
          fallbacks: "default" as const,
        }),
    ...(notion
      ? {
          mcp_servers: [
            {
              type: "url" as const,
              url: NOTION_MCP_URL,
              name: "notion",
              authorization_token: notion.token,
            },
          ],
          tools: [{ type: "mcp_toolset" as const, mcp_server_name: "notion" }],
        }
      : {}),
  };

  const client = new Anthropic();
  const abort = new AbortController();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
          const final = await streamOnce(
            client,
            baseParams,
            emit,
            abort.signal
          );
          if (final.stop_reason === "pause_turn") {
            // Append the paused turn unchanged and let the server continue
            messages.push({
              role: "assistant",
              content: final.content as Anthropic.Beta.BetaContentBlockParam[],
            });
            continue;
          }
          if (final.stop_reason === "refusal") {
            emit({
              type: "notice",
              text: "Não consigo ajudar com esse pedido. Tente reformular a pergunta.",
            });
          } else if (final.stop_reason === "max_tokens") {
            emit({
              type: "notice",
              text: "Resposta interrompida pelo limite de tamanho.",
            });
          }
          break;
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          emit({ type: "notice", text: `⚠️ ${errorMessage(error)}` });
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  const response = new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Model": model,
      "X-Connectors": notion ? "notion" : "",
    },
  });

  if (notion?.updated) {
    // Persist the refreshed Notion token
    const sealed = await sealConnection(notion.updated);
    const opts = cookieOptions(request, sealed.maxAge);
    response.headers.append(
      "Set-Cookie",
      `${CONNECTION_COOKIE}=${sealed.value}; Path=${opts.path}; Max-Age=${opts.maxAge}; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`
    );
  }
  return response;
}
