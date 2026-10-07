import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS, type AiModelId, DEFAULT_MODEL } from "@/lib/ai-models";
import type {
  CodeItem,
  CodePhase,
  CodeSessionDetail,
  CodeSessionSummary,
} from "@/lib/code/types";

/**
 * Cloud coding sessions through Claude Managed Agents: Anthropic hosts the
 * agent loop and an isolated container where the selected GitHub
 * repositories are cloned. One agent + one environment are provisioned
 * once (found again by name on later requests) and every "Nova sessão"
 * starts a session against them.
 */

const APP = "casa-brasa-code";
const AGENT_NAME = "Casa Brasa Code";
const ENV_NAME = "casa-brasa-code";

const SYSTEM = `Você é um agente de programação trabalhando em repositórios do GitHub clonados em /workspace/<nome-do-repo>.
- Responda sempre em português do Brasil, de forma objetiva.
- Antes de mudar código, leia o suficiente para entender o projeto e siga o estilo existente.
- Rode os testes, lint e typecheck do projeto quando existirem.
- Para entregar mudanças: crie um branch com prefixo claude/, faça commits claros e dê git push para o origin.
- Depois do push, termine a resposta com uma linha por repositório no formato exato:
  BRANCH: <owner>/<repo> <nome-do-branch>
- Nunca faça push direto para o branch padrão nem reescreva histórico.`;

export type CodeMode = "auto" | "acceptEdits" | "plan";
export const isMode = (m: unknown): m is CodeMode =>
  m === "auto" || m === "acceptEdits" || m === "plan";

const WEB_OFF = [
  { name: "web_fetch" as const, enabled: false },
  { name: "web_search" as const, enabled: false },
];

/**
 * Permission modes offered by Claude Code on mobile, mapped to toolset
 * policies: auto (server classifier), accept edits (files free, commands
 * ask) and plan (read-only, commands ask).
 */
export function toolsFor(mode: CodeMode) {
  const askBash = {
    name: "bash" as const,
    enabled: true,
    permission_policy: { type: "always_ask" as const },
  };
  if (mode === "plan") {
    return [
      {
        type: "agent_toolset_20260401" as const,
        default_config: {
          enabled: true,
          permission_policy: { type: "always_allow" as const },
        },
        configs: [
          ...WEB_OFF,
          { name: "write" as const, enabled: false },
          { name: "edit" as const, enabled: false },
          askBash,
        ],
      },
    ];
  }
  return [
    {
      type: "agent_toolset_20260401" as const,
      default_config: {
        enabled: true,
        permission_policy: {
          type: mode === "auto" ? ("auto" as const) : ("always_allow" as const),
        },
      },
      configs: mode === "auto" ? WEB_OFF : [...WEB_OFF, askBash],
    },
  ];
}

const PLAN_PREFIX =
  "[Modo plano] Investigue o código e responda com um plano detalhado, passo a passo. Não altere arquivos nem faça commits até eu aprovar.\n\n";

let setup: Promise<{ agentId: string; environmentId: string }> | null = null;

export function codeClient() {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

async function findAgent(client: Anthropic) {
  for await (const agent of client.beta.agents.list()) {
    if (agent.metadata?.app === APP && !agent.archived_at) {
      return agent.id;
    }
  }
  const agent = await client.beta.agents.create({
    name: AGENT_NAME,
    description: "Agente de programação do painel Casa Brasa (página Code).",
    model: DEFAULT_MODEL,
    system: SYSTEM,
    metadata: { app: APP },
    tools: [
      {
        type: "agent_toolset_20260401",
        default_config: { enabled: true, permission_policy: { type: "auto" } },
        configs: [
          { name: "web_fetch", enabled: false },
          { name: "web_search", enabled: false },
        ],
      },
    ],
  });
  return agent.id;
}

async function findEnvironment(client: Anthropic) {
  for await (const env of client.beta.environments.list()) {
    if (env.name === ENV_NAME && !env.archived_at) {
      return env.id;
    }
  }
  const env = await client.beta.environments.create({
    name: ENV_NAME,
    config: {
      type: "cloud",
      networking: {
        type: "limited",
        allow_package_managers: true,
        allow_mcp_servers: true,
      },
    },
  });
  return env.id;
}

/** Agent + environment IDs: env vars win, else found or created once. */
function ensureSetup(client: Anthropic) {
  const agentId = process.env.CODE_AGENT_ID;
  const environmentId = process.env.CODE_ENVIRONMENT_ID;
  if (agentId && environmentId) {
    return Promise.resolve({ agentId, environmentId });
  }
  setup ??= Promise.all([
    agentId ?? findAgent(client),
    environmentId ?? findEnvironment(client),
  ])
    .then(([a, e]) => ({ agentId: a, environmentId: e }))
    .catch((err: unknown) => {
      setup = null;
      throw err;
    });
  return setup;
}

/* -------------------------------- mapping -------------------------------- */

type Session = Awaited<ReturnType<Anthropic["beta"]["sessions"]["retrieve"]>>;
type SessionEvent = Awaited<
  ReturnType<Anthropic["beta"]["sessions"]["events"]["list"]>
>["data"][number];

function reposOf(session: Session) {
  const fromMeta = session.metadata?.repos;
  if (fromMeta) {
    return fromMeta
      .split(",")
      .filter(Boolean)
      .map((r) => r.split("@")[0] ?? r);
  }
  return session.resources.flatMap((r) =>
    r.type === "github_repository"
      ? [r.url.replace("https://github.com/", "")]
      : []
  );
}

function branchesOf(session: Session) {
  const out: Record<string, string> = {};
  for (const r of (session.metadata?.repos ?? "").split(",")) {
    const [repo, branch] = r.split("@");
    if (repo && branch) {
      out[repo] = branch;
    }
  }
  return out;
}

function phaseOf(session: Session, stop: string | null): CodePhase {
  if (session.archived_at) {
    return "archived";
  }
  if (session.status === "terminated") {
    return "completed";
  }
  if (session.status === "idle") {
    return stop === "requires_action" ? "needs_input" : "review";
  }
  return "working";
}

function costOf(session: Session) {
  const cents = Number(session.usage?.list_cost?.amount ?? 0);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

function summary(session: Session, stop: string | null): CodeSessionSummary {
  return {
    id: session.id,
    title: session.title ?? "Sessão sem título",
    phase: phaseOf(session, stop),
    stopReason: stop,
    repos: reposOf(session),
    branches: branchesOf(session),
    model: session.metadata?.model ?? null,
    mode: isMode(session.metadata?.mode) ? session.metadata.mode : "auto",
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    costUsd: costOf(session),
  };
}

async function lastStop(client: Anthropic, session: Session) {
  if (session.status !== "idle") {
    return null;
  }
  const page = await client.beta.sessions.events.list(session.id, {
    types: ["session.status_idle"],
    order: "desc",
    limit: 1,
  });
  const last = page.data[0];
  return last?.type === "session.status_idle" ? last.stop_reason.type : null;
}

const MAX_TEXT = 4000;
const clip = (s: string, n = MAX_TEXT) =>
  s.length > n ? `${s.slice(0, n)}\n…` : s;

function textOf(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((b: { type?: string; text?: string }) =>
      b.type === "text" ? (b.text ?? "") : ""
    )
    .join("");
}

/** One-line description of a tool call's input. */
function describeInput(input: Record<string, unknown>) {
  const pick =
    input.command ??
    input.file_path ??
    input.path ??
    input.pattern ??
    input.url ??
    input.query;
  if (typeof pick === "string") {
    return pick;
  }
  return JSON.stringify(input).slice(0, 200);
}

function toItem(e: SessionEvent, pendingIds: Set<string>): CodeItem | null {
  switch (e.type) {
    case "user.message":
      return {
        kind: "user",
        id: e.id,
        text: textOf(e.content).replace(PLAN_PREFIX, ""),
        images: e.content.filter((b) => b.type === "image").length,
      };
    case "agent.message":
      return { kind: "agent", id: e.id, text: textOf(e.content) };
    case "agent.tool_use":
    case "agent.mcp_tool_use":
      return {
        kind: "tool",
        id: e.id,
        name:
          e.type === "agent.mcp_tool_use"
            ? `${e.mcp_server_name}:${e.name}`
            : e.name,
        summary: clip(describeInput(e.input), 300),
        pending: pendingIds.has(e.id),
        result: null,
        isError: false,
      };
    case "agent.tool_result":
    case "agent.mcp_tool_result":
      return {
        kind: "result",
        id: e.id,
        toolUseId:
          e.type === "agent.tool_result" ? e.tool_use_id : e.mcp_tool_use_id,
        text: clip(textOf(e.content)),
        isError: Boolean(e.is_error),
      };
    case "session.error":
      return {
        kind: "error",
        id: e.id,
        text: e.error.message || e.error.type,
      };
    case "user.interrupt":
      return { kind: "status", id: e.id, text: "Interrompido" };
    case "agent.thread_context_compacted":
      return { kind: "status", id: e.id, text: "Contexto resumido" };
    default:
      return null;
  }
}

/** Folds tool results into their calls so the UI renders one row per call. */
function timeline(events: SessionEvent[], stopIds: string[]): CodeItem[] {
  const pending = new Set(stopIds);
  const items: CodeItem[] = [];
  const tools = new Map<string, Extract<CodeItem, { kind: "tool" }>>();
  for (const e of events) {
    const item = toItem(e, pending);
    if (!item) {
      continue;
    }
    if (item.kind === "result") {
      const call = tools.get(item.toolUseId);
      if (call) {
        call.result = item.text;
        call.isError = item.isError;
        call.pending = false;
      }
      continue;
    }
    if (item.kind === "tool") {
      tools.set(item.id, item);
    }
    if (item.kind !== "agent" || item.text.trim()) {
      items.push(item);
    }
  }
  return items;
}

/* --------------------------------- public -------------------------------- */

export async function listSessions(client: Anthropic) {
  const { agentId } = await ensureSetup(client);
  const page = await client.beta.sessions.list({
    agent_id: agentId,
    include_archived: true,
    limit: 50,
  });
  return Promise.all(
    page.data.map(async (s) =>
      summary(s, await lastStop(client, s).catch(() => null))
    )
  );
}

export async function getSession(
  client: Anthropic,
  id: string
): Promise<CodeSessionDetail> {
  const session = await client.beta.sessions.retrieve(id);
  const events: SessionEvent[] = [];
  for await (const e of client.beta.sessions.events.list(id, { limit: 1000 })) {
    events.push(e);
  }
  const lastIdle = [...events]
    .reverse()
    .find((e) => e.type === "session.status_idle");
  const stop =
    session.status === "idle" && lastIdle?.type === "session.status_idle"
      ? lastIdle.stop_reason
      : null;
  const pendingIds = stop?.type === "requires_action" ? stop.event_ids : [];
  return {
    ...summary(session, stop?.type ?? null),
    items: timeline(events, pendingIds),
  };
}

const isModel = (m: unknown): m is AiModelId =>
  AI_MODELS.some((x) => x.id === m);

export interface ImageInput {
  mediaType: string;
  data: string;
}

function userContent(text: string, images: ImageInput[]) {
  return [
    ...images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType,
        data: img.data,
      },
    })),
    { type: "text" as const, text },
  ];
}

export async function createSession(
  client: Anthropic,
  input: {
    prompt: string;
    repos: { repo: string; branch: string | null }[];
    model: unknown;
    mode: CodeMode;
    images: ImageInput[];
    budgetUsd: number | null;
    /** Needed for private repos; public ones clone without it. */
    githubToken: string | null;
  }
) {
  const { agentId, environmentId } = await ensureSetup(client);
  const model = isModel(input.model) ? input.model : DEFAULT_MODEL;
  const text =
    input.mode === "plan" ? `${PLAN_PREFIX}${input.prompt}` : input.prompt;
  const session = await client.beta.sessions.create({
    agent: {
      type: "agent_with_overrides",
      id: agentId,
      model,
      tools: toolsFor(input.mode),
    },
    environment_id: environmentId,
    title: input.prompt.split("\n")[0]?.slice(0, 80) || "Nova sessão",
    resources: input.repos.map(({ repo, branch }) => ({
      type: "github_repository" as const,
      url: `https://github.com/${repo}`,
      ...(input.githubToken ? { authorization_token: input.githubToken } : {}),
      ...(branch
        ? { checkout: { type: "branch" as const, name: branch } }
        : {}),
    })),
    initial_events: [
      { type: "user.message", content: userContent(text, input.images) },
    ],
    metadata: {
      app: APP,
      repos: input.repos
        .map((r) => (r.branch ? `${r.repo}@${r.branch}` : r.repo))
        .join(",")
        .slice(0, 500),
      model,
      mode: input.mode,
    },
    ...(input.budgetUsd
      ? {
          budget: {
            type: "limit" as const,
            max_list_cost: {
              amount: String(Math.round(input.budgetUsd * 100)),
              currency: "USD" as const,
            },
          },
        }
      : {}),
  });
  return summary(session, null);
}

/** Switches the permission mode (the session must be idle). */
export async function setMode(client: Anthropic, id: string, mode: CodeMode) {
  await client.beta.sessions.update(id, {
    agent: { tools: toolsFor(mode) },
    metadata: { mode },
  });
}

export async function renameSession(
  client: Anthropic,
  id: string,
  title: string
) {
  await client.beta.sessions.update(id, { title });
}

export async function deleteSession(client: Anthropic, id: string) {
  await client.beta.sessions.delete(id);
}

export async function sendMessage(
  client: Anthropic,
  id: string,
  text: string,
  images: ImageInput[] = []
) {
  await client.beta.sessions.events.send(id, {
    events: [{ type: "user.message", content: userContent(text, images) }],
  });
}

export async function interrupt(client: Anthropic, id: string) {
  await client.beta.sessions.events.send(id, {
    events: [{ type: "user.interrupt" }],
  });
}

export async function confirmTool(
  client: Anthropic,
  id: string,
  toolUseId: string,
  allow: boolean
) {
  await client.beta.sessions.events.send(id, {
    events: [
      {
        type: "user.tool_confirmation",
        tool_use_id: toolUseId,
        result: allow ? "allow" : "deny",
      },
    ],
  });
}

export async function archiveSession(client: Anthropic, id: string) {
  await client.beta.sessions.archive(id);
}

export function apiError(err: unknown) {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 502;
    if (status === 401) {
      return { status, message: "Chave da API inválida (ANTHROPIC_API_KEY)." };
    }
    if (status === 403 || status === 404) {
      return {
        status,
        message:
          "Sua conta da API ainda não tem acesso aos Managed Agents, ou a sessão não existe.",
      };
    }
    return { status, message: err.message };
  }
  return {
    status: 500,
    message: err instanceof Error ? err.message : "Falha inesperada.",
  };
}
