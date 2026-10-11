import { v } from "convex/values";
import {
  findMtTool,
  isTradeTool,
  MT_TOOLS,
  type MtTool,
  normalizeArgs,
} from "../lib/metatrader/catalog";
import {
  listTools,
  type McpTarget,
  callTool as mcpCallTool,
} from "../lib/metatrader/mcp";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  type ActionCtx,
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * MetaTrader connector: the panel and the assistant use every tool of
 * metatrader-mcp-server, which runs next to the MT5 terminal on the
 * person's Windows PC/VPS. Convex keeps the endpoint and its auth headers
 * (never sent back to the browser), enforces the trading switches and logs
 * each call.
 */

const KEY = "main" as const;
const MAX_CALLS = 300;
const MAX_HEADERS = 8;
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
const TRAILING_SLASH = /\/$/;
const ARGS_PREVIEW = 160;
const REST_TIMEOUT = 30_000;

const transport = v.union(v.literal("streamable-http"), v.literal("sse"));
const source = v.union(v.literal("panel"), v.literal("assistant"));

async function getState(ctx: QueryCtx) {
  return await ctx.db
    .query("mtState")
    .withIndex("by_key", (q) => q.eq("key", KEY))
    .unique();
}

async function ensureState(ctx: MutationCtx): Promise<Doc<"mtState">> {
  const existing = await getState(ctx);
  if (existing) {
    return existing;
  }
  const id = await ctx.db.insert("mtState", {
    key: KEY,
    allowTrading: false,
    assistantTrading: false,
  });
  return (await ctx.db.get(id)) as Doc<"mtState">;
}

/** What the panel shows. Never returns the auth header values. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const s = await getState(ctx);
    const recent = await ctx.db
      .query("mtCalls")
      .withIndex("by_at")
      .order("desc")
      .take(25);
    return {
      configured: Boolean(s?.url),
      url: s?.url ?? null,
      transport: s?.transport ?? "streamable-http",
      headerNames: Object.keys(s?.headers ?? {}),
      restUrl: s?.restUrl ?? null,
      quoteUrl: s?.quoteUrl ?? null,
      allowTrading: s?.allowTrading ?? false,
      assistantTrading: s?.assistantTrading ?? false,
      serverTools: s?.serverTools ?? null,
      lastOkAt: s?.lastOkAt ?? null,
      lastError: s?.lastError ?? null,
      lastErrorAt: s?.lastErrorAt ?? null,
      recent: recent.map((c) => ({
        id: c._id,
        tool: c.tool,
        source: c.source,
        ok: c.ok,
        ms: c.ms,
        args: c.args ?? null,
        error: c.error ?? null,
        at: c.at,
      })),
    };
  },
});

function checkUrl(raw: string, label: string, protocols: string[]) {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error(`${label}: URL inválido.`);
  }
  if (!protocols.includes(u.protocol)) {
    throw new Error(`${label}: use ${protocols.join(" ou ")}`);
  }
  return u.toString();
}

/** "Name: value" lines → header record (validated). */
function parseHeaders(text: string) {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const cut = trimmed.indexOf(":");
    const name = cut > 0 ? trimmed.slice(0, cut).trim() : "";
    const value = cut > 0 ? trimmed.slice(cut + 1).trim() : "";
    if (!(HEADER_NAME.test(name) && value)) {
      throw new Error(`Cabeçalho inválido: "${trimmed.slice(0, 40)}"`);
    }
    out[name] = value;
  }
  if (Object.keys(out).length > MAX_HEADERS) {
    throw new Error(`No máximo ${MAX_HEADERS} cabeçalhos.`);
  }
  return out;
}

export const saveConfig = mutation({
  args: {
    url: v.string(),
    transport,
    /** null keeps the saved headers; "" removes them. */
    headers: v.union(v.string(), v.null()),
    restUrl: v.string(),
    quoteUrl: v.string(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const s = await ensureState(ctx);
    const url = checkUrl(a.url, "Servidor MCP", ["https:", "http:"]);
    const restUrl = a.restUrl.trim()
      ? checkUrl(a.restUrl, "API HTTP", ["https:", "http:"]).replace(
          TRAILING_SLASH,
          ""
        )
      : undefined;
    const quoteUrl = a.quoteUrl.trim()
      ? checkUrl(a.quoteUrl, "Cotações", ["wss:", "ws:"])
      : undefined;
    await ctx.db.patch(s._id, {
      url,
      transport: a.transport,
      restUrl,
      quoteUrl,
      ...(a.headers === null ? {} : { headers: parseHeaders(a.headers) }),
      serverTools: undefined,
      lastError: undefined,
      lastErrorAt: undefined,
    });
  },
});

export const setTrading = mutation({
  args: {
    allowTrading: v.optional(v.boolean()),
    assistantTrading: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, {
      ...(a.allowTrading === undefined ? {} : { allowTrading: a.allowTrading }),
      ...(a.assistantTrading === undefined
        ? {}
        : { assistantTrading: a.assistantTrading }),
    });
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const s = await getState(ctx);
    if (s) {
      await ctx.db.delete(s._id);
    }
  },
});

export const clearLog = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const calls = await ctx.db.query("mtCalls").take(1000);
    for (const c of calls) {
      await ctx.db.delete(c._id);
    }
  },
});

export const secrets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const s = await getState(ctx);
    return {
      url: s?.url ?? null,
      transport: s?.transport ?? ("streamable-http" as const),
      headers: s?.headers ?? {},
      restUrl: s?.restUrl ?? null,
      allowTrading: s?.allowTrading ?? false,
      assistantTrading: s?.assistantTrading ?? false,
      serverTools: s?.serverTools ?? null,
    };
  },
});

export const afterCall = internalMutation({
  args: {
    tool: v.string(),
    source,
    ok: v.boolean(),
    ms: v.number(),
    args: v.optional(v.string()),
    error: v.optional(v.string()),
    reachable: v.boolean(),
    serverTools: v.optional(v.array(v.string())),
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    await ctx.db.insert("mtCalls", {
      tool: a.tool,
      source: a.source,
      ok: a.ok,
      ms: a.ms,
      args: a.args,
      error: a.error,
      at: now,
    });
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, {
      ...(a.reachable
        ? { lastOkAt: now, lastError: undefined, lastErrorAt: undefined }
        : { lastError: a.error, lastErrorAt: now }),
      ...(a.serverTools ? { serverTools: a.serverTools } : {}),
    });
    const old = await ctx.db
      .query("mtCalls")
      .withIndex("by_at")
      .order("desc")
      .collect();
    for (const c of old.slice(MAX_CALLS)) {
      await ctx.db.delete(c._id);
    }
  },
});

/* -------------------------------- actions -------------------------------- */

interface Secrets {
  url: string | null;
  transport: "streamable-http" | "sse";
  headers: Record<string, string>;
  restUrl: string | null;
  allowTrading: boolean;
  assistantTrading: boolean;
  serverTools: string[] | null;
}

export interface MtOutput {
  ok: boolean;
  /** The tool's value: dict, list or CSV text. */
  value: unknown;
  /** Error or notice for the person. */
  message: string | null;
  ms: number;
}

async function requireAuth(ctx: ActionCtx) {
  if (!(await ctx.auth.getUserIdentity())) {
    throw new Error("Unauthenticated");
  }
}

const target = (s: Secrets): McpTarget => ({
  url: s.url as string,
  transport: s.transport,
  headers: s.headers,
});

const preview = (args: Record<string, unknown>) => {
  const text = JSON.stringify(args);
  return text === "{}" ? undefined : text.slice(0, ARGS_PREVIEW);
};

function failureText(value: unknown, msg: unknown) {
  if (typeof msg === "string" && msg) {
    return msg;
  }
  if (typeof value === "string" && value) {
    return value.slice(0, 500);
  }
  return "O MT5 recusou o pedido.";
}

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/** Network/HTTP failures, as opposed to a tool answering with an error. */
const UNREACHABLE =
  /fetch failed|ECONN|ENOTFOUND|HTTP \d|a tempo|Acesso negado|404|não anunciou|getaddrinfo/i;

async function callRest(
  s: Secrets,
  tool: MtTool,
  args: Record<string, unknown>
) {
  if (!s.restUrl) {
    throw new Error(
      `${tool.name} só existe na API HTTP (metatrader-http-server). Indique o endereço dela em Conectores → MetaTrader.`
    );
  }
  const res = await fetch(`${s.restUrl}${tool.rest?.path(args) ?? ""}`, {
    headers: { ...s.headers, accept: "application/json" },
    signal: AbortSignal.timeout(REST_TIMEOUT),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new Error(
      `HTTP ${res.status}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`
    );
  }
  return body;
}

function denied(s: Secrets, name: string, from: "panel" | "assistant") {
  const known = Boolean(findMtTool(name)) || s.serverTools?.includes(name);
  if (!known) {
    return `Ferramenta desconhecida: ${name}`;
  }
  if (!isTradeTool(name)) {
    return null;
  }
  if (from === "panel" && !s.allowTrading) {
    return 'Negociação desligada. Ligue "Permitir ordens pelo painel" em Conectores → MetaTrader.';
  }
  if (from === "assistant" && !s.assistantTrading) {
    return "O assistente só pode consultar. Ordens e fechos pelo assistente ligam-se em Conectores → MetaTrader.";
  }
  return null;
}

async function runMtTool(
  ctx: ActionCtx,
  name: string,
  rawArgs: Record<string, unknown>,
  from: "panel" | "assistant"
): Promise<MtOutput> {
  const s: Secrets = await ctx.runQuery(internal.metatrader.secrets, {});
  if (!s.url) {
    return {
      ok: false,
      value: null,
      message:
        "O MetaTrader não está configurado. Vá a Conectores → MetaTrader.",
      ms: 0,
    };
  }
  const refused = denied(s, name, from);
  if (refused) {
    return { ok: false, value: null, message: refused, ms: 0 };
  }
  const tool = findMtTool(name);
  const args = normalizeArgs(tool, rawArgs);
  const started = Date.now();
  let out: MtOutput;
  let reachable = true;
  try {
    if (tool?.rest) {
      const value = await callRest(s, tool, args);
      out = { ok: true, value, message: null, ms: 0 };
    } else {
      const r = await mcpCallTool(target(s), name, args);
      const msg = (r.value as { message?: unknown } | null)?.message;
      out = {
        ok: r.ok,
        value: r.value,
        message: r.ok ? null : failureText(r.value, msg),
        ms: 0,
      };
    }
  } catch (err) {
    const message = errorText(err);
    reachable = !UNREACHABLE.test(message);
    out = { ok: false, value: null, message, ms: 0 };
  }
  out.ms = Date.now() - started;
  await ctx.runMutation(internal.metatrader.afterCall, {
    tool: name,
    source: from,
    ok: out.ok,
    ms: out.ms,
    args: preview(args),
    error: out.ok ? undefined : (out.message ?? undefined),
    reachable,
  });
  return out;
}

export const call = action({
  args: {
    name: v.string(),
    args: v.optional(v.any()),
    source: v.optional(source),
  },
  handler: async (ctx, a): Promise<MtOutput> => {
    await requireAuth(ctx);
    const args =
      a.args && typeof a.args === "object"
        ? (a.args as Record<string, unknown>)
        : {};
    return await runMtTool(ctx, a.name, args, a.source ?? "panel");
  },
});

/** Several read tools at once (dashboard): one action, parallel calls. */
export const callMany = action({
  args: {
    calls: v.array(v.object({ name: v.string(), args: v.optional(v.any()) })),
  },
  handler: async (ctx, a): Promise<MtOutput[]> => {
    await requireAuth(ctx);
    return await Promise.all(
      a.calls.map((c) =>
        runMtTool(
          ctx,
          c.name,
          c.args && typeof c.args === "object"
            ? (c.args as Record<string, unknown>)
            : {},
          "panel"
        )
      )
    );
  },
});

/** Connects, lists the server's tools and compares them with the catalog. */
export const test = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    ok: boolean;
    message: string;
    tools: string[];
    missing: string[];
    extra: string[];
  }> => {
    await requireAuth(ctx);
    const s: Secrets = await ctx.runQuery(internal.metatrader.secrets, {});
    if (!s.url) {
      return {
        ok: false,
        message: "Indique primeiro o endereço do servidor.",
        tools: [],
        missing: [],
        extra: [],
      };
    }
    const started = Date.now();
    try {
      const tools = (await listTools(target(s))).map((t) => t.name);
      const mcpNames = MT_TOOLS.filter((t) => !t.rest).map((t) => t.name);
      const missing = mcpNames.filter((n) => !tools.includes(n));
      const extra = tools.filter((n) => !findMtTool(n));
      await ctx.runMutation(internal.metatrader.afterCall, {
        tool: "tools/list",
        source: "panel",
        ok: true,
        ms: Date.now() - started,
        reachable: true,
        serverTools: tools,
      });
      return {
        ok: true,
        message: `Ligado: o servidor expõe ${tools.length} ferramentas.`,
        tools,
        missing,
        extra,
      };
    } catch (err) {
      const message = errorText(err);
      await ctx.runMutation(internal.metatrader.afterCall, {
        tool: "tools/list",
        source: "panel",
        ok: false,
        ms: Date.now() - started,
        error: message,
        reachable: false,
      });
      return { ok: false, message, tools: [], missing: [], extra: [] };
    }
  },
});
