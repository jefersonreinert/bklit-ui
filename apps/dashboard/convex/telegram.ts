import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * Telegram connector state (mirrors github.com/mcp-telegram/mcp-telegram on
 * the panel). The MTProto work runs in the Node actions of mtproto.ts;
 * this file keeps the single state document, the lock that stops two
 * actions from using the same session at once, and the call log.
 *
 * api_id / api_hash can also come from the Convex environment variables
 * TELEGRAM_API_ID and TELEGRAM_API_HASH (they win over the panel's).
 */

const KEY = "main" as const;
const LOCK_MS = 90_000;
const MAX_CALLS = 200;

export const pendingLogin = v.object({
  kind: v.union(v.literal("qr"), v.literal("phone")),
  session: v.string(),
  startedAt: v.number(),
  phone: v.optional(v.string()),
  phoneCodeHash: v.optional(v.string()),
  codeVia: v.optional(v.string()),
  qrUrl: v.optional(v.string()),
  qrExpiresAt: v.optional(v.number()),
  needsPassword: v.optional(v.boolean()),
  passwordHint: v.optional(v.string()),
});

const meValue = v.object({
  id: v.string(),
  name: v.string(),
  username: v.optional(v.string()),
  phone: v.optional(v.string()),
});

const source = v.union(
  v.literal("panel"),
  v.literal("assistant"),
  v.literal("login")
);

async function getState(ctx: QueryCtx) {
  return await ctx.db
    .query("tgState")
    .withIndex("by_key", (q) => q.eq("key", KEY))
    .unique();
}

async function ensureState(ctx: MutationCtx): Promise<Doc<"tgState">> {
  const existing = await getState(ctx);
  if (existing) {
    return existing;
  }
  const id = await ctx.db.insert("tgState", {
    key: KEY,
    assistantWrites: false,
    optIn: [],
    lockUntil: 0,
  });
  return (await ctx.db.get(id)) as Doc<"tgState">;
}

function envCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  return apiId > 0 && apiHash ? { apiId, apiHash } : null;
}

const mask = (phone?: string) =>
  phone ? `${phone.slice(0, 3)} •••• ${phone.slice(-4)}` : undefined;

function credentialSource(env: boolean, panel: boolean) {
  if (env) {
    return "env" as const;
  }
  return panel ? ("panel" as const) : null;
}

/** Everything the panel shows. Never returns the hash or the session. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const s = await getState(ctx);
    const env = envCredentials();
    const recent = await ctx.db
      .query("tgCalls")
      .withIndex("by_at")
      .order("desc")
      .take(15);
    const p = s?.pending;
    return {
      credentials: Boolean(env || (s?.apiId && s.apiHash)),
      credentialsSource: credentialSource(Boolean(env), Boolean(s?.apiId)),
      apiId: env?.apiId ?? s?.apiId ?? null,
      connected: Boolean(s?.session),
      me: s?.me ?? null,
      connectedAt: s?.connectedAt ?? null,
      pending: p
        ? {
            kind: p.kind,
            startedAt: p.startedAt,
            phone: mask(p.phone),
            codeVia: p.codeVia ?? null,
            qrUrl: p.qrUrl ?? null,
            qrExpiresAt: p.qrExpiresAt ?? null,
            needsPassword: Boolean(p.needsPassword),
            passwordHint: p.passwordHint ?? null,
          }
        : null,
      assistantWrites: s?.assistantWrites ?? false,
      optIn: s?.optIn ?? [],
      lastUsedAt: s?.lastUsedAt ?? null,
      lastError: s?.lastError ?? null,
      lastErrorAt: s?.lastErrorAt ?? null,
      recent: recent.map((c) => ({
        id: c._id,
        tool: c.tool,
        source: c.source,
        ok: c.ok,
        ms: c.ms,
        error: c.error ?? null,
        at: c.at,
      })),
    };
  },
});

/** Settings the panel can change without touching Telegram. */
export const updateSettings = mutation({
  args: {
    assistantWrites: v.optional(v.boolean()),
    optIn: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requirePanel(ctx);
    const s = await ensureState(ctx);
    const allowed = new Set(["stars", "group-calls", "quick-replies"]);
    await ctx.db.patch(s._id, {
      ...(args.assistantWrites === undefined
        ? {}
        : { assistantWrites: args.assistantWrites }),
      ...(args.optIn
        ? { optIn: [...new Set(args.optIn.filter((g) => allowed.has(g)))] }
        : {}),
    });
  },
});

export const cancelLogin = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const s = await getState(ctx);
    if (s?.pending) {
      await ctx.db.patch(s._id, { pending: undefined });
    }
  },
});

// ─── Internal: used by the Node actions ────────────────────────────────

export const secrets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const s = await getState(ctx);
    const env = envCredentials();
    return {
      apiId: env?.apiId ?? s?.apiId ?? null,
      apiHash: env?.apiHash ?? s?.apiHash ?? null,
      session: s?.session ?? null,
      pending: s?.pending ?? null,
      assistantWrites: s?.assistantWrites ?? false,
      optIn: s?.optIn ?? [],
    };
  },
});

export const storeCredentials = internalMutation({
  args: { apiId: v.number(), apiHash: v.string() },
  handler: async (ctx, { apiId, apiHash }) => {
    const s = await ensureState(ctx);
    const changed = s.apiId !== apiId || s.apiHash !== apiHash;
    // A session belongs to the app that created it
    await ctx.db.patch(s._id, {
      apiId,
      apiHash,
      ...(changed
        ? {
            session: undefined,
            me: undefined,
            connectedAt: undefined,
            pending: undefined,
          }
        : {}),
    });
  },
});

export const setPending = internalMutation({
  args: { pending: v.union(pendingLogin, v.null()) },
  handler: async (ctx, { pending }) => {
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, { pending: pending ?? undefined });
  },
});

export const setSession = internalMutation({
  args: { session: v.string(), me: meValue },
  handler: async (ctx, { session, me }) => {
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, {
      session,
      me,
      connectedAt: Date.now(),
      pending: undefined,
      lastError: undefined,
      lastErrorAt: undefined,
    });
  },
});

/** After a tool call: keep a refreshed session, or drop a revoked one. */
export const afterCall = internalMutation({
  args: {
    session: v.union(v.string(), v.null()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { session, error }) => {
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, {
      lastUsedAt: Date.now(),
      ...(session === null
        ? { session: undefined, me: undefined, connectedAt: undefined }
        : { session }),
      ...(error ? { lastError: error, lastErrorAt: Date.now() } : {}),
    });
  },
});

export const clearSession = internalMutation({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx, { reason }) => {
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, {
      session: undefined,
      me: undefined,
      connectedAt: undefined,
      pending: undefined,
      ...(reason ? { lastError: reason, lastErrorAt: Date.now() } : {}),
    });
  },
});

/** One MTProto connection at a time per session (avoids AUTH_KEY_DUPLICATED). */
export const acquire = internalMutation({
  args: {},
  handler: async (ctx) => {
    const s = await ensureState(ctx);
    const now = Date.now();
    if (s.lockUntil > now) {
      return false;
    }
    await ctx.db.patch(s._id, { lockUntil: now + LOCK_MS });
    return true;
  },
});

export const release = internalMutation({
  args: {},
  handler: async (ctx) => {
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, { lockUntil: 0 });
  },
});

export const logCall = internalMutation({
  args: {
    tool: v.string(),
    source,
    ok: v.boolean(),
    ms: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tgCalls", {
      ...args,
      error: args.error?.slice(0, 300),
      at: Date.now(),
    });
    const old = await ctx.db
      .query("tgCalls")
      .withIndex("by_at")
      .order("desc")
      .collect();
    for (const c of old.slice(MAX_CALLS)) {
      await ctx.db.delete(c._id);
    }
  },
});
