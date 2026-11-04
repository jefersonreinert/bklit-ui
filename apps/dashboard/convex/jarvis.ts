import { v } from "convex/values";
import { sameToken } from "../lib/journal/ingest";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { inCompany } from "./pos";

/**
 * "Jarvis": a read-only digest of every business (sales, open orders,
 * stock, team, wine machines) for the voice assistant behind the iPhone
 * Shortcut. Only with the JARVIS_TOKEN; it never changes anything.
 */

const TZ = "Europe/Malta";
const LOW_ML = 150;

const dayOf = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(ms);

const round = (n: number) => Math.round(n * 100) / 100;

function orderTotal(o: Doc<"posOrders">) {
  const sub = o.items.reduce(
    (s, i) =>
      s + (i.price + (i.mods ?? []).reduce((m, x) => m + x.price, 0)) * i.qty,
    0
  );
  return round(sub);
}

function topProducts(d: Doc<"posDaily"> | undefined, n: number) {
  return Object.values(d?.products ?? {})
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n)
    .map((p) => ({ name: p.name, qty: p.qty, revenue: round(p.revenue) }));
}

function dayTotals(d: Doc<"posDaily"> | undefined) {
  return d
    ? {
        sales: round(d.sales),
        orders: d.orders,
        tips: round(d.tips),
        methods: d.methods,
        top: topProducts(d, 5),
      }
    : { sales: 0, orders: 0 };
}

async function wineMonitor(ctx: QueryCtx, company: string, now: number) {
  const state = await ctx.db
    .query("wmState")
    .withIndex("by_company", (q) => q.eq("company", company))
    .first();
  if (!state) {
    return null;
  }
  const today = dayOf(now);
  const sales = await ctx.db
    .query("wmSales")
    .withIndex("by_company_at", (q) =>
      q.eq("company", company).gte("at", now - 36 * 3_600_000)
    )
    .take(3000);
  const todays = sales.filter((s) => dayOf(s.at) === today);
  const byWine = new Map<
    string,
    { pours: number; ml: number; revenue: number }
  >();
  for (const s of todays) {
    const w = byWine.get(s.wine) ?? { pours: 0, ml: 0, revenue: 0 };
    w.pours += 1;
    w.ml += s.ml;
    w.revenue += s.price - s.discount;
    byWine.set(s.wine, w);
  }
  const positions = (state.positions ?? []) as {
    dispenser: string;
    position: number;
    wine: string;
    residueMl: number;
  }[];
  const dispensers = (state.dispensers ?? []) as {
    name: string;
    lastSeen?: number;
  }[];
  const cards = await ctx.db
    .query("wmCards")
    .withIndex("by_company", (q) => q.eq("company", company))
    .first();
  const prepaid = (
    (cards?.cards ?? []) as {
      kind?: string;
      balance?: number;
    }[]
  ).filter((c) => c.kind === "credit" && (c.balance ?? 0) > 0);
  return {
    syncedAt: state.takenAt,
    lowBottles: positions
      .filter((p) => p.wine && p.residueMl < LOW_ML)
      .map((p) => ({
        machine: p.dispenser,
        position: p.position,
        wine: p.wine,
        ml: p.residueMl,
      })),
    offlineMachines: dispensers
      .filter((d) => !d.lastSeen || state.takenAt - d.lastSeen > 15 * 60_000)
      .map((d) => d.name),
    today: {
      pours: todays.length,
      ml: todays.reduce((s, x) => s + x.ml, 0),
      revenue: round(todays.reduce((s, x) => s + x.price - x.discount, 0)),
      topWines: [...byWine.entries()]
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5)
        .map(([wine, w]) => ({ wine, ...w, revenue: round(w.revenue) })),
    },
    prepaidCards: {
      count: prepaid.length,
      balance: round(prepaid.reduce((s, c) => s + (c.balance ?? 0), 0)),
    },
  };
}

async function digest(ctx: QueryCtx, meta: Doc<"posMeta">, now: number) {
  const key = meta.key;
  const profile = (meta.profile ?? {}) as { name?: string };
  const settings = (meta.settings ?? {}) as { currency?: string };
  const today = dayOf(now);
  const yesterday = dayOf(now - 86_400_000);
  const weekAgo = dayOf(now - 6 * 86_400_000);
  const days = await inCompany(key, (k) =>
    ctx.db
      .query("posDaily")
      .withIndex("by_company_day", (q) =>
        q.eq("company", k).gte("day", weekAgo).lte("day", today)
      )
      .take(20)
  );
  const open = await inCompany(key, (k) =>
    ctx.db
      .query("posOrders")
      .withIndex("by_company_status_closed", (q) =>
        q.eq("company", k).eq("status", "open")
      )
      .take(200)
  );
  const products = await inCompany(key, (k) =>
    ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", k))
      .take(3000)
  );
  const punches = (
    await Promise.all(
      [yesterday, today].map((date) =>
        ctx.db
          .query("staffPunches")
          .withIndex("by_company_date", (q) =>
            q.eq("company", key).eq("date", date)
          )
          .take(200)
      )
    )
  )
    .flat()
    .filter((p) => p.out === null);
  const working = await Promise.all(punches.map((p) => ctx.db.get(p.userId)));

  return {
    key,
    name: profile.name ?? key,
    currency: settings.currency ?? "EUR",
    today: dayTotals(days.find((d) => d.day === today)),
    yesterday: dayTotals(days.find((d) => d.day === yesterday)),
    last7Days: {
      sales: round(days.reduce((s, d) => s + d.sales, 0)),
      orders: days.reduce((s, d) => s + d.orders, 0),
    },
    openOrders: open.slice(0, 40).map((o) => ({
      number: o.number,
      name: o.name,
      table: o.tableId,
      items: o.items.reduce((s, i) => s + i.qty, 0),
      total: orderTotal(o),
      openForMin: Math.round((now - o.createdAt) / 60_000),
    })),
    lowStock: products
      .filter(
        (p) =>
          p.trackStock && (p.stock ?? 0) <= (p.minStock ?? 0) && p.available
      )
      .slice(0, 25)
      .map((p) => ({ name: p.name, stock: p.stock ?? 0, min: p.minStock })),
    clockedIn: punches.map((p, i) => ({
      name: working[i]?.name ?? "?",
      sinceMin: Math.round((now - p.in) / 60_000),
    })),
    wineMonitor: await wineMonitor(ctx, key, now),
  };
}

/** Everything Jarvis may tell, or null when the token is wrong. */
export const context = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const expected = process.env.JARVIS_TOKEN;
    if (!(expected && token.length <= 200 && sameToken(token, expected))) {
      return null;
    }
    const now = Date.now();
    const metas = await ctx.db.query("posMeta").take(20);
    return {
      now: new Intl.DateTimeFormat("pt-BR", {
        timeZone: TZ,
        dateStyle: "full",
        timeStyle: "short",
      }).format(now),
      timeZone: TZ,
      businesses: await Promise.all(metas.map((m) => digest(ctx, m, now))),
    };
  },
});
