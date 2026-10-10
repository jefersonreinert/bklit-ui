import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { alertReasons } from "../lib/ict/alerts";
import { analyzePost, GrokError, listModels, pickModel } from "../lib/ict/grok";
import {
  DEFAULT_ALERT_RULES,
  ICT_ACCOUNT,
  type IctAnalysisResult,
  type MonitorStatus,
  type XPost,
} from "../lib/ict/types";
import { fetchTimeline, resolveUser, XApiError } from "../lib/ict/x-client";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * The Inner Circle Trader monitor. A cron (convex/crons.ts) calls `tick`
 * every few minutes on the Convex servers, so collection keeps running
 * with the panel closed: it reads new posts of @I_Am_The_ICT from the X
 * API (timeline + since_id), stores them once (unique postId, checked
 * inside a transaction), then queues one Grok analysis per new post.
 * The page subscribes to the queries below and updates in real time.
 *
 * Secrets (Convex environment variables, never sent to the browser):
 *   X_BEARER_TOKEN  X API v2 app-only Bearer token
 *   XAI_API_KEY     xAI (Grok) API key
 *   XAI_MODEL       optional; otherwise picked from GET /v1/models
 *
 * Costs: each tick that is due makes 1 X request (+1 per extra page and
 * +1 once to resolve the user id); each analysed post is 1 Grok request.
 * Nothing calls Grok when there are no new posts, and finished analyses
 * are reused, never redone on page load.
 */

const LOCK_MS = 9 * 60_000;
/** First run reads up to this many pages of 100 posts (history). */
const BACKFILL_PAGES = 2;
/** Later runs page through at most this many pages per tick. */
const SYNC_PAGES = 5;
/** Analyses queued per tick (oldest pending first after the newest). */
const ANALYSES_PER_TICK = 10;
const MAX_ANALYSIS_ATTEMPTS = 3;
const STUCK_RUNNING_MS = 15 * 60_000;
const MIN_INTERVAL = 5;
const MAX_INTERVAL = 24 * 60;

type State = Doc<"ictState">;

const DEFAULT_STATE: Omit<State, "_id" | "_creationTime"> = {
  key: "main",
  enabled: true,
  aiEnabled: true,
  intervalMinutes: 15,
  interests: [],
  alertRules: DEFAULT_ALERT_RULES,
  status: "idle",
  lockUntil: 0,
  nextAllowedAt: 0,
  consecutiveFailures: 0,
  syncs: 0,
  postsStored: 0,
  analysesDone: 0,
  analysesFailed: 0,
};

async function readState(ctx: QueryCtx) {
  return await ctx.db
    .query("ictState")
    .withIndex("by_key", (q) => q.eq("key", "main"))
    .unique();
}

async function ensureState(ctx: MutationCtx): Promise<State> {
  const found = await readState(ctx);
  if (found) {
    return found;
  }
  const id = await ctx.db.insert("ictState", DEFAULT_STATE);
  return (await ctx.db.get(id)) as State;
}

const configured = () => ({
  x: Boolean(process.env.X_BEARER_TOKEN),
  grok: Boolean(process.env.XAI_API_KEY),
});

const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ scope: "ict", event, ...data }));

/* ================================ Sync ================================== */

/** Takes the sync lock when a run is due; null when it is not. */
export const acquire = internalMutation({
  args: { force: v.boolean() },
  handler: async (ctx, { force }) => {
    const s = await ensureState(ctx);
    const now = Date.now();
    if (s.lockUntil > now) {
      return null; // another run is in progress
    }
    if (!(force || s.enabled)) {
      return null;
    }
    if (!force && now < s.nextAllowedAt) {
      return null; // rate limit window or error backoff
    }
    const due =
      !s.lastCheckAt ||
      now - s.lastCheckAt >= s.intervalMinutes * 60_000 - 30_000;
    if (!(force || due)) {
      return null;
    }
    await ctx.db.patch(s._id, {
      lockUntil: now + LOCK_MS,
      lastCheckAt: now,
      status: "syncing",
    });
    return s;
  },
});

export const finish = internalMutation({
  args: {
    status: v.string(),
    patch: v.object({
      userId: v.optional(v.string()),
      sinceId: v.optional(v.string()),
      resumeToken: v.optional(v.union(v.string(), v.null())),
      resumeNewestId: v.optional(v.union(v.string(), v.null())),
      lastError: v.optional(v.string()),
      nextAllowedAt: v.optional(v.number()),
      rateRemaining: v.optional(v.number()),
      rateResetAt: v.optional(v.number()),
    }),
    ok: v.boolean(),
  },
  handler: async (ctx, { status, patch, ok }) => {
    const s = await ensureState(ctx);
    const now = Date.now();
    const failures = ok ? 0 : s.consecutiveFailures + 1;
    const { resumeToken, resumeNewestId, ...rest } = patch;
    await ctx.db.patch(s._id, {
      ...rest,
      resumeToken:
        resumeToken === null ? undefined : (resumeToken ?? s.resumeToken),
      resumeNewestId:
        resumeNewestId === null
          ? undefined
          : (resumeNewestId ?? s.resumeNewestId),
      status: s.enabled ? status : "paused",
      lockUntil: 0,
      consecutiveFailures: failures,
      syncs: s.syncs + 1,
      ...(ok
        ? { lastSuccessAt: now }
        : {
            lastErrorAt: now,
            // Back off 5, 10, 20… minutes (max 2 h) unless the API said when
            nextAllowedAt:
              patch.nextAllowedAt ??
              now + Math.min(120, 5 * 2 ** (failures - 1)) * 60_000,
          }),
    });
  },
});

/** Stores new posts once; returns the ids that were really new. */
export const storePosts = internalMutation({
  args: { posts: v.array(v.any()) },
  handler: async (ctx, { posts }) => {
    const s = await ensureState(ctx);
    const inserted: string[] = [];
    for (const p of posts as XPost[]) {
      const exists = await ctx.db
        .query("ictPosts")
        .withIndex("by_postId", (q) => q.eq("postId", p.postId))
        .first();
      if (exists) {
        continue;
      }
      await ctx.db.insert("ictPosts", {
        postId: p.postId,
        authorId: p.authorId,
        username: p.username,
        text: p.text,
        createdAt: p.createdAt,
        url: p.url,
        conversationId: p.conversationId,
        references: p.references,
        media: p.media,
        urls: p.urls,
        metrics: p.metrics,
        raw: p.raw,
        fetchedAt: Date.now(),
        analysisStatus: "pending",
        searchText: p.text,
        favorite: false,
        read: false,
      });
      inserted.push(p.postId);
      await raiseAlert(ctx, s, p.postId, p.text, null);
    }
    const newest = (posts as XPost[]).reduce(
      (n, p) => Math.max(n, p.createdAt),
      s.lastPostAt ?? 0
    );
    await ctx.db.patch(s._id, {
      postsStored: s.postsStored + inserted.length,
      lastPostAt: newest || undefined,
    });
    return inserted;
  },
});

async function raiseAlert(
  ctx: MutationCtx,
  s: State,
  postId: string,
  text: string,
  analysis: {
    category: string;
    relevance: "low" | "medium" | "high";
    concepts: string[];
  } | null
) {
  const reasons = alertReasons(s.alertRules, { text, analysis });
  if (reasons.length === 0) {
    return;
  }
  const existing = await ctx.db
    .query("ictAlerts")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .first();
  if (existing) {
    // One alert per post: add the new reasons, never a second alert
    const merged = [...new Set([...existing.reasons, ...reasons])];
    if (merged.length !== existing.reasons.length) {
      await ctx.db.patch(existing._id, { reasons: merged });
    }
    return;
  }
  await ctx.db.insert("ictAlerts", {
    postId,
    reasons,
    read: false,
    createdAt: Date.now(),
  });
}

/** Pending (or stuck) posts to analyse, newest first. */
export const pendingPosts = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const pending = await ctx.db
      .query("ictPosts")
      .withIndex("by_status", (q) => q.eq("analysisStatus", "pending"))
      .order("desc")
      .take(limit);
    const stuck = await ctx.db
      .query("ictPosts")
      .withIndex("by_status", (q) => q.eq("analysisStatus", "running"))
      .take(limit);
    const cutoff = Date.now() - STUCK_RUNNING_MS;
    return [
      ...pending,
      ...stuck.filter((p) => (p.analysisStartedAt ?? 0) < cutoff),
    ]
      .slice(0, limit)
      .map((p) => p.postId);
  },
});

function errorStatus(err: unknown): {
  status: MonitorStatus;
  message: string;
  nextAllowedAt?: number;
} {
  if (err instanceof XApiError) {
    if (err.kind === "auth") {
      return { status: "auth_error", message: err.message };
    }
    if (err.kind === "rate_limit") {
      return {
        status: "rate_limited",
        message: err.message,
        nextAllowedAt: err.resetAt ?? Date.now() + 15 * 60_000,
      };
    }
    if (err.kind === "unavailable") {
      return { status: "unavailable", message: err.message };
    }
  }
  return {
    status: "error",
    message: err instanceof Error ? err.message : String(err),
  };
}

async function collect(state: State, bearer: string) {
  const userId =
    state.userId ?? (await resolveUser(ICT_ACCOUNT.username, bearer)).id;
  const resuming = Boolean(state.resumeToken);
  const first = !(state.sinceId || resuming);
  const result = await fetchTimeline(userId, ICT_ACCOUNT.username, bearer, {
    sinceId: state.sinceId ?? null,
    startToken: state.resumeToken ?? null,
    maxPages: first ? BACKFILL_PAGES : SYNC_PAGES,
  });
  // The newest id of the whole (possibly multi-tick) pagination
  const newest = resuming
    ? (state.resumeNewestId ?? result.newestId)
    : result.newestId;
  // Stop history backfill at BACKFILL_PAGES; later gaps resume next tick
  const resumeToken = first ? null : result.nextToken;
  return { userId, result, newest, resumeToken };
}

export const tick = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force = false }) => {
    const bearer = process.env.X_BEARER_TOKEN;
    const state = await ctx.runMutation(internal.ict.acquire, { force });
    if (!state) {
      return;
    }
    if (!bearer) {
      await ctx.runMutation(internal.ict.finish, {
        status: "not_configured",
        ok: false,
        patch: {
          lastError: "X_BEARER_TOKEN não está configurado no Convex.",
          nextAllowedAt: Date.now() + 60 * 60_000,
        },
      });
      return;
    }
    try {
      const { userId, result, newest, resumeToken } = await collect(
        state,
        bearer
      );
      const inserted = await ctx.runMutation(internal.ict.storePosts, {
        posts: result.posts,
      });
      await ctx.runMutation(internal.ict.finish, {
        status: "idle",
        ok: true,
        patch: {
          userId,
          // Advance the cursor only once the whole gap was read
          ...(resumeToken
            ? { resumeToken, resumeNewestId: newest ?? undefined }
            : {
                sinceId: newest ?? state.sinceId,
                resumeToken: null,
                resumeNewestId: null,
              }),
          rateRemaining: result.rateLimit?.remaining ?? undefined,
          rateResetAt: result.rateLimit?.resetAt ?? undefined,
        },
      });
      log("sync", {
        fetched: result.posts.length,
        inserted: inserted.length,
        pages: result.pages,
      });
    } catch (err) {
      const e = errorStatus(err);
      log("sync_error", { status: e.status, message: e.message });
      await ctx.runMutation(internal.ict.finish, {
        status: e.status,
        ok: false,
        patch: { lastError: e.message, nextAllowedAt: e.nextAllowedAt },
      });
    }
    if (state.aiEnabled && process.env.XAI_API_KEY) {
      const ids = await ctx.runQuery(internal.ict.pendingPosts, {
        limit: ANALYSES_PER_TICK,
      });
      for (const [i, postId] of ids.entries()) {
        await ctx.scheduler.runAfter(i * 3000, internal.ict.analyze, {
          postId,
          attempt: 1,
        });
      }
    }
  },
});

/* =============================== Analysis =============================== */

/** Marks a post as being analysed; null if it should not run now. */
export const claim = internalMutation({
  args: { postId: v.string(), force: v.boolean() },
  handler: async (ctx, { postId, force }) => {
    const post = await ctx.db
      .query("ictPosts")
      .withIndex("by_postId", (q) => q.eq("postId", postId))
      .first();
    if (!post) {
      return null;
    }
    const busy =
      post.analysisStatus === "running" &&
      Date.now() - (post.analysisStartedAt ?? 0) < STUCK_RUNNING_MS;
    if (!force && (post.analysisStatus === "completed" || busy)) {
      return null;
    }
    await ctx.db.patch(post._id, {
      analysisStatus: "running",
      analysisStartedAt: Date.now(),
    });
    const s = await ensureState(ctx);
    return { post, model: s.grokModel ?? null };
  },
});

export const saveAnalysis = internalMutation({
  args: {
    postId: v.string(),
    model: v.string(),
    attempt: v.number(),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    /** Failed but will be retried: keep the post pending. */
    willRetry: v.boolean(),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db
      .query("ictPosts")
      .withIndex("by_postId", (q) => q.eq("postId", args.postId))
      .first();
    const s = await ensureState(ctx);
    const now = Date.now();
    if (!args.result) {
      await ctx.db.insert("ictAnalyses", {
        postId: args.postId,
        model: args.model,
        status: "failed",
        error: args.error,
        attempt: args.attempt,
        createdAt: now,
      });
      if (post) {
        // A failed re-analysis keeps the previous completed one
        const previous = await ctx.db
          .query("ictAnalyses")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .filter((f) => f.eq(f.field("status"), "completed"))
          .first();
        let status: "completed" | "pending" | "failed" = "failed";
        if (previous) {
          status = "completed";
        } else if (args.willRetry) {
          status = "pending";
        }
        await ctx.db.patch(post._id, { analysisStatus: status });
      }
      await ctx.db.patch(s._id, {
        analysesFailed: s.analysesFailed + 1,
        lastGrokError: args.error,
        lastGrokErrorAt: now,
      });
      return;
    }
    const r = JSON.parse(args.result) as IctAnalysisResult;
    await ctx.db.insert("ictAnalyses", {
      postId: args.postId,
      model: args.model,
      status: "completed",
      result: args.result,
      summary: r.summary_pt,
      category: r.category,
      relevance: r.relevance,
      attempt: args.attempt,
      createdAt: now,
    });
    await ctx.db.patch(s._id, {
      analysesDone: s.analysesDone + 1,
      grokModel: args.model,
    });
    if (!post) {
      return;
    }
    const concepts = r.concepts.map((c) => c.name);
    await ctx.db.patch(post._id, {
      analysisStatus: "completed",
      category: r.category,
      relevance: r.relevance,
      concepts,
      searchText: `${post.text}\n${r.summary_pt}\n${r.main_message}\n${concepts.join(" ")}`,
    });
    await raiseAlert(ctx, s, post.postId, post.text, {
      category: r.category,
      relevance: r.relevance,
      concepts,
    });
  },
});

function postInput(p: Doc<"ictPosts">): XPost {
  return {
    postId: p.postId,
    authorId: p.authorId,
    username: p.username,
    text: p.text,
    createdAt: p.createdAt,
    url: p.url,
    conversationId: p.conversationId,
    references: p.references,
    media: p.media,
    urls: p.urls,
    metrics: p.metrics,
    raw: "",
  };
}

export const analyze = internalAction({
  args: {
    postId: v.string(),
    attempt: v.number(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { postId, attempt, force = false }) => {
    const key = process.env.XAI_API_KEY;
    if (!key) {
      return;
    }
    const claimed = await ctx.runMutation(internal.ict.claim, {
      postId,
      force,
    });
    if (!claimed) {
      return;
    }
    let model = process.env.XAI_MODEL || claimed.model;
    try {
      if (!model) {
        model = pickModel(await listModels(key));
        if (!model) {
          throw new GrokError(
            "Nenhum modelo Grok disponível para esta chave.",
            404,
            false
          );
        }
      }
      const { result, model: used } = await analyzePost(
        postInput(claimed.post),
        key,
        model
      );
      await ctx.runMutation(internal.ict.saveAnalysis, {
        postId,
        model: used,
        attempt,
        result: JSON.stringify(result),
        willRetry: false,
      });
      log("analysis", { postId, model: used });
    } catch (err) {
      const retryable = err instanceof GrokError ? err.retryable : true;
      const willRetry = retryable && attempt < MAX_ANALYSIS_ATTEMPTS;
      const message = err instanceof Error ? err.message : String(err);
      log("analysis_error", { postId, attempt, willRetry, message });
      await ctx.runMutation(internal.ict.saveAnalysis, {
        postId,
        model: model ?? "",
        attempt,
        error: message,
        willRetry,
      });
      if (willRetry) {
        await ctx.scheduler.runAfter(
          2 ** attempt * 60_000,
          internal.ict.analyze,
          { postId, attempt: attempt + 1, force }
        );
      }
    }
  },
});

/* ============================ Panel (public) ============================ */

async function latestAnalysis(ctx: QueryCtx, postId: string) {
  const runs = await ctx.db
    .query("ictAnalyses")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .order("desc")
    .take(10);
  const done = runs.find((r) => r.status === "completed");
  return {
    result: done?.result
      ? (JSON.parse(done.result) as IctAnalysisResult)
      : null,
    model: done?.model ?? null,
    analyzedAt: done?.createdAt ?? null,
    lastError: runs[0]?.status === "failed" ? (runs[0].error ?? null) : null,
    runs: runs.length,
  };
}

async function withAnalysis(ctx: QueryCtx, p: Doc<"ictPosts">) {
  const { raw: _raw, searchText: _search, ...post } = p;
  return { ...post, analysis: await latestAnalysis(ctx, p.postId) };
}

const settingsOf = (s: State | null) => {
  const base = s ?? { ...DEFAULT_STATE, status: "idle" };
  return {
    enabled: base.enabled,
    aiEnabled: base.aiEnabled,
    intervalMinutes: base.intervalMinutes,
    interests: base.interests,
    alertRules: base.alertRules,
  };
};

export const overview = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const s = await readState(ctx);
    const now = Date.now();
    const all = await ctx.db
      .query("ictPosts")
      .withIndex("by_created")
      .order("desc")
      .take(5000);
    const latest = all[0] ? await withAnalysis(ctx, all[0]) : null;
    const alerts = await ctx.db
      .query("ictAlerts")
      .withIndex("by_created")
      .order("desc")
      .take(20);
    return {
      account: ICT_ACCOUNT,
      configured: configured(),
      settings: settingsOf(s),
      state: s
        ? {
            status: s.enabled || s.status === "syncing" ? s.status : "paused",
            lastCheckAt: s.lastCheckAt ?? null,
            lastSuccessAt: s.lastSuccessAt ?? null,
            lastPostAt: s.lastPostAt ?? null,
            lastError: s.lastError ?? null,
            lastErrorAt: s.lastErrorAt ?? null,
            lastGrokError: s.lastGrokError ?? null,
            lastGrokErrorAt: s.lastGrokErrorAt ?? null,
            grokModel: s.grokModel ?? null,
            nextAllowedAt: s.nextAllowedAt,
            rateRemaining: s.rateRemaining ?? null,
            rateResetAt: s.rateResetAt ?? null,
            userId: s.userId ?? null,
            syncs: s.syncs,
            analysesDone: s.analysesDone,
            analysesFailed: s.analysesFailed,
          }
        : null,
      counts: {
        total: all.length,
        last24h: all.filter((p) => now - p.createdAt < 86_400_000).length,
        unanalyzed: all.filter((p) => p.analysisStatus !== "completed").length,
        failed: all.filter((p) => p.analysisStatus === "failed").length,
        important: all.filter((p) => p.relevance === "high").length,
        favorites: all.filter((p) => p.favorite).length,
        unread: all.filter((p) => !p.read).length,
      },
      latest,
      alerts: alerts.map((a) => ({
        id: a._id,
        postId: a.postId,
        reasons: a.reasons,
        read: a.read,
        createdAt: a.createdAt,
        excerpt:
          all.find((p) => p.postId === a.postId)?.text.slice(0, 140) ?? "",
      })),
    };
  },
});

/** Posts query in newest-first order, for the feed's index choice. */
const postsBy = (ctx: QueryCtx) =>
  ctx.db.query("ictPosts").withIndex("by_created");

const feedFilter = {
  category: v.optional(v.string()),
  relevance: v.optional(v.string()),
  favorites: v.optional(v.boolean()),
  pending: v.optional(v.boolean()),
  since: v.optional(v.number()),
};

export const feed = query({
  args: { paginationOpts: paginationOptsValidator, ...feedFilter },
  handler: async (ctx, args) => {
    await requirePanel(ctx);
    const since = args.since ?? 0;
    let q: ReturnType<typeof postsBy>;
    if (args.favorites) {
      q = ctx.db
        .query("ictPosts")
        .withIndex("by_favorite", (i) =>
          i.eq("favorite", true).gte("createdAt", since)
        );
    } else if (args.category) {
      const category = args.category;
      q = ctx.db
        .query("ictPosts")
        .withIndex("by_category", (i) =>
          i.eq("category", category).gte("createdAt", since)
        );
    } else if (args.relevance) {
      const relevance = args.relevance;
      q = ctx.db
        .query("ictPosts")
        .withIndex("by_relevance", (i) =>
          i.eq("relevance", relevance).gte("createdAt", since)
        );
    } else {
      q = ctx.db
        .query("ictPosts")
        .withIndex("by_created", (i) => i.gte("createdAt", since));
    }
    const filtered = q
      .order("desc")
      .filter((f) =>
        f.and(
          args.category ? f.eq(f.field("category"), args.category) : true,
          args.relevance ? f.eq(f.field("relevance"), args.relevance) : true,
          args.pending ? f.neq(f.field("analysisStatus"), "completed") : true
        )
      );
    const page = await filtered.paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map((p) => withAnalysis(ctx, p))),
    };
  },
});

export const search = query({
  args: { text: v.string(), ...feedFilter },
  handler: async (ctx, args) => {
    await requirePanel(ctx);
    const text = args.text.trim().slice(0, 200);
    if (!text) {
      return [];
    }
    const hits = await ctx.db
      .query("ictPosts")
      .withSearchIndex("search_text", (s) => {
        let b = s.search("searchText", text);
        if (args.category) {
          b = b.eq("category", args.category);
        }
        if (args.relevance) {
          b = b.eq("relevance", args.relevance);
        }
        if (args.favorites) {
          b = b.eq("favorite", true);
        }
        return b;
      })
      .take(50);
    const since = args.since ?? 0;
    return await Promise.all(
      hits.filter((p) => p.createdAt >= since).map((p) => withAnalysis(ctx, p))
    );
  },
});

export const analysisHistory = query({
  args: { postId: v.string() },
  handler: async (ctx, { postId }) => {
    await requirePanel(ctx);
    const runs = await ctx.db
      .query("ictAnalyses")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .order("desc")
      .take(20);
    return runs.map((r) => ({
      id: r._id,
      status: r.status,
      model: r.model,
      summary: r.summary ?? null,
      category: r.category ?? null,
      relevance: r.relevance ?? null,
      error: r.error ?? null,
      createdAt: r.createdAt,
    }));
  },
});

export const updateSettings = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    aiEnabled: v.optional(v.boolean()),
    intervalMinutes: v.optional(v.number()),
    interests: v.optional(v.array(v.string())),
    alertRules: v.optional(
      v.object({
        newPost: v.boolean(),
        categories: v.array(v.string()),
        keywords: v.array(v.string()),
        concepts: v.array(v.string()),
        minRelevance: v.union(
          v.literal("low"),
          v.literal("medium"),
          v.literal("high"),
          v.null()
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requirePanel(ctx);
    const s = await ensureState(ctx);
    const clean = (list: string[]) =>
      [
        ...new Set(list.map((x) => x.trim().slice(0, 60)).filter(Boolean)),
      ].slice(0, 50);
    const patch: Partial<State> = {};
    if (args.enabled !== undefined) {
      patch.enabled = args.enabled;
      patch.status = args.enabled ? "idle" : "paused";
      if (args.enabled) {
        patch.nextAllowedAt = 0;
      }
    }
    if (args.aiEnabled !== undefined) {
      patch.aiEnabled = args.aiEnabled;
    }
    if (args.intervalMinutes !== undefined) {
      patch.intervalMinutes = Math.round(
        Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, args.intervalMinutes))
      );
    }
    if (args.interests) {
      patch.interests = clean(args.interests);
    }
    if (args.alertRules) {
      patch.alertRules = {
        ...args.alertRules,
        categories: clean(args.alertRules.categories),
        keywords: clean(args.alertRules.keywords),
        concepts: clean(args.alertRules.concepts),
      };
    }
    await ctx.db.patch(s._id, patch);
  },
});

/** "Atualizar agora": runs a sync right away (still one at a time). */
export const syncNow = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    await ensureState(ctx);
    await ctx.scheduler.runAfter(0, internal.ict.tick, { force: true });
  },
});

export const reanalyze = mutation({
  args: { postId: v.string() },
  handler: async (ctx, { postId }) => {
    await requirePanel(ctx);
    const post = await ctx.db
      .query("ictPosts")
      .withIndex("by_postId", (q) => q.eq("postId", postId))
      .first();
    if (!post) {
      throw new Error("Publicação não encontrada.");
    }
    // Keeps the previous analysis until the new one is saved
    await ctx.scheduler.runAfter(0, internal.ict.analyze, {
      postId,
      attempt: 1,
      force: true,
    });
  },
});

/** Queues analysis of pending posts now (e.g. after turning AI back on). */
export const analyzePending = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const pending = await ctx.db
      .query("ictPosts")
      .withIndex("by_status", (q) => q.eq("analysisStatus", "pending"))
      .order("desc")
      .take(ANALYSES_PER_TICK);
    const failed = await ctx.db
      .query("ictPosts")
      .withIndex("by_status", (q) => q.eq("analysisStatus", "failed"))
      .order("desc")
      .take(ANALYSES_PER_TICK);
    const ids = [...pending, ...failed].slice(0, ANALYSES_PER_TICK);
    for (const [i, p] of ids.entries()) {
      await ctx.scheduler.runAfter(i * 3000, internal.ict.analyze, {
        postId: p.postId,
        attempt: 1,
        force: p.analysisStatus === "failed",
      });
    }
    return ids.length;
  },
});

export const setFlags = mutation({
  args: {
    postId: v.string(),
    favorite: v.optional(v.boolean()),
    read: v.optional(v.boolean()),
  },
  handler: async (ctx, { postId, favorite, read }) => {
    await requirePanel(ctx);
    const post = await ctx.db
      .query("ictPosts")
      .withIndex("by_postId", (q) => q.eq("postId", postId))
      .first();
    if (!post) {
      return;
    }
    await ctx.db.patch(post._id, {
      ...(favorite === undefined ? {} : { favorite }),
      ...(read === undefined ? {} : { read }),
    });
  },
});

export const markAlertsRead = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const unread = await ctx.db
      .query("ictAlerts")
      .withIndex("by_created")
      .order("desc")
      .take(200);
    for (const a of unread) {
      if (!a.read) {
        await ctx.db.patch(a._id, { read: true });
      }
    }
  },
});

function schedulerHealth(lastCheckAt: number | undefined, overdue: boolean) {
  if (!lastCheckAt) {
    return "never_ran";
  }
  return overdue ? "late" : "ok";
}

function grokHealth(ok: boolean, lastErrorAt: number | undefined, now: number) {
  if (!ok) {
    return "not_configured";
  }
  return lastErrorAt && lastErrorAt > now - 3_600_000 ? "recent_errors" : "ok";
}

/**
 * Where a problem is: X API, Grok, database or the scheduler. Booleans
 * and messages only — secrets are never returned.
 */
export const diagnostics = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const s = await readState(ctx);
    const now = Date.now();
    const cfg = configured();
    const overdue =
      s?.enabled &&
      s.lastCheckAt !== undefined &&
      now - s.lastCheckAt > (s.intervalMinutes + 10) * 60_000 &&
      now > s.nextAllowedAt;
    return {
      database: "ok" as const,
      scheduler: schedulerHealth(s?.lastCheckAt, Boolean(overdue)),
      x: cfg.x
        ? ((s?.status as MonitorStatus | undefined) ?? "idle")
        : "not_configured",
      grok: grokHealth(cfg.grok, s?.lastGrokErrorAt, now),
      lastError: s?.lastError ?? null,
      lastGrokError: s?.lastGrokError ?? null,
    };
  },
});
