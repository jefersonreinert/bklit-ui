import { ConvexError, v } from "convex/values";
import type { CostRecipe } from "../lib/inventory/costing";
import { normalizeName, wmKey } from "../lib/inventory/match";
import { expandRecipe } from "../lib/inventory/usage";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { audit, type Perm, requireStaff } from "./access";
import { groupOf, post } from "./inv";

/**
 * Sales → stock usage. Every few minutes run() reads the new sales of a
 * bar from each source and writes what they took from stock to the
 * ledger ("sale" movements), through the technical sheets:
 * - this app's POS: each paid order line → its product → its sheet;
 * - Lightspeed: each receipt line → its SKU → the product with that SKU
 *   (imported from Lightspeed) → its sheet;
 * - Wine Monitor: each pour → the dispenser wine → its bottle, in ml;
 * - a CSV export (when Lightspeed is not connected): name or SKU → sheet.
 * Each sale line has its own ledger reference, so reading a sale again
 * (late syncs, a reprocess after linking a sheet) never counts it twice;
 * a sale voided after it was counted is given back.
 * Lines with no sheet are left out and listed as "sem ficha".
 */

const READ: Perm[] = ["stock", "reports"];
const BATCH = 150;
/** Sales arrive late (sync lag, checks closed later): look back a little. */
const OVERLAP = 6 * 3600_000;
const SOURCES = ["pos", "ls", "wm"] as const;
type Source = (typeof SOURCES)[number] | "csv";

const groupKey = async (ctx: QueryCtx, company: string) =>
  (await groupOf(ctx, company))?.key ?? company;

/* ------------------------------- mapping --------------------------------- */

type Target =
  | { recipeId: Id<"invRecipes">; name: string }
  | { itemId: Id<"invItems">; name: string };

/** Everything needed to turn sales of one bar into stock items. */
async function mapper(ctx: QueryCtx, company: string) {
  const group = await groupKey(ctx, company);
  const [recipes, prices, links, products] = await Promise.all([
    ctx.db
      .query("invRecipes")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(2000),
    ctx.db
      .query("invRecipePrices")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(2000),
    ctx.db
      .query("invSaleLinks")
      .withIndex("by_key", (q) => q.eq("company", company))
      .take(4000),
    ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(3000),
  ]);
  const costRecipes = new Map<string, CostRecipe>(
    recipes.map((r) => [r._id, { id: r._id, yieldQty: r.yieldQty, lines: r.lines }])
  );
  const recipeName = new Map(recipes.map((r) => [r._id as string, r.name]));
  const byProduct = new Map(
    prices.filter((p) => p.productId).map((p) => [p.productId as string, p.recipeId])
  );
  const linkOf = new Map(links.map((l) => [`${l.source}:${l.key}`, l]));
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku as string, p.cid]));
  const byName = new Map(products.map((p) => [normalizeName(p.name), p.cid]));

  const fromRecipe = (id: Id<"invRecipes"> | undefined): Target | null =>
    id && recipeName.has(id) ? { recipeId: id, name: recipeName.get(id) ?? "" } : null;

  /** The sheet (or item) a sold line takes from stock, or null. */
  const resolve = (source: Source, s: { productId?: string | null; sku?: string; name?: string }) => {
    const key = s.productId || s.sku || normalizeName(s.name ?? "");
    const link = key ? linkOf.get(`${source}:${key}`) : undefined;
    if (link?.recipeId) {
      return fromRecipe(link.recipeId);
    }
    if (link?.itemId) {
      return { itemId: link.itemId, name: link.name } as Target;
    }
    const cid =
      s.productId ||
      (s.sku ? bySku.get(s.sku) : undefined) ||
      (s.name ? byName.get(normalizeName(s.name)) : undefined);
    return cid ? fromRecipe(byProduct.get(cid)) : null;
  };

  /** Stock items and base units taken by `qty` of a target. */
  const usage = (t: Target, qty: number) =>
    "recipeId" in t
      ? expandRecipe(costRecipes.get(t.recipeId) as CostRecipe, qty, costRecipes)
      : new Map([[t.itemId as string, qty]]);

  return { resolve, usage };
}

type Mapper = Awaited<ReturnType<typeof mapper>>;

/**
 * Writes (or, with `back`, gives back) the stock a sold line took. The
 * reference of each item movement is `${ref}:${itemId}`.
 */
async function consume(
  ctx: MutationCtx,
  m: Mapper,
  company: string,
  ref: string,
  target: Target,
  qty: number,
  at: number,
  back = false
) {
  let n = 0;
  for (const [itemId, base] of m.usage(target, qty)) {
    if (!(base > 0)) {
      continue;
    }
    const id = itemId as Id<"invItems">;
    if (back) {
      // Only what was taken comes back, once
      const taken = await ctx.db
        .query("invMoves")
        .withIndex("by_ref", (q) => q.eq("ref", `${ref}:${itemId}`))
        .first();
      if (!taken) {
        continue;
      }
      const done = await post(ctx, {
        company,
        itemId: id,
        kind: "sale",
        qty: -taken.qty,
        unitCost: taken.unitCost,
        ref: `${ref}:${itemId}:void`,
        note: `Venda cancelada: ${target.name}`,
        userName: "Vendas",
        at,
      });
      n += done ? 1 : 0;
    } else {
      const done = await post(ctx, {
        company,
        itemId: id,
        kind: "sale",
        qty: -base,
        ref: `${ref}:${itemId}`,
        note: `Venda: ${target.name}`,
        userName: "Vendas",
        at,
      });
      n += done ? 1 : 0;
    }
  }
  return n;
}

/* --------------------------------- runs ---------------------------------- */

async function cursorOf(ctx: QueryCtx, company: string, source: string) {
  return await ctx.db
    .query("invSalesCursors")
    .withIndex("by_key", (q) => q.eq("company", company).eq("source", source))
    .unique();
}

async function setCursor(ctx: MutationCtx, company: string, source: string, at: number) {
  const row = await cursorOf(ctx, company, source);
  const doc = { at, runAt: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, doc);
  } else {
    await ctx.db.insert("invSalesCursors", { company, source, ...doc });
  }
}

/** First run of a source: start from now (no backfill unless asked). */
async function since(ctx: MutationCtx, company: string, source: string) {
  const row = await cursorOf(ctx, company, source);
  if (row) {
    return row.at;
  }
  const now = Date.now();
  await setCursor(ctx, company, source, now);
  return now;
}

/**
 * Where the cursor goes after a batch: a full batch stops just before its
 * last time (rows sharing that time are read again next run, skipped by
 * their reference); several streams that are behind move only as far as
 * the slowest one got.
 */
function nextCursor(cursor: number, batches: number[][]) {
  const behind = batches.filter((b) => b.length === BATCH);
  if (behind.length) {
    const at = Math.min(...behind.map((b) => (b.at(-1) ?? cursor) - 1));
    // A whole batch at one instant: step over it rather than loop
    return { at: at > cursor ? at : Math.min(...behind.map((b) => b.at(-1) ?? cursor)), more: true };
  }
  return { at: Math.max(cursor, ...batches.flat()), more: false };
}

/**
 * Two passes per source: the last hours again (sales synced, closed or
 * voided late; lines already counted are skipped by their reference),
 * then the new sales after the cursor, a batch at a time.
 */
async function runPos(ctx: MutationCtx, m: Mapper, company: string) {
  const cursor = await since(ctx, company, "pos");
  const batches: number[][] = [];
  for (const status of ["paid", "void"] as const) {
    const recent = await ctx.db
      .query("posOrders")
      .withIndex("by_company_status_closed", (q) =>
        q.eq("company", company).eq("status", status).gt("closedAt", cursor - OVERLAP).lte("closedAt", cursor)
      )
      .take(BATCH);
    const fresh = await ctx.db
      .query("posOrders")
      .withIndex("by_company_status_closed", (q) =>
        q.eq("company", company).eq("status", status).gt("closedAt", cursor)
      )
      .take(BATCH);
    for (const o of [...recent, ...fresh]) {
      for (const item of o.items) {
        const t = m.resolve("pos", { productId: item.productId, name: item.name });
        if (t) {
          await consume(ctx, m, company, `sale:pos:${o.cid}:${item.id}`, t, item.qty, o.closedAt, status === "void");
        }
      }
    }
    batches.push(fresh.map((o) => o.closedAt));
  }
  const next = nextCursor(cursor, batches);
  await setCursor(ctx, company, "pos", next.at);
  return next.more;
}

async function runLightspeed(ctx: MutationCtx, m: Mapper, company: string) {
  const locations = (
    await ctx.db
      .query("lskLocations")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(10)
  ).filter((l) => l.enabled);
  const cursor = await since(ctx, company, "ls");
  const batches: number[][] = [];
  for (const loc of locations) {
    const recent = await ctx.db
      .query("lskSales")
      .withIndex("by_location_closed", (q) =>
        q.eq("locationId", loc.locationId).gt("closedAt", cursor - OVERLAP).lte("closedAt", cursor)
      )
      .take(BATCH);
    const fresh = await ctx.db
      .query("lskSales")
      .withIndex("by_location_closed", (q) => q.eq("locationId", loc.locationId).gt("closedAt", cursor))
      .take(BATCH);
    for (const s of [...recent, ...fresh]) {
      for (const [i, line] of s.lines.entries()) {
        const t = m.resolve("ls", { sku: line.sku, name: line.name });
        if (t && line.qty > 0) {
          await consume(ctx, m, company, `sale:ls:${loc.locationId}:${s.receiptId}:${i}`, t, line.qty, s.closedAt, s.cancelled);
        }
      }
    }
    batches.push(fresh.map((s) => s.closedAt));
  }
  const next = nextCursor(cursor, batches);
  await setCursor(ctx, company, "ls", next.at);
  return next.more;
}

/** Pours come from the dispensers' portal in syncs, some a little late. */
const WM_OVERLAP = 2 * 3600_000;

async function runWineMonitor(ctx: MutationCtx, m: Mapper, company: string) {
  const cursor = await since(ctx, company, "wm");
  const recent = await ctx.db
    .query("wmSales")
    .withIndex("by_company_at", (q) => q.eq("company", company).gt("at", cursor - WM_OVERLAP).lte("at", cursor))
    .take(BATCH * 3);
  const fresh = await ctx.db
    .query("wmSales")
    .withIndex("by_company_at", (q) => q.eq("company", company).gt("at", cursor))
    .take(BATCH);
  for (const p of [...recent, ...fresh]) {
    const t = m.resolve("wm", { sku: wmKey(p.sku, p.wine) });
    if (t && p.ml > 0) {
      await consume(ctx, m, company, `sale:wm:${p._id}`, t, p.ml, p.at);
    }
  }
  const next = nextCursor(cursor, [fresh.map((p) => p.at)]);
  await setCursor(ctx, company, "wm", next.at);
  return next.more;
}

/** One pass over every source of a bar; schedules itself while behind. */
export const run = internalMutation({
  args: { company: v.string() },
  handler: async (ctx, { company }) => {
    const m = await mapper(ctx, company);
    const behind = [
      await runPos(ctx, m, company),
      await runLightspeed(ctx, m, company),
      await runWineMonitor(ctx, m, company),
    ].some(Boolean);
    if (behind) {
      await ctx.scheduler.runAfter(0, internal.sales.run, { company });
    }
  },
});

/** Cron: every bar that belongs to a stock group. */
export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db.query("invGroups").take(50);
    for (const company of new Set(groups.flatMap((g) => g.companies))) {
      await ctx.scheduler.runAfter(0, internal.sales.run, { company });
    }
  },
});

/**
 * Reads the sales of the last days again (after linking sheets): what was
 * already counted is skipped, what now has a sheet is counted.
 */
export const reprocess = mutation({
  args: { session: v.optional(v.string()), company: v.string(), days: v.number() },
  handler: async (ctx, { session, company, days }) => {
    const user = await requireStaff(ctx, session, "stock", company);
    const d = Math.min(62, Math.max(1, Math.round(days)));
    const from = Date.now() - d * 86_400_000;
    for (const s of SOURCES) {
      await setCursor(ctx, company, s, from);
    }
    await ctx.scheduler.runAfter(0, internal.sales.run, { company });
    await audit(ctx, user, "Vendas reprocessadas", `${d} dias`, company);
  },
});

/* ----------------------------- status & links ---------------------------- */

/** Sources, how far they are, and what sold without a sheet lately. */
export const status = query({
  args: { session: v.optional(v.string()), company: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { session, company, days }) => {
    await requireStaff(ctx, session, READ, company);
    const from = Date.now() - Math.min(31, days ?? 7) * 86_400_000;
    const m = await mapper(ctx, company);
    const cursors = await Promise.all(SOURCES.map((s) => cursorOf(ctx, company, s)));
    const locations = await ctx.db
      .query("lskLocations")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(10);
    const missing = new Map<string, { source: Source; key: string; name: string; qty: number }>();
    const miss = (source: Source, key: string, name: string, qty: number) => {
      const k = `${source}:${key}`;
      const row = missing.get(k) ?? { source, key, name, qty: 0 };
      row.qty += qty;
      missing.set(k, row);
    };
    const orders = await ctx.db
      .query("posOrders")
      .withIndex("by_company_status_closed", (q) =>
        q.eq("company", company).eq("status", "paid").gt("closedAt", from)
      )
      .take(3000);
    for (const o of orders) {
      for (const i of o.items) {
        if (!m.resolve("pos", { productId: i.productId, name: i.name })) {
          miss("pos", i.productId || normalizeName(i.name), i.name, i.qty);
        }
      }
    }
    for (const loc of locations) {
      const sales = await ctx.db
        .query("lskSales")
        .withIndex("by_location_closed", (q) => q.eq("locationId", loc.locationId).gt("closedAt", from))
        .take(3000);
      for (const s of sales) {
        if (s.cancelled) {
          continue;
        }
        for (const l of s.lines) {
          if (l.qty > 0 && !m.resolve("ls", { sku: l.sku, name: l.name })) {
            miss("ls", l.sku || normalizeName(l.name), l.name, l.qty);
          }
        }
      }
    }
    const pours = await ctx.db
      .query("wmSales")
      .withIndex("by_company_at", (q) => q.eq("company", company).gt("at", from))
      .take(6000);
    for (const p of pours) {
      const key = wmKey(p.sku, p.wine);
      if (!m.resolve("wm", { sku: key })) {
        miss("wm", key, p.wine, p.ml);
      }
    }
    return {
      sources: SOURCES.map((s, i) => ({
        source: s,
        at: cursors[i]?.at ?? null,
        runAt: cursors[i]?.runAt ?? null,
      })),
      lightspeed: locations.map((l) => ({ name: l.name, enabled: l.enabled, salesAt: l.salesAt ?? null })),
      orders: orders.length,
      pours: pours.length,
      missing: [...missing.values()].sort((a, b) => b.qty - a.qty).slice(0, 300),
    };
  },
});

/** Links something sold (SKU, name, dispenser wine) to a sheet or an item. */
export const link = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    source: v.union(v.literal("pos"), v.literal("ls"), v.literal("wm"), v.literal("csv")),
    key: v.string(),
    name: v.string(),
    recipeId: v.optional(v.id("invRecipes")),
    itemId: v.optional(v.id("invItems")),
  },
  handler: async (ctx, a) => {
    await requireStaff(ctx, a.session, ["stock", "products"], a.company);
    const group = await groupKey(ctx, a.company);
    if (Boolean(a.recipeId) === Boolean(a.itemId)) {
      throw new ConvexError("Escolha uma ficha ou um item.");
    }
    const target = a.recipeId ? await ctx.db.get(a.recipeId) : a.itemId ? await ctx.db.get(a.itemId) : null;
    if (target?.group !== group) {
      throw new ConvexError("Ficha ou item não encontrado.");
    }
    const key = a.key.trim().slice(0, 120);
    const row = await ctx.db
      .query("invSaleLinks")
      .withIndex("by_key", (q) => q.eq("company", a.company).eq("source", a.source).eq("key", key))
      .unique();
    const doc = { name: a.name.slice(0, 120), recipeId: a.recipeId, itemId: a.itemId, updatedAt: Date.now() };
    if (row) {
      await ctx.db.patch(row._id, doc);
    } else {
      await ctx.db.insert("invSaleLinks", { company: a.company, source: a.source, key, ...doc });
    }
  },
});

/* ---------------------------------- CSV ---------------------------------- */

/**
 * Sales of a day (or period) from a file: each line with a sheet takes its
 * stock on that date; the rest stay in the import to be linked and posted
 * later (postImport).
 */
export const importCsv = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    date: v.string(),
    fileName: v.string(),
    lines: v.array(v.object({ sku: v.string(), name: v.string(), qty: v.number() })),
  },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, "stock", a.company);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
      throw new ConvexError("Escolha a data das vendas.");
    }
    const id = await ctx.db.insert("invSalesImports", {
      company: a.company,
      date: a.date,
      fileName: a.fileName.slice(0, 120),
      lines: a.lines.slice(0, 2000).map((l) => ({
        sku: l.sku.slice(0, 60),
        name: l.name.slice(0, 120),
        qty: l.qty,
        posted: false,
      })),
      createdAt: Date.now(),
      createdBy: user.name,
    });
    const result = await postImportLines(ctx, a.company, id);
    await audit(ctx, user, "Vendas importadas", `${a.fileName} ${a.date}: ${result.posted} linhas`, a.company);
    return result;
  },
});

export const postImport = mutation({
  args: { session: v.optional(v.string()), id: v.id("invSalesImports") },
  handler: async (ctx, { session, id }) => {
    const imp = await ctx.db.get(id);
    if (!imp) {
      throw new ConvexError("Importação não encontrada.");
    }
    await requireStaff(ctx, session, "stock", imp.company);
    return await postImportLines(ctx, imp.company, id);
  },
});

async function postImportLines(ctx: MutationCtx, company: string, id: Id<"invSalesImports">) {
  const imp = (await ctx.db.get(id)) as Doc<"invSalesImports">;
  const m = await mapper(ctx, company);
  // Sales of that date count at the end of the day
  const at = Date.parse(`${imp.date}T23:00:00Z`);
  const lines = [...imp.lines];
  let posted = 0;
  const missing: string[] = [];
  for (const [i, l] of lines.entries()) {
    if (l.posted) {
      posted++;
      continue;
    }
    const t = m.resolve("csv", { sku: l.sku, name: l.name }) ?? m.resolve("ls", { sku: l.sku, name: l.name });
    if (!t || l.qty <= 0) {
      missing.push(l.name || l.sku);
      continue;
    }
    await consume(ctx, m, company, `sale:csv:${id}:${i}`, t, l.qty, at);
    lines[i] = { ...l, posted: true };
    posted++;
  }
  await ctx.db.patch(id, { lines });
  return { posted, missing };
}

export const imports = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, READ, company);
    const rows = await ctx.db
      .query("invSalesImports")
      .withIndex("by_company", (q) => q.eq("company", company))
      .order("desc")
      .take(30);
    return rows.map((r) => ({
      _id: r._id,
      date: r.date,
      fileName: r.fileName,
      createdBy: r.createdBy,
      lines: r.lines.length,
      open: r.lines.filter((l) => !l.posted).map((l) => ({ sku: l.sku, name: l.name, qty: l.qty })),
    }));
  },
});

/* -------------------------------- variance ------------------------------- */

/**
 * What happened to each item between two counts: usage by sales (what
 * the sheets say was used), purchases, waste, transfers, and the
 * difference the closing count found — the variance (stock that went
 * without a sale: over-pouring, unrecorded waste, theft, wrong sheets).
 */
export const variance = query({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    countId: v.optional(v.id("invCounts")),
  },
  handler: async (ctx, { session, company, countId }) => {
    const user = await requireStaff(ctx, session, READ, company);
    const counts = (
      await ctx.db
        .query("invCounts")
        .withIndex("by_company", (q) => q.eq("company", company))
        .order("desc")
        .take(60)
    ).filter((c) => c.status === "closed" && c.closedAt);
    const end = countId ? counts.find((c) => c._id === countId) : counts[0];
    if (!end?.closedAt) {
      return { counts: counts.map((c) => ({ id: c._id, name: c.name, closedAt: c.closedAt ?? 0 })), period: null, rows: [] };
    }
    const prev = counts.find((c) => (c.closedAt ?? 0) < (end.closedAt ?? 0));
    const from = prev?.closedAt ?? 0;
    const to = end.closedAt;
    const moves = await ctx.db
      .query("invMoves")
      .withIndex("by_company_at", (q) => q.eq("company", company).gt("at", from).lte("at", to))
      .take(30_000);
    type Row = { usage: number; purchases: number; waste: number; transfers: number; variance: number; usageValue: number; varianceValue: number; adjust: number };
    const byItem = new Map<string, Row>();
    for (const mv of moves) {
      const r =
        byItem.get(mv.itemId) ??
        { usage: 0, purchases: 0, waste: 0, transfers: 0, variance: 0, usageValue: 0, varianceValue: 0, adjust: 0 };
      if (mv.kind === "sale") {
        r.usage -= mv.qty;
        r.usageValue -= mv.qty * mv.unitCost;
      } else if (mv.kind === "purchase") {
        r.purchases += mv.qty;
      } else if (mv.kind === "waste") {
        r.waste -= mv.qty;
      } else if (mv.kind === "transfer_in" || mv.kind === "transfer_out") {
        r.transfers += mv.qty;
      } else if (mv.kind === "count") {
        r.variance += mv.qty;
        r.varianceValue += mv.qty * mv.unitCost;
      } else {
        r.adjust += mv.qty;
      }
      byItem.set(mv.itemId, r);
    }
    const seeCosts = ["users", "stock", "reports"].some((p) => user.perms.includes(p));
    const rows = [];
    for (const [itemId, r] of byItem) {
      const item = await ctx.db.get(itemId as Id<"invItems">);
      if (!item) {
        continue;
      }
      rows.push({
        itemId: item._id,
        name: item.name,
        unit: item.unit,
        size: item.size,
        container: item.container,
        category: item.category,
        ...r,
        usageValue: seeCosts ? Math.round(r.usageValue * 100) / 100 : null,
        varianceValue: seeCosts ? Math.round(r.varianceValue * 100) / 100 : null,
        pct: r.usage > 0 ? r.variance / r.usage : null,
      });
    }
    rows.sort((a, b) => Math.abs(b.varianceValue ?? b.variance) - Math.abs(a.varianceValue ?? a.variance));
    return {
      counts: counts.map((c) => ({ id: c._id, name: c.name, closedAt: c.closedAt ?? 0 })),
      period: { from, to, start: prev?.name ?? null, end: end.name, complete: moves.length < 30_000 },
      rows,
    };
  },
});
