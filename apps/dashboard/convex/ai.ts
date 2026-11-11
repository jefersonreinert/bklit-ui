import { ConvexError, v } from "convex/values";
import { mutation, type QueryCtx, query } from "./_generated/server";

/**
 * Storage of the AI router (providers, settings and the request log).
 * Only the app's server calls these: it signs its own token with the
 * subject "ai-router". Browsers never read the sealed keys; they go
 * through /api/ai/providers, which strips them.
 */

export const AI_SUBJECT = "ai-router";

export async function requireRouter(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.subject !== AI_SUBJECT) {
    throw new ConvexError("Unauthenticated");
  }
}

const status = v.object({
  state: v.union(v.literal("ok"), v.literal("error"), v.literal("unknown")),
  kind: v.optional(v.string()),
  message: v.optional(v.string()),
  checkedAt: v.optional(v.number()),
  latencyMs: v.optional(v.number()),
});

const attempt = v.object({
  provider: v.string(),
  model: v.string(),
  ok: v.boolean(),
  kind: v.optional(v.string()),
  message: v.optional(v.string()),
  ms: v.number(),
  skipped: v.optional(v.string()),
});

export const config = query({
  args: {},
  handler: async (ctx) => {
    await requireRouter(ctx);
    const [providers, settings] = await Promise.all([
      ctx.db.query("aiProviders").take(50),
      ctx.db
        .query("aiSettings")
        .withIndex("by_key", (q) => q.eq("key", "router"))
        .unique(),
    ]);
    return { providers, settings };
  },
});

export const saveSettings = mutation({
  args: {
    order: v.array(v.string()),
    fallbackEnabled: v.boolean(),
    fallbackOn: v.array(v.string()),
    allowAmbiguous: v.boolean(),
    notifySwitch: v.boolean(),
    timeoutMs: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRouter(ctx);
    const current = await ctx.db
      .query("aiSettings")
      .withIndex("by_key", (q) => q.eq("key", "router"))
      .unique();
    const doc = { ...args, key: "router", updatedAt: Date.now() };
    if (current) {
      await ctx.db.patch(current._id, doc);
    } else {
      await ctx.db.insert("aiSettings", doc);
    }
  },
});

/** Partial update of one provider (creates it on first save). */
export const saveProvider = mutation({
  args: {
    provider: v.string(),
    enabled: v.optional(v.boolean()),
    model: v.optional(v.string()),
    /** null removes the key. */
    keySealed: v.optional(v.union(v.string(), v.null())),
    keyLast4: v.optional(v.union(v.string(), v.null())),
    status: v.optional(status),
    /** null clears the pause. */
    cooldownUntil: v.optional(v.union(v.number(), v.null())),
    models: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.optional(v.string()),
          vision: v.optional(v.boolean()),
        })
      )
    ),
    modelsAt: v.optional(v.number()),
  },
  handler: async (ctx, { provider, keySealed, keyLast4, cooldownUntil, ...rest }) => {
    await requireRouter(ctx);
    const current = await ctx.db
      .query("aiProviders")
      .withIndex("by_provider", (q) => q.eq("provider", provider))
      .unique();
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, value] of Object.entries(rest)) {
      if (value !== undefined) {
        patch[k] = value;
      }
    }
    if (keySealed !== undefined) {
      patch.keySealed = keySealed ?? undefined;
    }
    if (keyLast4 !== undefined) {
      patch.keyLast4 = keyLast4 ?? undefined;
    }
    if (cooldownUntil !== undefined) {
      patch.cooldownUntil = cooldownUntil ?? undefined;
    }
    if (current) {
      await ctx.db.patch(current._id, patch);
    } else {
      await ctx.db.insert("aiProviders", {
        provider,
        enabled: false,
        model: "",
        status: { state: "unknown" },
        ...patch,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Starts a request. Same requestId again (a double tap, a retry of the
 * browser) or the same image within `dedupeMs` returns what is known
 * instead of calling a provider again — no duplicate charges.
 */
export const claim = mutation({
  args: {
    requestId: v.string(),
    hash: v.string(),
    task: v.string(),
    dedupeMs: v.number(),
  },
  handler: async (ctx, { requestId, hash, task, dedupeMs }) => {
    await requireRouter(ctx);
    const now = Date.now();
    const same = await ctx.db
      .query("aiRequests")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .unique();
    if (same) {
      if (same.status === "running" && now - same.createdAt < 120_000) {
        return { state: "running" as const };
      }
      if (same.status === "ok") {
        return { state: "done" as const, doc: same };
      }
      // A failed or stuck attempt with this id may run again
      await ctx.db.delete(same._id);
    }
    const recent = await ctx.db
      .query("aiRequests")
      .withIndex("by_hash", (q) => q.eq("hash", hash).gte("createdAt", now - dedupeMs))
      .order("desc")
      .first();
    if (recent?.status === "ok" && recent.task === task) {
      return { state: "done" as const, doc: recent };
    }
    if (recent?.status === "running" && recent.task === task && now - recent.createdAt < 120_000) {
      return { state: "running" as const };
    }
    await ctx.db.insert("aiRequests", {
      requestId,
      hash,
      task,
      status: "running",
      attempts: [],
      createdAt: now,
    });
    // Keep the log small: drop rows older than 30 days, a few at a time
    const old = await ctx.db
      .query("aiRequests")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", now - 30 * 86_400_000))
      .take(20);
    for (const o of old) {
      await ctx.db.delete(o._id);
    }
    return { state: "new" as const };
  },
});

export const finish = mutation({
  args: {
    requestId: v.string(),
    ok: v.boolean(),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    attempts: v.array(attempt),
    result: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, ok, ...rest }) => {
    await requireRouter(ctx);
    const doc = await ctx.db
      .query("aiRequests")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .unique();
    if (doc) {
      await ctx.db.patch(doc._id, {
        ...rest,
        status: ok ? "ok" : "failed",
        finishedAt: Date.now(),
      });
    }
  },
});

/** Notes that a request was answered from the cache (for the log). */
export const logCached = mutation({
  args: { requestId: v.string(), hash: v.string(), task: v.string(), from: v.id("aiRequests") },
  handler: async (ctx, { requestId, hash, task, from }) => {
    await requireRouter(ctx);
    const src = await ctx.db.get(from);
    if (!src || src.requestId === requestId) {
      return;
    }
    const now = Date.now();
    await ctx.db.insert("aiRequests", {
      requestId,
      hash,
      task,
      status: "ok",
      provider: src.provider,
      model: src.model,
      attempts: [],
      result: src.result,
      cached: true,
      createdAt: now,
      finishedAt: now,
    });
  },
});

export const log = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 30 }) => {
    await requireRouter(ctx);
    const rows = await ctx.db
      .query("aiRequests")
      .withIndex("by_createdAt")
      .order("desc")
      .take(Math.min(limit, 100));
    return rows.map((r) => ({
      requestId: r.requestId,
      task: r.task,
      status: r.status,
      provider: r.provider,
      model: r.model,
      attempts: r.attempts,
      cached: r.cached,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
    }));
  },
});
