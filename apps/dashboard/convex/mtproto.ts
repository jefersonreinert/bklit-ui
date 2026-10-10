"use node";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TelegramService } from "@overpod/mcp-telegram/service";
import { v } from "convex/values";
import { TelegramClient } from "telegram";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";
import {
  checkCredentials,
  normalizePhone,
  OPT_IN_GROUPS,
  PANEL_ONLY_TOOLS,
  type ToolOutput,
  type ToolTier,
  tierAllowed,
  toOutput,
} from "../lib/telegram/core";
import { collectFiles, prepareArgs } from "../lib/telegram/files";
import {
  codeStep,
  friendlyError,
  type LoginClient,
  type LoginStep,
  passwordCheck,
  qrStep,
  rpcCode,
  SESSION_DEAD,
} from "../lib/telegram/login";
// tools/ is not in the package's exports map; the relative path is bundled
import { registerTools } from "../node_modules/@overpod/mcp-telegram/dist/tools/index.js";
import { internal } from "./_generated/api";
import { type ActionCtx, action } from "./_generated/server";

/**
 * Telegram connector, Node side: GramJS (MTProto) and every tool of
 * @overpod/mcp-telegram, run per request from the StringSession saved in
 * Convex. Login (QR code or phone code + 2FA) is split into steps so it
 * works between serverless calls.
 */

const TOOL_TIMEOUT_MS = 120_000;
const LOCK_WAIT_MS = 30_000;
const NOT_DIGITS = /\D/g;

interface Secrets {
  apiId: number | null;
  apiHash: string | null;
  session: string | null;
  pending: {
    kind: "qr" | "phone";
    session: string;
    startedAt: number;
    phone?: string;
    phoneCodeHash?: string;
    codeVia?: string;
  } | null;
  assistantWrites: boolean;
  optIn: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readSecrets(ctx: ActionCtx): Promise<Secrets> {
  return await ctx.runQuery(internal.telegram.secrets, {});
}

async function requireAuth(ctx: ActionCtx) {
  if (!(await ctx.auth.getUserIdentity())) {
    throw new Error("Unauthenticated");
  }
}

function credentials(s: Secrets) {
  if (!(s.apiId && s.apiHash)) {
    throw new Error(
      "Falta o api_id e o api_hash do Telegram (my.telegram.org → API development tools)."
    );
  }
  return { apiId: s.apiId, apiHash: s.apiHash };
}

/** Waits for the session lock so two calls never share one auth key. */
async function withLock<T>(ctx: ActionCtx, fn: () => Promise<T>): Promise<T> {
  const until = Date.now() + LOCK_WAIT_MS;
  while (!(await ctx.runMutation(internal.telegram.acquire, {}))) {
    if (Date.now() > until) {
      throw new Error(
        "O Telegram está ocupado com outro pedido. Tente de novo em instantes."
      );
    }
    await sleep(700);
  }
  try {
    return await fn();
  } finally {
    await ctx.runMutation(internal.telegram.release, {});
  }
}

function gramClient(session: string, apiId: number, apiHash: string) {
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
    baseLogger: new Logger(LogLevel.ERROR),
  });
}

/** The LoginClient surface over a real TelegramClient. */
const loginClient = (c: TelegramClient): LoginClient => ({
  invoke: (req) => c.invoke(req as Parameters<TelegramClient["invoke"]>[0]),
  switchDc: async (dcId) => {
    // Same private call mcp-telegram uses for LoginTokenMigrateTo
    await (c as unknown as { _switchDC(dc: number): Promise<void> })._switchDC(
      dcId
    );
  },
});

const saved = (c: TelegramClient) => c.session.save() as unknown as string;

async function destroy(c: TelegramClient) {
  try {
    await c.destroy();
  } catch {
    // Teardown is best-effort; the result was already decided
  }
}

async function finishLogin(ctx: ActionCtx, c: TelegramClient) {
  const me = (await c.getMe()) as Api.User;
  const name =
    [me.firstName, me.lastName].filter(Boolean).join(" ") ||
    me.username ||
    "Conta do Telegram";
  await ctx.runMutation(internal.telegram.setSession, {
    session: saved(c),
    me: {
      id: me.id.toString(),
      name,
      ...(me.username ? { username: me.username } : {}),
      ...(me.phone ? { phone: `+${me.phone}` } : {}),
    },
  });
  await ctx.runMutation(internal.telegram.logCall, {
    tool: "login",
    source: "login",
    ok: true,
    ms: 0,
  });
}

interface StepResult {
  status: "qr" | "code" | "password" | "connected" | "error";
  message?: string;
  url?: string;
  expiresAt?: number;
  hint?: string | null;
  via?: string;
}

/** Saves what a login step produced and says what the person does next. */
async function applyStep(
  ctx: ActionCtx,
  c: TelegramClient,
  step: LoginStep,
  pending: NonNullable<Secrets["pending"]>
): Promise<StepResult> {
  if (step.kind === "success") {
    await finishLogin(ctx, c);
    return { status: "connected" };
  }
  if (step.kind === "password") {
    await ctx.runMutation(internal.telegram.setPending, {
      pending: {
        ...pending,
        session: saved(c),
        needsPassword: true,
        ...(step.hint ? { passwordHint: step.hint } : {}),
      },
    });
    return { status: "password", hint: step.hint };
  }
  await ctx.runMutation(internal.telegram.setPending, {
    pending: {
      ...pending,
      session: saved(c),
      qrUrl: step.url,
      qrExpiresAt: step.expiresAt,
    },
  });
  return { status: "qr", url: step.url, expiresAt: step.expiresAt };
}

async function loginError(ctx: ActionCtx, err: unknown): Promise<StepResult> {
  const message = friendlyError(err);
  await ctx.runMutation(internal.telegram.logCall, {
    tool: "login",
    source: "login",
    ok: false,
    ms: 0,
    error: message,
  });
  return { status: "error", message };
}

// ─── Credentials and login ─────────────────────────────────────────────

export const saveCredentials = action({
  args: { apiId: v.string(), apiHash: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; message: string }> => {
    await requireAuth(ctx);
    const checked = checkCredentials(args.apiId, args.apiHash);
    if (!checked.ok) {
      return checked;
    }
    await ctx.runMutation(internal.telegram.storeCredentials, {
      apiId: checked.apiId,
      apiHash: checked.apiHash,
    });
    return { ok: true, message: "Credenciais guardadas no servidor." };
  },
});

/** Starts a QR login: returns the tg://login link the panel draws as QR. */
export const startQr = action({
  args: {},
  handler: async (ctx): Promise<StepResult> => {
    await requireAuth(ctx);
    const { apiId, apiHash } = credentials(await readSecrets(ctx));
    const c = gramClient("", apiId, apiHash);
    try {
      await c.connect();
      const step = await qrStep(loginClient(c), apiId, apiHash);
      return await applyStep(ctx, c, step, {
        kind: "qr",
        session: saved(c),
        startedAt: Date.now(),
      });
    } catch (err) {
      return await loginError(ctx, err);
    } finally {
      await destroy(c);
    }
  },
});

/** Polled while the QR is on screen: refreshes it or finishes the login. */
export const checkQr = action({
  args: {},
  handler: async (ctx): Promise<StepResult> => {
    await requireAuth(ctx);
    const s = await readSecrets(ctx);
    const { apiId, apiHash } = credentials(s);
    if (s.pending?.kind !== "qr") {
      return s.session
        ? { status: "connected" }
        : { status: "error", message: "Nenhum login por QR em andamento." };
    }
    const c = gramClient(s.pending.session, apiId, apiHash);
    try {
      await c.connect();
      const step = await qrStep(loginClient(c), apiId, apiHash);
      return await applyStep(ctx, c, step, s.pending);
    } catch (err) {
      return await loginError(ctx, err);
    } finally {
      await destroy(c);
    }
  },
});

/** Phone login, step 1: Telegram sends a code to the app (or SMS). */
export const sendCode = action({
  args: { phone: v.string() },
  handler: async (ctx, args): Promise<StepResult> => {
    await requireAuth(ctx);
    const phone = normalizePhone(args.phone);
    if (!phone) {
      return {
        status: "error",
        message:
          "Use o número completo com o código do país, ex.: +55 11 99999-0000.",
      };
    }
    const { apiId, apiHash } = credentials(await readSecrets(ctx));
    const c = gramClient("", apiId, apiHash);
    try {
      await c.connect();
      const sent = await c.sendCode({ apiId, apiHash }, phone);
      const via = sent.isCodeViaApp ? "app" : "sms";
      await ctx.runMutation(internal.telegram.setPending, {
        pending: {
          kind: "phone",
          session: saved(c),
          startedAt: Date.now(),
          phone,
          phoneCodeHash: sent.phoneCodeHash,
          codeVia: via,
        },
      });
      return { status: "code", via };
    } catch (err) {
      return await loginError(ctx, err);
    } finally {
      await destroy(c);
    }
  },
});

/** Phone login, step 2: the code from Telegram. */
export const submitCode = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<StepResult> => {
    await requireAuth(ctx);
    const s = await readSecrets(ctx);
    const { apiId, apiHash } = credentials(s);
    const p = s.pending;
    if (!(p?.kind === "phone" && p.phone && p.phoneCodeHash)) {
      return { status: "error", message: "Peça um código primeiro." };
    }
    const c = gramClient(p.session, apiId, apiHash);
    try {
      await c.connect();
      const step = await codeStep(loginClient(c), {
        phone: p.phone,
        phoneCodeHash: p.phoneCodeHash,
        code: args.code.replace(NOT_DIGITS, ""),
      });
      return await applyStep(ctx, c, step, p);
    } catch (err) {
      return await loginError(ctx, err);
    } finally {
      await destroy(c);
    }
  },
});

/** Two-step verification password (QR or phone login). Never stored. */
export const submitPassword = action({
  args: { password: v.string() },
  handler: async (ctx, args): Promise<StepResult> => {
    await requireAuth(ctx);
    const s = await readSecrets(ctx);
    const { apiId, apiHash } = credentials(s);
    if (!s.pending) {
      return { status: "error", message: "Nenhum login em andamento." };
    }
    const c = gramClient(s.pending.session, apiId, apiHash);
    try {
      await c.connect();
      const step = await passwordCheck(loginClient(c), args.password);
      return await applyStep(ctx, c, step, s.pending);
    } catch (err) {
      return await loginError(ctx, err);
    } finally {
      await destroy(c);
    }
  },
});

/** Ends the session on Telegram's side (Settings → Devices) and here. */
export const logout = action({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; message: string }> => {
    await requireAuth(ctx);
    const s = await readSecrets(ctx);
    if (!(s.session && s.apiId && s.apiHash)) {
      await ctx.runMutation(internal.telegram.clearSession, {});
      return { ok: true, message: "Desconectado." };
    }
    const session = s.session;
    const { apiId, apiHash } = credentials(s);
    return await withLock(ctx, async () => {
      const c = gramClient(session, apiId, apiHash);
      let revoked = false;
      try {
        await c.connect();
        await c.invoke(new Api.auth.LogOut());
        revoked = true;
      } catch {
        // Still forget the session locally
      } finally {
        await destroy(c);
        await ctx.runMutation(internal.telegram.clearSession, {});
      }
      return {
        ok: true,
        message: revoked
          ? "Sessão encerrada no Telegram e removida do painel."
          : "Sessão removida do painel. Confira em Telegram → Configurações → Dispositivos se ela ainda aparece.",
      };
    });
  },
});

// ─── Tools ─────────────────────────────────────────────────────────────

interface RunInput {
  apiId: number;
  apiHash: string;
  session: string;
  optIn: string[];
  name: string;
  args: Record<string, unknown>;
  source: "panel" | "assistant";
  assistantWrites: boolean;
}

/**
 * Runs one mcp-telegram tool through an in-memory MCP client, so argument
 * validation and output formatting are exactly the package's own.
 */
async function runTool(input: RunInput) {
  for (const [group, flag] of Object.entries(OPT_IN_GROUPS)) {
    process.env[flag] = input.optIn.includes(group) ? "1" : "";
  }
  const dir = await mkdtemp(join(tmpdir(), "casa-brasa-tg-"));
  const tg = new TelegramService(input.apiId, input.apiHash, {
    sessionPath: join(dir, "session"),
  });
  tg.setSessionString(input.session);
  const server = new McpServer({ name: "casa-brasa-telegram", version: "1" });
  registerTools(server, tg);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "casa-brasa", version: "1" });
  try {
    await server.connect(serverSide);
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === input.name);
    if (!tool) {
      throw new Error(
        `Ferramenta ${input.name} indisponível (grupo opcional desligado em Conectores → Telegram?).`
      );
    }
    let tier: ToolTier = tool.annotations?.readOnlyHint ? "read-only" : "write";
    if (tool.annotations?.destructiveHint) {
      tier = "destructive";
    }
    if (!tierAllowed(tier, input.source, input.assistantWrites)) {
      throw new Error(
        "O assistente só pode ler o Telegram. Para enviar ou alterar, ligue 'Assistente pode enviar e alterar' em Conectores → Telegram, ou use a página Telegram."
      );
    }
    const { prepared, outPaths } = await prepareArgs(
      input.args,
      tool.inputSchema,
      dir
    );
    const result = await client.callTool(
      { name: input.name, arguments: prepared },
      undefined,
      { timeout: TOOL_TIMEOUT_MS }
    );
    const out = toOutput(result as { content?: unknown; isError?: unknown });
    await collectFiles(outPaths, out);
    return { out, tier, lastError: tg.lastError };
  } finally {
    await tg.disconnect().catch(() => undefined);
    await client.close().catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    // An empty string means the service dropped a revoked session
    input.session = tg.getSessionString();
  }
}

export const callTool = action({
  args: {
    name: v.string(),
    args: v.optional(v.any()),
    source: v.optional(v.union(v.literal("panel"), v.literal("assistant"))),
  },
  handler: async (ctx, a): Promise<ToolOutput> => {
    await requireAuth(ctx);
    const source = a.source ?? "panel";
    if (PANEL_ONLY_TOOLS.has(a.name)) {
      return {
        ok: false,
        text: "Use o login e a desconexão do cartão Telegram em Conectores.",
        images: [],
        files: [],
      };
    }
    const s = await readSecrets(ctx);
    const { apiId, apiHash } = credentials(s);
    if (!s.session) {
      return {
        ok: false,
        text: "O Telegram não está conectado. Entre em Conectores → Telegram.",
        images: [],
        files: [],
      };
    }
    const session = s.session;
    const started = Date.now();
    return await withLock(ctx, async () => {
      const input: RunInput = {
        apiId,
        apiHash,
        session,
        optIn: s.optIn,
        name: a.name,
        args:
          a.args && typeof a.args === "object"
            ? (a.args as Record<string, unknown>)
            : {},
        source,
        assistantWrites: s.assistantWrites,
      };
      let out: ToolOutput;
      try {
        out = (await runTool(input)).out;
      } catch (err) {
        const code = rpcCode(err);
        out = {
          ok: false,
          text: friendlyError(err),
          images: [],
          files: [],
        };
        if (SESSION_DEAD.has(code)) {
          input.session = "";
        }
      }
      const dead = input.session === "";
      await ctx.runMutation(internal.telegram.afterCall, {
        session: dead ? null : input.session,
        ...(out.ok ? {} : { error: out.text.slice(0, 300) }),
      });
      await ctx.runMutation(internal.telegram.logCall, {
        tool: a.name,
        source,
        ok: out.ok,
        ms: Date.now() - started,
        ...(out.ok ? {} : { error: out.text }),
      });
      if (dead) {
        out.text +=
          "\n\nA sessão do Telegram foi encerrada. Conecte novamente em Conectores → Telegram.";
      }
      return out;
    });
  },
});
