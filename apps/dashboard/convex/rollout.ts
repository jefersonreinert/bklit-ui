import { ConvexError, v } from "convex/values";
import { AUTO_SCORE, nameScore, normalizeName } from "../lib/inventory/match";
import { dayKey } from "../lib/inventory/reorder";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { audit, requireStaff, worksIn } from "./access";
import { groupOf } from "./inv";

/**
 * Rolling stock control out to every bar of the group: a checklist per
 * bar (what is set up, what is the next step), copying a bar's storage
 * areas to another, and linking the group's technical sheets to the
 * products another bar sells under the same name.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

type Step = { key: string; label: string; done: boolean; detail: string };

/** How far one bar is, step by step (in the order they should be done). */
async function barStatus(ctx: QueryCtx, company: string, group: string) {
  const since7 = dayKey(Date.now() - 7 * 86_400_000);
  const since30 = Date.now() - 30 * 86_400_000;
  const [areas, stock, counts, prices, products, usage, invoices, locations] = await Promise.all([
    ctx.db
      .query("invAreas")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(100),
    ctx.db
      .query("invStock")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(2000),
    ctx.db
      .query("invCounts")
      .withIndex("by_company", (q) => q.eq("company", company))
      .order("desc")
      .take(30),
    ctx.db
      .query("invRecipePrices")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(2000),
    ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(3000),
    ctx.db
      .query("invUsageDaily")
      .withIndex("by_company_day", (q) => q.eq("company", company).gt("day", since7))
      .take(5000),
    ctx.db
      .query("invInvoices")
      .withIndex("by_company", (q) => q.eq("company", company))
      .order("desc")
      .take(300),
    ctx.db
      .query("lskLocations")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(10),
  ]);
  const activeAreas = areas.filter((a) => a.active);
  const closed = counts.filter((c) => c.status === "closed");
  const linked = prices.filter((p) => p.productId).length;
  const sellable = products.filter((p) => p.available).length;
  const withLevels = stock.filter((s) => s.min !== undefined || s.par !== undefined).length;
  const approved = invoices.filter((i) => i.status === "approved" && i.createdAt > since30).length;
  const toReview = invoices.filter((i) => i.status === "review").length;
  const value = stock.reduce((s, x) => s + Math.max(0, x.qty) * x.avgCost, 0);
  const sold = usage.filter((u) => u.qty > 0).length;
  const lightspeed = locations.some((l) => l.enabled);
  const coverage = sellable ? linked / sellable : 0;
  const steps: Step[] = [
    {
      key: "areas",
      label: "Áreas de estoque",
      done: activeAreas.length > 0,
      detail: activeAreas.length ? `${activeAreas.length} áreas` : "Crie as áreas ou copie de outro bar",
    },
    {
      key: "opening",
      label: "Contagem de abertura",
      done: closed.length > 0,
      detail: closed.length
        ? `${closed.length} contagem(ns), última em ${new Date(closed[0]?.closedAt ?? 0).toISOString().slice(0, 10)}`
        : counts.some((c) => c.status === "open")
          ? "Contagem aberta: termine e feche"
          : "Faça a primeira contagem",
    },
    {
      key: "recipes",
      label: "Fichas ligadas ao cardápio",
      done: coverage >= 0.8,
      detail: `${linked} de ${sellable} produtos (${Math.round(coverage * 100)}%)`,
    },
    {
      key: "sales",
      label: "Vendas baixando o estoque",
      done: sold > 0,
      detail: sold
        ? `${sold} item(ns) com consumo nos últimos 7 dias`
        : lightspeed
          ? "Lightspeed conectado: faltam fichas nos produtos vendidos"
          : "Conecte o Lightspeed ou importe o CSV de vendas",
    },
    {
      key: "invoices",
      label: "Invoices entrando",
      done: approved > 0,
      detail: `${approved} aprovados em 30 dias${toReview ? ` · ${toReview} para revisar` : ""}`,
    },
    {
      key: "levels",
      label: "Mínimo e ideal dos itens",
      done: withLevels >= 10,
      detail: `${withLevels} itens com mínimo ou ideal`,
    },
    {
      key: "variance",
      label: "Primeira variância",
      done: closed.length >= 2,
      detail: closed.length >= 2 ? "Disponível na aba Variância" : "Precisa de duas contagens fechadas",
    },
  ];
  return {
    company,
    group,
    steps,
    done: steps.filter((s) => s.done).length,
    next: steps.find((s) => !s.done) ?? null,
    stockValue: r2(value),
    lastVariance: closed[0]?.diffValue ?? null,
    lightspeed,
  };
}

/** The checklist of every bar of the group this user works in. */
export const status = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const user = await requireStaff(ctx, session, ["stock", "reports"], company);
    const group = await groupOf(ctx, company);
    const bars = (group?.companies ?? [company]).filter((c) => worksIn(user, c));
    const seeCosts = ["users", "stock", "reports"].some((p) => user.perms.includes(p));
    const rows = [];
    for (const c of bars) {
      const s = await barStatus(ctx, c, group?.key ?? company);
      rows.push(seeCosts ? s : { ...s, stockValue: null, lastVariance: null });
    }
    return { group: group?.name ?? null, bars: rows };
  },
});

/** Copies the storage areas (and their shelf order) of one bar to another. */
export const copyAreas = mutation({
  args: { session: v.optional(v.string()), from: v.string(), to: v.string() },
  handler: async (ctx, { session, from, to }) => {
    const user = await requireStaff(ctx, session, "stock", to);
    await requireStaff(ctx, session, ["stock", "reports"], from);
    const group = await groupOf(ctx, to);
    if (!(group?.companies.includes(from) && from !== to)) {
      throw new ConvexError("Os dois bares precisam estar no mesmo grupo.");
    }
    const source = (
      await ctx.db
        .query("invAreas")
        .withIndex("by_company", (q) => q.eq("company", from))
        .take(100)
    ).filter((a) => a.active);
    const existing = (
      await ctx.db
        .query("invAreas")
        .withIndex("by_company", (q) => q.eq("company", to))
        .take(100)
    ).filter((a) => a.active);
    let created = 0;
    for (const a of source) {
      if (existing.some((e) => normalizeName(e.name) === normalizeName(a.name))) {
        continue;
      }
      await ctx.db.insert("invAreas", {
        company: to,
        name: a.name,
        sort: existing.length + created,
        items: a.items,
        active: true,
      });
      created++;
    }
    await audit(ctx, user, "Áreas copiadas", `${from} → ${to}: ${created}`, to);
    return created;
  },
});

type Match = {
  productId: string;
  product: string;
  recipeId: Id<"invRecipes">;
  recipe: string;
  score: number;
};

async function recipeMatches(ctx: QueryCtx, company: string) {
  const group = (await groupOf(ctx, company))?.key ?? company;
  const [recipes, prices, products] = await Promise.all([
    ctx.db
      .query("invRecipes")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(2000),
    ctx.db
      .query("invRecipePrices")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(2000),
    ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(3000),
  ]);
  const menu = recipes.filter((r) => r.active && r.kind === "menu");
  const linkedProducts = new Set(prices.map((p) => p.productId).filter(Boolean));
  const linkedRecipes = new Set(prices.filter((p) => p.productId).map((p) => p.recipeId as string));
  const matches: Match[] = [];
  const used = new Set<string>();
  for (const p of products) {
    if (!p.available || linkedProducts.has(p.cid)) {
      continue;
    }
    let best: { r: Doc<"invRecipes">; score: number } | null = null;
    for (const r of menu) {
      if (linkedRecipes.has(r._id) || used.has(r._id)) {
        continue;
      }
      const score = normalizeName(r.name) === normalizeName(p.name) ? 1 : nameScore(r.name, p.name);
      if (!best || score > best.score) {
        best = { r, score };
      }
    }
    if (best && best.score >= AUTO_SCORE) {
      used.add(best.r._id);
      matches.push({
        productId: p.cid,
        product: p.name,
        recipeId: best.r._id,
        recipe: best.r.name,
        score: Math.round(best.score * 100) / 100,
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score || a.product.localeCompare(b.product));
}

/** Products of this bar that look like an existing sheet of the group. */
export const recipeLinks = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    return await recipeMatches(ctx, company);
  },
});

/** Links the chosen products of this bar to their group sheets. */
export const applyRecipeLinks = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    links: v.array(v.object({ productId: v.string(), recipeId: v.id("invRecipes") })),
  },
  handler: async (ctx, { session, company, links }) => {
    const user = await requireStaff(ctx, session, ["stock", "products"], company);
    const allowed = new Map((await recipeMatches(ctx, company)).map((m) => [m.productId, m.recipeId as string]));
    let n = 0;
    for (const l of links.slice(0, 500)) {
      // Only what the matcher proposed (and is still free) is linked
      if (allowed.get(l.productId) !== l.recipeId) {
        continue;
      }
      const row = await ctx.db
        .query("invRecipePrices")
        .withIndex("by_recipe", (q) => q.eq("recipeId", l.recipeId).eq("company", company))
        .unique();
      if (row) {
        await ctx.db.patch(row._id, { productId: l.productId, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("invRecipePrices", {
          company,
          recipeId: l.recipeId,
          productId: l.productId,
          updatedAt: Date.now(),
        });
      }
      n++;
    }
    await audit(ctx, user, "Fichas ligadas ao cardápio", `${n}`, company);
    return n;
  },
});
