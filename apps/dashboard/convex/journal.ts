import { v } from "convex/values";
import {
  DEMO_ACCOUNT,
  DEMO_STRATEGY,
  demoDeals,
  demoNotes,
  demoSignals,
} from "../lib/journal/demo";
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
 * Trading journal. MT5 deals (CasaBrasaJournal EA) and TradingView alerts
 * arrive through the always-on HTTP routes in http.ts, which check the
 * token kept here; the panel reads deals, signals and notes.
 */

const KEY = "main" as const;
const MAX_SIGNALS = 2000;
const MAX_TEXT = 4000;

const side = v.union(v.literal("buy"), v.literal("sell"));
const entry = v.union(
  v.literal("in"),
  v.literal("out"),
  v.literal("inout"),
  v.literal("out_by")
);

const dealValue = v.object({
  account: v.string(),
  ticket: v.string(),
  position: v.string(),
  symbol: v.string(),
  side,
  entry,
  volume: v.number(),
  price: v.number(),
  sl: v.number(),
  tp: v.number(),
  profit: v.number(),
  commission: v.number(),
  swap: v.number(),
  fee: v.number(),
  magic: v.number(),
  comment: v.string(),
  time: v.number(),
});

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getState(ctx: QueryCtx) {
  return await ctx.db
    .query("jrnState")
    .withIndex("by_key", (q) => q.eq("key", KEY))
    .unique();
}

async function ensureState(ctx: MutationCtx): Promise<Doc<"jrnState">> {
  const s = await getState(ctx);
  if (s) {
    return s;
  }
  const id = await ctx.db.insert("jrnState", { key: KEY, token: newToken() });
  return (await ctx.db.get(id)) as Doc<"jrnState">;
}

/* --------------------------------- panel --------------------------------- */

/** Connector setup (the token is the panel's own secret, shown to it). */
export const settings = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const s = await getState(ctx);
    return {
      token: s?.token ?? null,
      lastMt5At: s?.lastMt5At ?? null,
      lastTvAt: s?.lastTvAt ?? null,
      accounts: s?.accounts ?? [],
    };
  },
});

export const ensureToken = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    return (await ensureState(ctx)).token;
  },
});

export const rotateToken = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const s = await ensureState(ctx);
    const token = newToken();
    await ctx.db.patch(s._id, { token });
    return token;
  },
});

/** Deals since `from` (ms), newest first. */
export const deals = query({
  args: { from: v.optional(v.number()) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const rows = await ctx.db
      .query("jrnDeals")
      .withIndex("by_time", (q) => q.gte("time", a.from ?? 0))
      .order("desc")
      .take(20_000);
    return rows.map(({ _id, _creationTime, ...d }) => d);
  },
});

export const signals = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const rows = await ctx.db
      .query("jrnSignals")
      .withIndex("by_received")
      .order("desc")
      .take(Math.min(a.limit ?? 300, MAX_SIGNALS));
    return rows.map(({ _creationTime, ...s }) => ({ ...s, id: s._id }));
  },
});

export const notes = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const rows = await ctx.db.query("jrnNotes").collect();
    return rows.map(({ _id, _creationTime, ...n }) => n);
  },
});

export const saveNote = mutation({
  args: {
    key: v.string(),
    setup: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    rating: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const patch = {
      setup: a.setup?.slice(0, 80),
      tags: a.tags
        ?.map((t) => t.trim().slice(0, 30))
        .filter(Boolean)
        .slice(0, 12),
      rating:
        a.rating === undefined ? undefined : Math.max(0, Math.min(5, a.rating)),
      notes: a.notes?.slice(0, MAX_TEXT),
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("jrnNotes")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("jrnNotes", { key: a.key, ...patch });
    }
  },
});

export const deleteSignal = mutation({
  args: { id: v.id("jrnSignals") },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    await ctx.db.delete(a.id);
  },
});

/** Removes every deal of an account (e.g. a demo you stopped using). */
export const deleteAccount = mutation({
  args: { account: v.string() },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const rows = await ctx.db.query("jrnDeals").collect();
    for (const d of rows.filter((r) => r.account === a.account)) {
      await ctx.db.delete(d._id);
    }
    const s = await getState(ctx);
    if (s?.accounts) {
      await ctx.db.patch(s._id, {
        accounts: s.accounts.filter((x) => x.login !== a.account),
      });
    }
  },
});

/* ------------------------------ demo / reset ----------------------------- */

/** Docs removed per call, so a big journal never hits the mutation limits. */
const BATCH = 1500;

const DEMO_INFO = {
  login: DEMO_ACCOUNT,
  server: "Dados fictícios",
  name: "Demonstração",
};

/** Removes up to BATCH demo docs; true when nothing demo is left. */
async function clearDemoBatch(ctx: MutationCtx) {
  let budget = BATCH;
  const deals = await ctx.db
    .query("jrnDeals")
    .withIndex("by_ticket", (q) => q.eq("account", DEMO_ACCOUNT))
    .take(budget);
  for (const d of deals) {
    await ctx.db.delete(d._id);
  }
  budget -= deals.length;
  const notes = (await ctx.db.query("jrnNotes").collect()).filter((n) =>
    n.key.startsWith(`${DEMO_ACCOUNT}:`)
  );
  for (const n of notes.slice(0, Math.max(0, budget))) {
    await ctx.db.delete(n._id);
  }
  budget -= notes.length;
  const signals = (await ctx.db.query("jrnSignals").collect()).filter(
    (x) => x.strategy === DEMO_STRATEGY
  );
  for (const x of signals.slice(0, Math.max(0, budget))) {
    await ctx.db.delete(x._id);
  }
  budget -= signals.length;
  return budget >= 0;
}

/** Fills the journal with fictitious trades, notes and alerts (DEMO account). */
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    await clearDemoBatch(ctx);
    const now = Date.now();
    const deals = demoDeals(now);
    for (const d of deals) {
      await ctx.db.insert("jrnDeals", d);
    }
    for (const n of demoNotes(now)) {
      await ctx.db.insert("jrnNotes", n);
    }
    for (const x of demoSignals(now)) {
      await ctx.db.insert("jrnSignals", x);
    }
    const s = await ensureState(ctx);
    const accounts = (s.accounts ?? []).filter((a) => a.login !== DEMO_ACCOUNT);
    await ctx.db.patch(s._id, { accounts: [...accounts, DEMO_INFO] });
    return deals.length;
  },
});

/**
 * Clears the journal: "demo" removes only the fictitious data, "all" every
 * deal, note and alert (the webhook token is kept). Works in batches: call
 * again while it returns `done: false`.
 */
export const clearJournal = mutation({
  args: { scope: v.union(v.literal("demo"), v.literal("all")) },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const s = await getState(ctx);
    if (a.scope === "demo") {
      const done = await clearDemoBatch(ctx);
      if (done && s?.accounts) {
        await ctx.db.patch(s._id, {
          accounts: s.accounts.filter((x) => x.login !== DEMO_ACCOUNT),
        });
      }
      return { done };
    }
    let removed = 0;
    for (const table of ["jrnDeals", "jrnNotes", "jrnSignals"] as const) {
      const rows = await ctx.db.query(table).take(BATCH - removed);
      for (const r of rows) {
        await ctx.db.delete(r._id);
      }
      removed += rows.length;
      if (removed >= BATCH) {
        return { done: false };
      }
    }
    if (s) {
      await ctx.db.patch(s._id, {
        accounts: [],
        lastMt5At: undefined,
        lastTvAt: undefined,
      });
    }
    return { done: true };
  },
});

/** Whether the journal currently holds the fictitious data. */
export const hasDemo = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return false;
    }
    const one = await ctx.db
      .query("jrnDeals")
      .withIndex("by_ticket", (q) => q.eq("account", DEMO_ACCOUNT))
      .first();
    return one !== null;
  },
});

/* -------------------------------- webhooks ------------------------------- */

export const tokenFor = internalQuery({
  args: {},
  handler: async (ctx) => (await getState(ctx))?.token ?? null,
});

/** Upserts deals by (account, ticket); returns how many were new. */
export const ingestDeals = internalMutation({
  args: {
    deals: v.array(dealValue),
    account: v.optional(
      v.object({ login: v.string(), server: v.string(), name: v.string() })
    ),
  },
  handler: async (ctx, a) => {
    let added = 0;
    for (const d of a.deals) {
      const existing = await ctx.db
        .query("jrnDeals")
        .withIndex("by_ticket", (q) =>
          q.eq("account", d.account).eq("ticket", d.ticket)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, d);
      } else {
        await ctx.db.insert("jrnDeals", d);
        added += 1;
      }
    }
    const s = await ensureState(ctx);
    const accounts = s.accounts ?? [];
    const acc = a.account;
    await ctx.db.patch(s._id, {
      lastMt5At: Date.now(),
      ...(acc && !accounts.some((x) => x.login === acc.login)
        ? { accounts: [...accounts, acc] }
        : {}),
    });
    return added;
  },
});

export const ingestSignal = internalMutation({
  args: {
    ticker: v.string(),
    action: v.string(),
    price: v.union(v.number(), v.null()),
    qty: v.union(v.number(), v.null()),
    position: v.string(),
    interval: v.string(),
    strategy: v.string(),
    message: v.string(),
    time: v.number(),
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    await ctx.db.insert("jrnSignals", { ...a, receivedAt: now });
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, { lastTvAt: now });
    const old = await ctx.db
      .query("jrnSignals")
      .withIndex("by_received")
      .order("desc")
      .collect();
    for (const x of old.slice(MAX_SIGNALS)) {
      await ctx.db.delete(x._id);
    }
  },
});
