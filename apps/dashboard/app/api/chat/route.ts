import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/ai-context";
import type { ChatStreamEvent } from "@/lib/ai-events";
import { AI_MODELS, type AiModelId, DEFAULT_MODEL } from "@/lib/ai-models";
import {
  GITHUB_MCP_URL,
  readGithubConnection,
} from "@/lib/server/github-connector";
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
import { hasAccess, whatsappConfig } from "@/lib/server/whatsapp";
import {
  isWhatsappTool,
  runWhatsappTool,
  WHATSAPP_INSTRUCTIONS,
  WHATSAPP_TOOLS,
} from "@/lib/server/whatsapp-tools";
import {
  isYoutubeTool,
  runYoutubeTool,
  YOUTUBE_INSTRUCTIONS,
  youtubeAvailable,
  youtubeTools,
} from "@/lib/server/youtube-tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Long answers (and tool calls) can take a while; allow up to 5 minutes.
export const maxDuration = 300;

const MAX_MESSAGES = 40;
const MAX_CHARS = 12_000;
/** Tool loops (pause_turn or client tools) before giving up. */
const MAX_TURNS = 10;

const GITHUB_INSTRUCTIONS = (login: string) =>
  `A conta do GitHub @${login} está conectada (servidor MCP oficial "github"). Use as ferramentas do GitHub para repositórios, código, issues, pull requests, commits, branches, releases e GitHub Actions: busque e leia antes de responder e cite o repositório e o número da issue/PR. Antes de qualquer ação que altere algo (criar ou editar arquivos, abrir/fechar/mesclar PRs, criar issues, comentar, criar branches), diga exatamente o que será feito e peça confirmação, a menos que a usuária já tenha pedido explicitamente essa ação. Nunca apague repositórios nem force alterações em branches protegidas.`;

const NOTION_INSTRUCTIONS = `O workspace do Notion da gerente está conectado (servidor MCP "notion"). Use as ferramentas do Notion quando a pergunta envolver documentos, fichas, procedimentos, atas, escalas ou qualquer conteúdo que possa estar lá: busque antes de responder e cite o título das páginas usadas. Antes de criar ou alterar páginas, confirme com a usuária o que será escrito, a menos que ela tenha pedido explicitamente.`;

interface ChatRequest {
  model?: string;
  messages?: {
    role: "user" | "assistant";
    content: string;
    /** Photos (base64) sent with a user message. */
    images?: { media_type?: string; data?: string }[];
  }[];
  connectors?: string[];
  user?: { name?: string; role?: string };
  /** "voice" = the reply will be spoken aloud (Voz page). */
  style?: "voice" | "notes";
}

const STYLE_INSTRUCTIONS: Record<"voice" | "notes", string> = {
  voice:
    "Você está em uma conversa por voz: a resposta será lida em voz alta no fone. Responda em português falado e natural, em no máximo 3 a 4 frases curtas, sem markdown, sem tabelas, sem listas com símbolos e sem emojis. Diga números de forma falada (ex.: 'cerca de vinte e sete por cento'). Se a pessoa pedir detalhes, ofereça continuar.",
  notes:
    "Você está recebendo a transcrição automática de um microfone (pode ter erros de reconhecimento e frases cortadas). Corrija mentalmente os erros óbvios e responda exatamente o que for pedido.",
};

// Names and roles: letters, digits, spaces and light punctuation only
const NOT_NAME_CHARS = /[^\p{L}\p{N} .,'’()&/-]/gu;

/** Who is using the panel (set in Configurações); short, plain text only. */
function userBlock(user: ChatRequest["user"]) {
  const clean = (v: unknown, max: number) =>
    typeof v === "string"
      ? v.replace(NOT_NAME_CHARS, "").trim().slice(0, max)
      : "";
  const name = clean(user?.name, 60);
  if (!name) {
    return null;
  }
  const role = clean(user?.role, 60);
  return `A pessoa usando o painel agora se chama ${name}${role ? ` (${role})` : ""}. Trate-a pelo primeiro nome.`;
}

type BetaParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];
type BetaMessage = Anthropic.Beta.BetaMessage;

interface Connectors {
  notion: { token: string } | null;
  github: { token: string; login: string } | null;
  google: { token: string; email: string; youtube: boolean } | null;
  gmail: boolean;
  drive: boolean;
  /** Public YouTube data; needs only the server's API key. */
  youtube: boolean;
  /** WhatsApp bridge, only for a browser that entered the access code. */
  whatsapp: boolean;
  notices: string[];
  cookies: string[];
}

const encoder = new TextEncoder();

const NO_CREDITS_TEXT =
  "⚠️ Sem créditos na API do Claude. Respondendo em modo demonstração.";
const NO_CREDITS = /credit balance|billing|insufficient.*(credit|fund)/i;

/** True when the account has no credits left (400 "credit balance is too low"). */
function isOutOfCredits(error: unknown) {
  return error instanceof Anthropic.APIError && NO_CREDITS.test(error.message);
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

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGES = 10;
const MAX_IMAGE_B64 = 5_000_000;

type HistoryMessage = Anthropic.Beta.BetaMessageParam;
type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** Valid photos of a message, as image blocks (newest messages get priority). */
function imageBlocks(
  images: NonNullable<ChatRequest["messages"]>[number]["images"],
  budget: { left: number }
) {
  const blocks: Anthropic.Beta.BetaImageBlockParam[] = [];
  for (const img of images ?? []) {
    if (
      budget.left > 0 &&
      typeof img.data === "string" &&
      img.data.length > 0 &&
      img.data.length <= MAX_IMAGE_B64 &&
      IMAGE_TYPES.has(img.media_type ?? "")
    ) {
      budget.left -= 1;
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type as ImageMediaType,
          data: img.data,
        },
      });
    }
  }
  return blocks;
}

function sanitizeHistory(messages: ChatRequest["messages"]): HistoryMessage[] {
  const kept = (messages ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        (m.content.trim().length > 0 ||
          (m.role === "user" && (m.images?.length ?? 0) > 0))
    )
    .slice(-MAX_MESSAGES);
  const budget = { left: MAX_IMAGES };
  // Walk newest → oldest so recent photos win the image budget
  const out: HistoryMessage[] = [];
  for (let i = kept.length - 1; i >= 0; i--) {
    const m = kept[i];
    if (!m) {
      continue;
    }
    const text = m.content.slice(0, MAX_CHARS);
    const images = m.role === "user" ? imageBlocks(m.images, budget) : [];
    out.unshift(
      images.length > 0
        ? {
            role: m.role,
            content: [
              ...images,
              { type: "text", text: text || "Analise esta imagem." },
            ],
          }
        : { role: m.role, content: text || "(imagem)" }
    );
  }
  return out;
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
    out.google = {
      token: session.token,
      email: session.email,
      youtube: session.youtube,
    };
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
    github: null,
    google: null,
    gmail: false,
    drive: false,
    youtube: Boolean(requested?.includes("youtube") && youtubeAvailable()),
    whatsapp: Boolean(
      requested?.includes("whatsapp") &&
        whatsappConfig() &&
        (await hasAccess(request))
    ),
    notices: [],
    cookies: [],
  };
  if (!connectorsSecret()) {
    return out;
  }
  const wants = {
    notion: requested?.includes("notion") ?? false,
    github: requested?.includes("github") ?? false,
    gmail: requested?.includes("gmail") ?? false,
    drive: requested?.includes("drive") ?? false,
  };
  await Promise.all([
    wants.notion ? resolveNotion(request, out) : null,
    wants.github
      ? readGithubConnection(request).then((g) => {
          out.github = g ? { token: g.token, login: g.login } : null;
        })
      : null,
    wants.gmail || wants.drive || out.youtube
      ? resolveGoogle(request, out, wants)
      : null,
  ]);
  return out;
}

function buildParams(
  model: AiModelId,
  messages: Anthropic.Beta.BetaMessageParam[],
  c: Connectors,
  extras: string[]
): BetaParams {
  const isHaiku = model === "claude-haiku-4-5";
  const betas = [
    ...(isHaiku ? [] : ["server-side-fallback-2026-07-01"]),
    ...(c.notion || c.github ? ["mcp-client-2025-11-20"] : []),
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
    ...(c.github
      ? [{ type: "mcp_toolset" as const, mcp_server_name: "github" }]
      : []),
    ...(c.google ? googleTools({ gmail: c.gmail, drive: c.drive }) : []),
    ...(c.youtube ? youtubeTools(Boolean(c.google?.youtube)) : []),
    ...(c.whatsapp ? WHATSAPP_TOOLS : []),
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
      ...extras.map((text) => ({ type: "text" as const, text })),
      ...(c.notion
        ? [{ type: "text" as const, text: NOTION_INSTRUCTIONS }]
        : []),
      ...(google ? [{ type: "text" as const, text: google }] : []),
      ...(c.github
        ? [{ type: "text" as const, text: GITHUB_INSTRUCTIONS(c.github.login) }]
        : []),
      ...(c.youtube
        ? [{ type: "text" as const, text: YOUTUBE_INSTRUCTIONS }]
        : []),
      ...(c.whatsapp
        ? [{ type: "text" as const, text: WHATSAPP_INSTRUCTIONS }]
        : []),
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
    ...mcpServers(c),
  };
}

/** Remote MCP servers (Notion, GitHub) the Claude API connects to. */
function mcpServers(c: Connectors) {
  const servers = [
    ...(c.notion
      ? [
          {
            type: "url" as const,
            url: NOTION_MCP_URL,
            name: "notion",
            authorization_token: c.notion.token,
          },
        ]
      : []),
    ...(c.github
      ? [
          {
            type: "url" as const,
            url: GITHUB_MCP_URL,
            name: "github",
            authorization_token: c.github.token,
          },
        ]
      : []),
  ];
  return servers.length > 0 ? { mcp_servers: servers } : {};
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

function runClientTool(c: Connectors, name: string, input: unknown) {
  if (c.whatsapp && isWhatsappTool(name)) {
    return runWhatsappTool(name, input);
  }
  if (c.youtube && isYoutubeTool(name)) {
    return runYoutubeTool(
      name,
      input,
      c.google?.youtube ? c.google.token : undefined
    );
  }
  if (c.google && isGoogleTool(name)) {
    return runGoogleTool(c.google.token, name, input);
  }
  return Promise.resolve({
    content: `Ferramenta indisponível: ${name}`,
    isError: true,
  });
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
    const result = await runClientTool(c, block.name, block.input);
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
  const extras = [
    userBlock(body.user),
    body.style ? STYLE_INSTRUCTIONS[body.style] : null,
  ].filter((t): t is string => Boolean(t));
  const params = buildParams(model, history, connectors, extras);
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
          emit(
            isOutOfCredits(error)
              ? { type: "fallback", text: NO_CREDITS_TEXT }
              : { type: "notice", text: `⚠️ ${errorMessage(error)}` }
          );
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
    connectors.github ? "github" : null,
    connectors.gmail ? "gmail" : null,
    connectors.drive ? "drive" : null,
    connectors.youtube ? "youtube" : null,
    connectors.whatsapp ? "whatsapp" : null,
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
