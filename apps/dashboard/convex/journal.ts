import { v } from "convex/values";
import {
  divergences,
  eaTotals,
  HISTORY_KEYS,
  serverDay,
} from "../lib/journal/account";
import type { Deal } from "../lib/journal/metrics";
import { serverOffset } from "../lib/journal/news";
import {
  cleanOptions,
  NOTE_FIELDS,
  noteOptionsOf,
} from "../lib/journal/note-fields";
import { toUtc } from "../lib/journal/time";
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
import {
  type accountStatsFields,
  dealExtraFields,
  noteFields,
  statsValue,
} from "./schema";

/**
 * Trading journal. MT5 deals (CasaBrasaJournal EA) and TradingView alerts
 * arrive through the always-on HTTP routes in http.ts, which check the
 * token kept here; the panel reads deals, signals and notes.
 */

const KEY = "main" as const;
const MAX_SIGNALS = 2000;
const MAX_TEXT = 4000;
const HOUR = 3_600_000;
/** Largest broker clock offset: wider windows on the server-time index. */
const MAX_OFFSET = 14 * HOUR;

/**
 * Fictitious trades that older versions of the panel could load. They are
 * no longer created; these ids only let the panel find and remove them.
 */
const DEMO_ACCOUNT = "DEMO";
const DEMO_STRATEGY = "Demonstração";

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
  ...dealExtraFields,
});

const cashValue = v.object({
  account: v.string(),
  ticket: v.string(),
  kind: v.string(),
  amount: v.number(),
  comment: v.string(),
  time: v.number(),
});

const accountInfo = v.object({
  login: v.string(),
  server: v.string(),
  name: v.string(),
  offsetMs: v.optional(v.number()),
});

interface AccountInfo {
  login: string;
  server: string;
  name: string;
  offsetMs?: number;
}

/**
 * Marks the EA as seen: remembers the account, when it last sent data and
 * its broker clock offset.
 */
async function touchState(
  ctx: MutationCtx,
  acc: AccountInfo | undefined,
  extra: Partial<Doc<"jrnState">> = {}
) {
  const s = await ensureState(ctx);
  const now = Date.now();
  const accounts = s.accounts ?? [];
  let next = accounts;
  if (acc) {
    const known = accounts.find((x) => x.login === acc.login);
    const merged = {
      ...known,
      login: acc.login,
      server: acc.server || known?.server || "",
      name: acc.name || known?.name || "",
      ...(acc.offsetMs === undefined ? {} : { offsetMs: acc.offsetMs }),
      lastSeen: now,
    };
    next = known
      ? accounts.map((x) => (x.login === acc.login ? merged : x))
      : [...accounts, merged];
  }
  await ctx.db.patch(s._id, { lastMt5At: now, accounts: next, ...extra });
}

/**
 * Broker clock − UTC of each account: what the EA reports, else estimated
 * from its last statistics snapshot (server time vs reception).
 */
async function accountOffsets(ctx: QueryCtx) {
  const map = new Map<string, number>();
  for (const r of await ctx.db.query("jrnAccountStats").collect()) {
    map.set(r.account, r.offsetMs ?? serverOffset(r.serverTime, r.receivedAt));
  }
  for (const a of (await getState(ctx))?.accounts ?? []) {
    if (a.offsetMs !== undefined) {
      map.set(a.login, a.offsetMs);
    }
  }
  return map;
}

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
      lastStatsAt: s?.lastStatsAt ?? null,
      accounts: s?.accounts ?? [],
      noteOptions: noteOptionsOf(s?.noteOptions),
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

/**
 * Deals since `from` (UTC ms), newest first, with their times converted
 * from the broker clock to UTC: every chart of the panel works in UTC.
 */
export const deals = query({
  args: { from: v.optional(v.number()) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const from = a.from ?? 0;
    const offsets = await accountOffsets(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("jrnDeals")
      .withIndex("by_time", (q) =>
        q.gte("time", from > 0 ? from - MAX_OFFSET : 0)
      )
      .order("desc")
      .take(20_000);
    return rows
      .map(({ _id, _creationTime, ...d }) => ({
        ...d,
        time: toUtc(d.time, offsets.get(d.account), now),
      }))
      .filter((d) => d.time >= from);
  },
});

/** Deposits, withdrawals and other balance operations (UTC), oldest first. */
export const cash = query({
  args: { account: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const offset = (await accountOffsets(ctx)).get(a.account);
    const now = Date.now();
    const rows = await ctx.db
      .query("jrnCash")
      .withIndex("by_account_time", (q) => q.eq("account", a.account))
      .take(5000);
    return rows.map((c) => ({
      ticket: c.ticket,
      kind: c.kind,
      amount: c.amount,
      comment: c.comment,
      time: toUtc(c.time, offset, now),
    }));
  },
});

/**
 * Accounts that sent data, the most recently active first. Fictitious data
 * of older versions is flagged so the panel never picks it by default.
 */
export const accounts = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const s = await getState(ctx);
    const stats = await ctx.db.query("jrnAccountStats").collect();
    const seenAt = new Map(stats.map((r) => [r.account, r.receivedAt]));
    const list = (s?.accounts ?? []).map((x) => ({
      login: x.login,
      server: x.server,
      name: x.name,
      lastSeen: Math.max(x.lastSeen ?? 0, seenAt.get(x.login) ?? 0),
      demo: x.login === DEMO_ACCOUNT,
    }));
    for (const r of stats) {
      if (!list.some((x) => x.login === r.account)) {
        list.push({
          login: r.account,
          server: r.server,
          name: r.name,
          lastSeen: r.receivedAt,
          demo: r.account === DEMO_ACCOUNT,
        });
      }
    }
    return list.sort((x, y) => y.lastSeen - x.lastSeen);
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
    ...noteFields,
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const structured = Object.fromEntries(
      NOTE_FIELDS.filter((f) => a[f] !== undefined).map((f) => [
        f,
        a[f]?.trim().slice(0, 40),
      ])
    );
    const patch = {
      ...structured,
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

/** Edits the option list of one structured note field. */
export const saveNoteOptions = mutation({
  args: {
    field: v.union(...NOTE_FIELDS.map((f) => v.literal(f))),
    options: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const s = await ensureState(ctx);
    await ctx.db.patch(s._id, {
      noteOptions: { ...s.noteOptions, [a.field]: cleanOptions(a.options) },
    });
  },
});

/** Latest EA statistics of every account (or one), newest first. */
export const accountStats = query({
  args: { account: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const rows = a.account
      ? await ctx.db
          .query("jrnAccountStats")
          .withIndex("by_account", (q) => q.eq("account", a.account ?? ""))
          .collect()
      : await ctx.db.query("jrnAccountStats").collect();
    return rows
      .map(({ _id, _creationTime, ...r }) => r)
      .sort((x, y) => y.receivedAt - x.receivedAt);
  },
});

/** Daily snapshots of an account since `from` (server ms), oldest first. */
export const statsHistory = query({
  args: { account: v.string(), from: v.optional(v.number()) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const day = serverDay(a.from ?? 0);
    const offset = (await accountOffsets(ctx)).get(a.account);
    const now = Date.now();
    const rows = await ctx.db
      .query("jrnStatsHistory")
      .withIndex("by_account_day", (q) =>
        q.eq("account", a.account).gte("day", day)
      )
      .take(5000);
    return rows.map(({ _id, _creationTime, account: _a, day: _d, ...r }) => ({
      ...r,
      time: toUtc(r.time, offset, now),
    }));
  },
});

/**
 * The EA's totals against the stored deals of the account: a difference
 * means deals are missing (or extra) in the panel.
 */
export const accountCheck = query({
  args: { account: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const stats = await ctx.db
      .query("jrnAccountStats")
      .withIndex("by_account", (q) => q.eq("account", a.account))
      .unique();
    if (!stats) {
      return null;
    }
    const deals = await ctx.db
      .query("jrnDeals")
      .withIndex("by_ticket", (q) => q.eq("account", a.account))
      .take(50_000);
    const panel = eaTotals(deals as Deal[]);
    return { panel, issues: divergences(stats.stats, panel) };
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
    const rows = await ctx.db
      .query("jrnDeals")
      .withIndex("by_ticket", (q) => q.eq("account", a.account))
      .collect();
    const cash = await ctx.db
      .query("jrnCash")
      .withIndex("by_ticket", (q) => q.eq("account", a.account))
      .collect();
    for (const d of [...rows, ...cash]) {
      await ctx.db.delete(d._id);
    }
    await clearStats(ctx, a.account);
    const s = await getState(ctx);
    if (s?.accounts) {
      await ctx.db.patch(s._id, {
        accounts: s.accounts.filter((x) => x.login !== a.account),
      });
    }
  },
});

/** Removes the EA statistics (and their history) of one account. */
async function clearStats(ctx: MutationCtx, account: string) {
  const latest = await ctx.db
    .query("jrnAccountStats")
    .withIndex("by_account", (q) => q.eq("account", account))
    .collect();
  const history = await ctx.db
    .query("jrnStatsHistory")
    .withIndex("by_account_day", (q) => q.eq("account", account))
    .collect();
  for (const r of [...latest, ...history]) {
    await ctx.db.delete(r._id);
  }
}

/* -------------------------- old demo data / reset ------------------------ */

/** Docs removed per call, so a big journal never hits the mutation limits. */
const BATCH = 1500;

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
  if (budget >= 0) {
    await clearStats(ctx, DEMO_ACCOUNT);
  }
  return budget >= 0;
}

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
    for (const table of [
      "jrnDeals",
      "jrnCash",
      "jrnNotes",
      "jrnSignals",
      "jrnAccountStats",
      "jrnStatsHistory",
    ] as const) {
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
        lastStatsAt: undefined,
      });
    }
    return { done: true };
  },
});

/** Whether the journal still holds fictitious data of older versions. */
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

/**
 * Upserts deals by (account, ticket); returns how many were new. A re-sent
 * deal updates its fields and fills the EA extras it lacked; extras absent
 * from the new copy are kept.
 */
export const ingestDeals = internalMutation({
  args: {
    deals: v.array(dealValue),
    cash: v.optional(v.array(cashValue)),
    account: v.optional(accountInfo),
  },
  handler: async (ctx, a) => {
    for (const c of a.cash ?? []) {
      const existing = await ctx.db
        .query("jrnCash")
        .withIndex("by_ticket", (q) =>
          q.eq("account", c.account).eq("ticket", c.ticket)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, c);
      } else {
        await ctx.db.insert("jrnCash", c);
      }
    }
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
    await touchState(ctx, a.account);
    return added;
  },
});

/**
 * Account statistics from the TradingJournal Complete EA: the latest per
 * account, plus one snapshot per server day for the balance chart.
 */
export const ingestStats = internalMutation({
  args: {
    account: v.string(),
    server: v.string(),
    name: v.string(),
    holder: v.string(),
    currency: v.string(),
    accountType: v.string(),
    serverTime: v.number(),
    offsetMs: v.optional(v.number()),
    stats: statsValue,
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    const row = { ...a, receivedAt: now } satisfies Partial<
      Record<keyof typeof accountStatsFields, unknown>
    > &
      Omit<Record<keyof typeof accountStatsFields, unknown>, "offsetMs">;
    const latest = await ctx.db
      .query("jrnAccountStats")
      .withIndex("by_account", (q) => q.eq("account", a.account))
      .unique();
    if (latest) {
      await ctx.db.replace(latest._id, row);
    } else {
      await ctx.db.insert("jrnAccountStats", row);
    }
    const day = serverDay(a.serverTime);
    const point = {
      account: a.account,
      day,
      time: a.serverTime,
      ...Object.fromEntries(HISTORY_KEYS.map((k) => [k, a.stats[k]])),
    } as Omit<Doc<"jrnStatsHistory">, "_id" | "_creationTime">;
    const today = await ctx.db
      .query("jrnStatsHistory")
      .withIndex("by_account_day", (q) =>
        q.eq("account", a.account).eq("day", day)
      )
      .unique();
    if (today) {
      // An older snapshot (history re-sent late) never replaces a newer one
      if (today.time <= a.serverTime) {
        await ctx.db.replace(today._id, point);
      }
    } else {
      await ctx.db.insert("jrnStatsHistory", point);
    }
    await touchState(
      ctx,
      {
        login: a.account,
        server: a.server,
        name: a.name,
        offsetMs: a.offsetMs,
      },
      { lastStatsAt: now }
    );
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
