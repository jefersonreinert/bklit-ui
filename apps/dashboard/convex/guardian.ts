import { v } from "convex/values";
import {
  COUNTED,
  type GuardianEvent,
  type GuardianPayload,
} from "../lib/journal/guardian";
import { type MutationCtx, type QueryCtx, query } from "./_generated/server";

/**
 * FTMO Risk Guardian (EA TradingJournal FTMO Risk Guardian v4.20): the EA
 * sends its protection state in every sync (POST /journal/mt5/sync, optional
 * `guardian` field); eatrade.sync calls saveGuardian. The panel's "Proteção"
 * tab reads the queries below. Read-only for the panel: the protection runs
 * and decides inside the EA.
 */

/** Events kept per account (older ones are deleted a few at a time). */
const EVENT_TTL = 180 * 24 * 60 * 60 * 1000;
const MAX_DAYS = 120;
const MAX_EVENTS = 200;

async function statusOf(ctx: QueryCtx, account: string) {
  return await ctx.db
    .query("eaGuardian")
    .withIndex("by_account", (q) => q.eq("account", account))
    .unique();
}

async function dayOf(ctx: QueryCtx, account: string, day: string) {
  return await ctx.db
    .query("eaGuardianDays")
    .withIndex("by_account_day", (q) => q.eq("account", account).eq("day", day))
    .unique();
}

/** New events only (the EA may resend if a sync answer got lost). */
async function insertEvents(
  ctx: MutationCtx,
  account: string,
  events: GuardianEvent[],
  now: number
) {
  const fresh: GuardianEvent[] = [];
  for (const e of events) {
    const seen = await ctx.db
      .query("eaGuardianEvents")
      .withIndex("by_account_eid", (q) =>
        q.eq("account", account).eq("eid", e.eid)
      )
      .first();
    if (!seen) {
      await ctx.db.insert("eaGuardianEvents", {
        ...e,
        account,
        receivedAt: now,
      });
      fresh.push(e);
    }
  }
  const old = await ctx.db
    .query("eaGuardianEvents")
    .withIndex("by_account_time", (q) =>
      q.eq("account", account).lt("time", now - EVENT_TTL)
    )
    .take(20);
  for (const o of old) {
    await ctx.db.delete(o._id);
  }
  return fresh;
}

const count = (events: GuardianEvent[], kind: string) =>
  events.filter((e) => e.kind === kind).length;

/** Daily history: worst usage of the limits and counters of the FTMO day. */
async function updateDay(
  ctx: MutationCtx,
  account: string,
  g: GuardianPayload,
  fresh: GuardianEvent[],
  now: number
) {
  const s = g.status;
  if (!(s.enabled && s.pragueDay)) {
    return;
  }
  const existing = await dayOf(ctx, account, s.pragueDay);
  const add = {
    emergencies: count(fresh, COUNTED.emergencies),
    blocks: count(fresh, COUNTED.blocks),
    refused: count(fresh, COUNTED.refused),
    closed: count(fresh, COUNTED.closed),
  };
  if (existing) {
    await ctx.db.patch(existing._id, {
      dayStartBalance: s.dayStartBalance,
      dailyLimit: s.dailyLimit,
      minEstEquity: Math.min(existing.minEstEquity, s.estEquity),
      maxDailyUsePct: Math.max(existing.maxDailyUsePct, s.dailyUsePct),
      maxMaxUsePct: Math.max(existing.maxMaxUsePct, s.maxUsePct),
      maxState: Math.max(existing.maxState, s.state),
      emergencies: existing.emergencies + add.emergencies,
      blocks: existing.blocks + add.blocks,
      refused: existing.refused + add.refused,
      closed: existing.closed + add.closed,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("eaGuardianDays", {
      account,
      day: s.pragueDay,
      dayStartBalance: s.dayStartBalance,
      dailyLimit: s.dailyLimit,
      minEstEquity: s.estEquity,
      maxDailyUsePct: s.dailyUsePct,
      maxMaxUsePct: s.maxUsePct,
      maxState: s.state,
      ...add,
      updatedAt: now,
    });
  }
}

/** Called by eatrade.sync when the EA sends the `guardian` field. */
export async function saveGuardian(
  ctx: MutationCtx,
  account: string,
  g: GuardianPayload,
  now: number
) {
  const row = { account, updatedAt: now, ...g.status };
  const existing = await statusOf(ctx, account);
  if (existing) {
    await ctx.db.replace(existing._id, row);
  } else {
    await ctx.db.insert("eaGuardian", row);
  }
  const fresh = await insertEvents(ctx, account, g.events, now);
  await updateDay(ctx, account, g, fresh, now);
}

/* --------------------------------- panel --------------------------------- */

/** Latest protection state of an account (or of the most recent one). */
export const status = query({
  args: { account: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const rows = a.account
      ? [await statusOf(ctx, a.account)].filter((r) => r !== null)
      : await ctx.db.query("eaGuardian").collect();
    const row = rows.sort((x, y) => y.updatedAt - x.updatedAt)[0];
    if (!row) {
      return null;
    }
    return { ...row, accounts: rows.map((r) => r.account) };
  },
});

/** FTMO days of an account, newest first. */
export const days = query({
  args: { account: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const rows = await ctx.db
      .query("eaGuardianDays")
      .withIndex("by_account_day", (q) => q.eq("account", a.account))
      .order("desc")
      .take(Math.min(MAX_DAYS, Math.max(1, a.limit ?? 30)));
    return rows;
  },
});

/** Protection events of an account, newest first. */
export const events = query({
  args: { account: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const rows = await ctx.db
      .query("eaGuardianEvents")
      .withIndex("by_account_time", (q) => q.eq("account", a.account))
      .order("desc")
      .take(Math.min(MAX_EVENTS, Math.max(1, a.limit ?? 100)));
    return rows.map((r) => ({ ...r, id: r._id }));
  },
});
