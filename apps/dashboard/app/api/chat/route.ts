import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/ai-context";
import type { ChatStreamEvent } from "@/lib/ai-events";
import { AI_MODELS, type AiModelId, DEFAULT_MODEL } from "@/lib/ai-models";
import {
  googleCookieHeader,
  googleSession,
  sealGoogleConnection,
} from "@/lib/server/google-connector";
import {
  googleInstructions,
  googleTools,
  isGoogleTool,
  runGoogleTool,
  toolServer,
} from "@/lib/server/google-tools";
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
// Long answers (and tool calls) can take a while; allow up to 5 minutes.
export const maxDuration = 300;

const MAX_MESSAGES = 40;
const MAX_CHARS = 12_000;
/** Tool loops (pause_turn or client tools) before giving up. */
const MAX_TURNS = 10;

const NOTION_INSTRUCTIONS = `O workspace do Notion da gerente está conectado (servidor MCP "notion"). Use as ferramentas do Notion quando a pergunta envolver documentos, fichas, procedimentos, atas, escalas ou qualquer conteúdo que possa estar lá: busque antes de responder e cite o título das páginas usadas. Antes de criar ou alterar páginas, confirme com a usuária o que será escrito, a menos que ela tenha pedido explicitamente.`;

interface ChatRequest {
  model?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  connectors?: string[];
}

type BetaParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];
type BetaMessage = Anthropic.Beta.BetaMessage;

interface Connectors {
  notion: { token: string } | null;
  google: { token: string; email: string } | null;
  gmail: boolean;
  drive: boolean;
  notices: string[];
  cookies: string[];
}

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

function connectorProblem(name: string, status: string) {
  if (status === "revoked") {
    return `A conexão com o ${name} expirou ou foi removida. Conecte novamente em Conectores.`;
  }
  if (status === "unavailable") {
    return `Não foi possível falar com o ${name} agora; respondi sem ele.`;
  }
  return null;
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

async function resolveNotion(request: NextRequest, out: Connectors) {
  const fresh = await ensureFreshToken(request);
  if (fresh.status === "ok") {
    out.notion = { token: fresh.token };
    if (fresh.updated) {
      const sealed = await sealConnection(fresh.updated);
      const opts = cookieOptions(request, sealed.maxAge);
      out.cookies.push(
        `${CONNECTION_COOKIE}=${sealed.value}; Path=${opts.path}; Max-Age=${opts.maxAge}; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`
      );
    }
    return;
  }
  if (fresh.status === "revoked") {
    out.cookies.push(
      `${CONNECTION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
  }
  const notice = connectorProblem("Notion", fresh.status);
  if (notice) {
    out.notices.push(notice);
  }
}

async function resolveGoogle(
  request: NextRequest,
  out: Connectors,
  wants: { gmail: boolean; drive: boolean }
) {
  const session = await googleSession(request);
  if (session.status === "ok") {
    out.google = { token: session.token, email: session.email };
    out.gmail = wants.gmail;
    out.drive = wants.drive;
    if (session.updated) {
      out.cookies.push(
        googleCookieHeader(request, await sealGoogleConnection(session.updated))
      );
    }
    return;
  }
  if (session.status === "revoked") {
    out.cookies.push(googleCookieHeader(request, null));
  }
  const notice = connectorProblem("Google", session.status);
  if (notice) {
    out.notices.push(notice);
  }
}

/** Only connectors this browser linked and the user switched on. */
async function resolveConnectors(
  request: NextRequest,
  requested: string[] | undefined
) {
  const out: Connectors = {
    notion: null,
    google: null,
    gmail: false,
    drive: false,
    notices: [],
    cookies: [],
  };
  if (!connectorsSecret()) {
    return out;
  }
  const wants = {
    notion: requested?.includes("notion") ?? false,
    gmail: requested?.includes("gmail") ?? false,
    drive: requested?.includes("drive") ?? false,
  };
  await Promise.all([
    wants.notion ? resolveNotion(request, out) : null,
    wants.gmail || wants.drive ? resolveGoogle(request, out, wants) : null,
  ]);
  return out;
}

function buildParams(
  model: AiModelId,
  messages: Anthropic.Beta.BetaMessageParam[],
  c: Connectors
): BetaParams {
  const isHaiku = model === "claude-haiku-4-5";
  const betas = [
    ...(isHaiku ? [] : ["server-side-fallback-2026-07-01"]),
    ...(c.notion ? ["mcp-client-2025-11-20"] : []),
  ];
  const google = c.google
    ? googleInstructions({
        gmail: c.gmail,
        drive: c.drive,
        email: c.google.email,
      })
    : "";
  const tools: BetaParams["tools"] = [
    ...(c.notion
      ? [{ type: "mcp_toolset" as const, mcp_server_name: "notion" }]
      : []),
    ...(c.google ? googleTools({ gmail: c.gmail, drive: c.drive }) : []),
  ];
  return {
    model,
    max_tokens: 16_000,
    system: [
      // Frozen business snapshot → cacheable prefix across turns
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      ...(c.notion
        ? [{ type: "text" as const, text: NOTION_INSTRUCTIONS }]
        : []),
      ...(google ? [{ type: "text" as const, text: google }] : []),
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
    ...(tools.length > 0 ? { tools } : {}),
    ...(c.notion
      ? {
          mcp_servers: [
            {
              type: "url" as const,
              url: NOTION_MCP_URL,
              name: "notion",
              authorization_token: c.notion.token,
            },
          ],
        }
      : {}),
  };
}

/** Streams one request, forwarding text and tool activity. */
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
      } else if (block.type === "tool_use") {
        emit({
          type: "tool",
          server: toolServer(block.name),
          name: block.name,
        });
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

/** Runs the Gmail/Drive tool calls of one turn and returns their results. */
async function runClientTools(
  final: BetaMessage,
  c: Connectors,
  emit: (e: ChatStreamEvent) => void
) {
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
  for (const block of final.content) {
    if (block.type !== "tool_use") {
      continue;
    }
    const result =
      c.google && isGoogleTool(block.name)
        ? await runGoogleTool(c.google.token, block.name, block.input)
        : { content: `Ferramenta indisponível: ${block.name}`, isError: true };
    emit({ type: "tool_done", error: result.isError });
    results.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: result.content,
      is_error: result.isError,
    });
  }
  return results;
}

function stopNotice(reason: BetaMessage["stop_reason"]) {
  if (reason === "refusal") {
    return "Não consigo ajudar com esse pedido. Tente reformular a pergunta.";
  }
  if (reason === "max_tokens") {
    return "Resposta interrompida pelo limite de tamanho.";
  }
  return null;
}

async function runConversation(
  client: Anthropic,
  params: BetaParams,
  c: Connectors,
  emit: (e: ChatStreamEvent) => void,
  signal: AbortSignal
) {
  const messages = params.messages;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const final = await streamOnce(client, params, emit, signal);
    const content = final.content as Anthropic.Beta.BetaContentBlockParam[];
    if (final.stop_reason === "pause_turn") {
      // Append the paused turn unchanged and let the server continue
      messages.push({ role: "assistant", content });
      continue;
    }
    if (final.stop_reason === "tool_use") {
      const results = await runClientTools(final, c, emit);
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: results });
      continue;
    }
    const notice = stopNotice(final.stop_reason);
    if (notice) {
      emit({ type: "notice", text: notice });
    }
    return;
  }
  emit({
    type: "notice",
    text: "Parei depois de muitas etapas com ferramentas. Peça para eu continuar se precisar.",
  });
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

  const connectors = await resolveConnectors(request, body.connectors);
  const params = buildParams(model, history, connectors);
  const client = new Anthropic();
  const abort = new AbortController();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      for (const text of connectors.notices) {
        emit({ type: "notice", text });
      }
      try {
        await runConversation(client, params, connectors, emit, abort.signal);
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

  const active = [
    connectors.notion ? "notion" : null,
    connectors.gmail ? "gmail" : null,
    connectors.drive ? "drive" : null,
  ].filter(Boolean);
  const response = new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Model": model,
      "X-Connectors": active.join(","),
    },
  });
  for (const cookie of connectors.cookies) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}
