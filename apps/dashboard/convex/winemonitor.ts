import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireStaff } from "./access";

/**
 * Wine Monitor (By The Glass wine dispensers) mirror.
 *
 * services/wine-monitor-sync opens the vendor portal read-only every 15
 * minutes and posts a snapshot to POST /winemonitor/sync. The current
 * state (machines, bottles, wines, cards) is replaced; pours, top-ups and
 * bottle changes are kept as history, so the app remembers them after the
 * portal's 24-hour report window has moved on.
 */

const PERMS = ["products", "stock", "reports"] as const;

const sale = v.object({
  cardId: v.optional(v.string()),
  clientId: v.optional(v.string()),
  dispenser: v.string(),
  wine: v.string(),
  sku: v.optional(v.string()),
  ml: v.number(),
  price: v.number(),
  discount: v.number(),
  at: v.number(),
});

const credit = v.object({
  record: v.string(),
  cardId: v.optional(v.string()),
  clientId: v.optional(v.string()),
  source: v.optional(v.string()),
  at: v.number(),
  oldValue: v.number(),
  newValue: v.number(),
  diff: v.number(),
});

const change = v.object({
  kind: v.union(v.literal("change"), v.literal("adjust")),
  sku: v.optional(v.string()),
  wine: v.string(),
  dispenser: v.string(),
  position: v.number(),
  oldMl: v.number(),
  newMl: v.number(),
  cardId: v.optional(v.string()),
  at: v.number(),
  since: v.optional(v.number()),
});

export const ingest = internalMutation({
  args: {
    company: v.string(),
    takenAt: v.number(),
    ms: v.number(),
    node: v.any(),
    dispensers: v.array(v.any()),
    positions: v.array(v.any()),
    wines: v.array(v.any()),
    cards: v.array(v.any()),
    sales: v.array(sale),
    salesFrom: v.number(),
    credits: v.array(credit),
    changes: v.array(change),
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    const { company } = a;

    const state = await ctx.db
      .query("wmState")
      .withIndex("by_company", (q) => q.eq("company", company))
      .unique();
    if (state && state.takenAt > a.takenAt) {
      return { skipped: "older snapshot" };
    }
    const doc = {
      company,
      takenAt: a.takenAt,
      syncedAt: now,
      ms: a.ms,
      node: a.node,
      dispensers: a.dispensers,
      positions: a.positions,
      wines: a.wines,
    };
    if (state) {
      await ctx.db.replace(state._id, doc);
    } else {
      await ctx.db.insert("wmState", doc);
    }

    const cards = await ctx.db
      .query("wmCards")
      .withIndex("by_company", (q) => q.eq("company", company))
      .unique();
    if (cards) {
      await ctx.db.replace(cards._id, {
        company,
        updatedAt: now,
        cards: a.cards,
      });
    } else {
      await ctx.db.insert("wmCards", {
        company,
        updatedAt: now,
        cards: a.cards,
      });
    }

    // The portal's sales report is a rolling 24 h window without ids:
    // everything stored since its start is replaced by what it shows now
    const old = await ctx.db
      .query("wmSales")
      .withIndex("by_company_at", (q) =>
        q.eq("company", company).gte("at", a.salesFrom)
      )
      .collect();
    for (const s of old) {
      await ctx.db.delete(s._id);
    }
    for (const s of a.sales) {
      if (s.at >= a.salesFrom) {
        await ctx.db.insert("wmSales", { company, ...s });
      }
    }

    let newCredits = 0;
    for (const c of a.credits) {
      const seen = await ctx.db
        .query("wmCredits")
        .withIndex("by_record", (q) =>
          q.eq("company", company).eq("record", c.record)
        )
        .unique();
      if (!seen) {
        await ctx.db.insert("wmCredits", { company, ...c });
        newCredits++;
      }
    }

    let newChanges = 0;
    for (const c of a.changes) {
      const key = `${c.kind}|${c.dispenser}|${c.position}|${c.at}`;
      const seen = await ctx.db
        .query("wmChanges")
        .withIndex("by_key", (q) => q.eq("company", company).eq("key", key))
        .unique();
      if (!seen) {
        await ctx.db.insert("wmChanges", { company, key, ...c });
        newChanges++;
      }
    }

    return {
      positions: a.positions.length,
      cards: a.cards.length,
      sales: a.sales.length,
      replacedSales: old.length,
      newCredits,
      newChanges,
    };
  },
});

/** Machines, bottles (ml left) and wines; null when never synced. */
export const state = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, [...PERMS], company);
    const s = await ctx.db
      .query("wmState")
      .withIndex("by_company", (q) => q.eq("company", company))
      .unique();
    if (!s) {
      return null;
    }
    return {
      takenAt: s.takenAt,
      syncedAt: s.syncedAt,
      node: s.node,
      dispensers: s.dispensers,
      positions: s.positions,
      wines: s.wines,
    };
  },
});

/** Pours between two instants (newest first, at most 5000). */
export const sales = query({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    from: v.number(),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { session, company, from, to }) => {
    await requireStaff(ctx, session, [...PERMS], company);
    const rows = await ctx.db
      .query("wmSales")
      .withIndex("by_company_at", (q) => {
        const r = q.eq("company", company).gte("at", from);
        return to === undefined ? r : r.lt("at", to);
      })
      .order("desc")
      .take(5000);
    return rows.map(({ _id, _creationTime, company: _c, ...r }) => r);
  },
});

/** Cards with their balances. */
export const cards = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, [...PERMS], company);
    const c = await ctx.db
      .query("wmCards")
      .withIndex("by_company", (q) => q.eq("company", company))
      .unique();
    return c ? { updatedAt: c.updatedAt, cards: c.cards } : null;
  },
});

/** Latest top-ups and bottle changes. */
export const activity = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, [...PERMS], company);
    const [credits, changes] = await Promise.all([
      ctx.db
        .query("wmCredits")
        .withIndex("by_company_at", (q) => q.eq("company", company))
        .order("desc")
        .take(300),
      ctx.db
        .query("wmChanges")
        .withIndex("by_company_at", (q) => q.eq("company", company))
        .order("desc")
        .take(300),
    ]);
    return {
      credits: credits.map(({ _id, _creationTime, company: _c, ...r }) => r),
      changes: changes.map(
        ({ _id, _creationTime, company: _c, key: _k, ...r }) => r
      ),
    };
  },
});
