import { ConvexError, v } from "convex/values";
import {
  type CostRecipe,
  DEFAULT_TARGETS,
  grossMargin,
  RecipeCycleError,
  recipeCost,
  suggestedPrice,
} from "../lib/inventory/costing";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type QueryCtx, query } from "./_generated/server";
import { audit, type Perm, requireStaff } from "./access";
import { groupOf } from "./inv";
import { invUnit } from "./schema";

/**
 * Technical sheets with live cost. A recipe belongs to the group (the
 * same Negroni in every bar); its cost uses each bar's average cost of
 * the ingredients, so it changes as soon as an invoice is approved. In
 * each bar a menu recipe is linked to the POS product it is sold as (or
 * gets a price by hand), which gives the margin and, in phase 5, its
 * sales → theoretical usage.
 */

const READ: Perm[] = ["stock", "products", "reports"];
const EDIT: Perm[] = ["stock", "products"];
/** Malta's standard VAT, when the business has none set. */
const DEFAULT_VAT = 18;
const MAX = 2000;

const clean = (s: string | undefined, max = 120) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const groupKey = async (ctx: QueryCtx, company: string) =>
  (await groupOf(ctx, company))?.key ?? company;

const toCost = (r: Doc<"invRecipes">): CostRecipe => ({
  id: r._id,
  yieldQty: r.yieldQty,
  lines: r.lines.map((l) => ({ itemId: l.itemId, prepId: l.prepId, qty: l.qty, waste: l.waste })),
});

async function vatOf(ctx: QueryCtx, company: string) {
  const meta = await ctx.db
    .query("posMeta")
    .withIndex("by_key", (q) => q.eq("key", company))
    .unique();
  const rate = (meta?.settings as { vatRate?: number } | undefined)?.vatRate;
  return typeof rate === "number" && rate >= 0 ? rate : DEFAULT_VAT;
}

/** Every recipe of the group with its cost, price and margin in this bar. */
export const list = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const user = await requireStaff(ctx, session, READ, company);
    const group = await groupKey(ctx, company);
    const [recipes, items, stock, prices, vatRate] = await Promise.all([
      ctx.db
        .query("invRecipes")
        .withIndex("by_group", (q) => q.eq("group", group))
        .take(MAX),
      ctx.db
        .query("invItems")
        .withIndex("by_group", (q) => q.eq("group", group))
        .take(MAX),
      ctx.db
        .query("invStock")
        .withIndex("by_company", (q) => q.eq("company", company))
        .take(MAX),
      ctx.db
        .query("invRecipePrices")
        .withIndex("by_company", (q) => q.eq("company", company))
        .take(MAX),
      vatOf(ctx, company),
    ]);
    const seeCosts = ["users", "stock", "reports"].some((p) => user.perms.includes(p));
    const cost = new Map(stock.map((s) => [s.itemId as string, s.avgCost]));
    const byId = new Map(recipes.map((r) => [r._id as string, toCost(r)]));
    const names = new Map<string, string>([
      ...items.map((i) => [i._id as string, i.name] as [string, string]),
      ...recipes.map((r) => [r._id as string, r.name] as [string, string]),
    ]);
    const priceOf = new Map(prices.map((p) => [p.recipeId as string, p]));
    // Products linked here, for their names and current prices
    const productIds = [...new Set(prices.map((p) => p.productId).filter((x): x is string => Boolean(x)))];
    const products = new Map<string, Doc<"posProducts">>();
    for (const cid of productIds) {
      const p = await ctx.db
        .query("posProducts")
        .withIndex("by_cid", (q) => q.eq("cid", cid))
        .unique();
      if (p) {
        products.set(cid, p);
      }
    }
    return {
      vatRate,
      seeCosts,
      recipes: recipes.map((r) => {
        let result: ReturnType<typeof recipeCost> | null = null;
        try {
          result = recipeCost(toCost(r), byId, (id) => cost.get(id) ?? null);
        } catch (err) {
          if (!(err instanceof RecipeCycleError)) {
            throw err;
          }
        }
        const link = priceOf.get(r._id);
        const product = link?.productId ? products.get(link.productId) : undefined;
        const price = product?.price ?? link?.price ?? null;
        const target = r.targetGp ?? DEFAULT_TARGETS[r.category] ?? DEFAULT_TARGETS.other ?? 0.7;
        const total = result?.cost ?? 0;
        return {
          ...r,
          cost: seeCosts ? total : null,
          lineCosts: seeCosts ? (result?.lineCosts ?? []) : [],
          missing: (result?.missing ?? []).map((id) => names.get(id) ?? id),
          cycle: result === null,
          productId: link?.productId ?? null,
          productName: product?.name ?? null,
          price,
          target,
          gp: seeCosts && price !== null && r.kind === "menu" ? grossMargin(price, vatRate, total) : null,
          suggested: seeCosts && r.kind === "menu" ? suggestedPrice(total, target, vatRate) : null,
        };
      }),
    };
  },
});

const line = v.object({
  itemId: v.optional(v.id("invItems")),
  prepId: v.optional(v.id("invRecipes")),
  qty: v.number(),
  waste: v.number(),
});

/** Creates or edits a recipe; refuses preps that use each other in a loop. */
export const save = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.optional(v.id("invRecipes")),
    name: v.string(),
    kind: v.union(v.literal("menu"), v.literal("prep")),
    category: v.string(),
    yieldQty: v.number(),
    yieldUnit: invUnit,
    lines: v.array(line),
    targetGp: v.optional(v.number()),
    method: v.optional(v.string()),
    glass: v.optional(v.string()),
    garnish: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, EDIT, a.company);
    const group = await groupKey(ctx, a.company);
    const name = clean(a.name);
    if (!name) {
      throw new ConvexError("Dê um nome à ficha.");
    }
    const yieldQty = a.kind === "menu" ? 1 : a.yieldQty;
    if (!(yieldQty > 0)) {
      throw new ConvexError("Informe quanto a receita rende.");
    }
    const lines = a.lines.slice(0, 60).map((l) => ({
      itemId: l.itemId,
      prepId: l.prepId,
      qty: Math.round(l.qty * 1000) / 1000,
      waste: Math.min(0.9, Math.max(0, l.waste)),
    }));
    for (const l of lines) {
      if (Boolean(l.itemId) === Boolean(l.prepId) || !(l.qty > 0)) {
        throw new ConvexError("Cada ingrediente precisa de um item (ou preparo) e uma quantidade.");
      }
      const ref = l.itemId ? await ctx.db.get(l.itemId) : l.prepId ? await ctx.db.get(l.prepId) : null;
      if (!ref || ref.group !== group || ("kind" in ref && ref.kind !== "prep")) {
        throw new ConvexError("Ingrediente não encontrado neste grupo.");
      }
    }
    const now = Date.now();
    const fields = {
      name,
      kind: a.kind,
      category: clean(a.category, 30) || "other",
      yieldQty,
      yieldUnit: a.kind === "menu" ? ("un" as const) : a.yieldUnit,
      lines,
      targetGp: a.targetGp !== undefined && a.targetGp > 0 && a.targetGp < 1 ? a.targetGp : undefined,
      method: clean(a.method, 2000) || undefined,
      glass: clean(a.glass, 80) || undefined,
      garnish: clean(a.garnish, 120) || undefined,
      updatedAt: now,
    };
    // A prep may not end up using itself
    const all = await ctx.db
      .query("invRecipes")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(MAX);
    const map = new Map(all.map((r) => [r._id as string, toCost(r)]));
    const selfId = a.id ?? ("new" as Id<"invRecipes">);
    const self: CostRecipe = { id: selfId, yieldQty, lines };
    map.set(selfId, self);
    try {
      recipeCost(self, map, () => 1);
    } catch (err) {
      if (err instanceof RecipeCycleError) {
        throw new ConvexError("Um preparo não pode usar a si mesmo (direta ou indiretamente).");
      }
      throw err;
    }
    if (a.id) {
      const old = await ctx.db.get(a.id);
      if (old?.group !== group) {
        throw new ConvexError("Ficha não encontrada.");
      }
      await ctx.db.patch(a.id, fields);
      await audit(ctx, user, "Ficha técnica editada", name, a.company);
      return a.id;
    }
    const id = await ctx.db.insert("invRecipes", { ...fields, group, active: true, createdAt: now });
    await audit(ctx, user, "Ficha técnica criada", name, a.company);
    return id;
  },
});

export const setActive = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.id("invRecipes"),
    active: v.boolean(),
  },
  handler: async (ctx, { session, company, id, active }) => {
    await requireStaff(ctx, session, EDIT, company);
    const r = await ctx.db.get(id);
    if (r?.group !== (await groupKey(ctx, company))) {
      throw new ConvexError("Ficha não encontrada.");
    }
    if (!active && r.kind === "prep") {
      const users = (
        await ctx.db
          .query("invRecipes")
          .withIndex("by_group", (q) => q.eq("group", r.group))
          .take(MAX)
      ).filter((x) => x.active && x.lines.some((l) => l.prepId === id));
      if (users.length) {
        throw new ConvexError(`Este preparo é usado em: ${users.map((u) => u.name).slice(0, 3).join(", ")}.`);
      }
    }
    await ctx.db.patch(id, { active, updatedAt: Date.now() });
  },
});

/** In this bar: the POS product a menu recipe is sold as, or a price. */
export const setPrice = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    recipeId: v.id("invRecipes"),
    productId: v.optional(v.union(v.string(), v.null())),
    price: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { session, company, recipeId, productId, price }) => {
    await requireStaff(ctx, session, EDIT, company);
    const r = await ctx.db.get(recipeId);
    if (r?.group !== (await groupKey(ctx, company))) {
      throw new ConvexError("Ficha não encontrada.");
    }
    if (productId) {
      const p = await ctx.db
        .query("posProducts")
        .withIndex("by_cid", (q) => q.eq("cid", productId))
        .unique();
      if (!p || (p.company ?? "main") !== company) {
        throw new ConvexError("Produto não encontrado neste bar.");
      }
      const taken = await ctx.db
        .query("invRecipePrices")
        .withIndex("by_product", (q) => q.eq("company", company).eq("productId", productId))
        .first();
      if (taken && taken.recipeId !== recipeId) {
        const other = await ctx.db.get(taken.recipeId);
        throw new ConvexError(`Este produto já está na ficha ${other?.name ?? "outra"}.`);
      }
    }
    const row = await ctx.db
      .query("invRecipePrices")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId).eq("company", company))
      .unique();
    const doc = {
      productId: productId === undefined ? row?.productId : productId ?? undefined,
      price: price === undefined ? row?.price : price !== null && price >= 0 ? price : undefined,
      updatedAt: Date.now(),
    };
    if (row) {
      await ctx.db.patch(row._id, doc);
    } else {
      await ctx.db.insert("invRecipePrices", { company, recipeId, ...doc });
    }
  },
});

/** Starts empty menu recipes from POS products, already linked to them. */
export const fromMenu = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    productIds: v.array(v.string()),
  },
  handler: async (ctx, { session, company, productIds }) => {
    const user = await requireStaff(ctx, session, EDIT, company);
    const group = await groupKey(ctx, company);
    let created = 0;
    for (const cid of productIds.slice(0, 300)) {
      const p = await ctx.db
        .query("posProducts")
        .withIndex("by_cid", (q) => q.eq("cid", cid))
        .unique();
      if (!p || (p.company ?? "main") !== company) {
        continue;
      }
      const linked = await ctx.db
        .query("invRecipePrices")
        .withIndex("by_product", (q) => q.eq("company", company).eq("productId", cid))
        .first();
      if (linked) {
        continue;
      }
      const now = Date.now();
      const id = await ctx.db.insert("invRecipes", {
        group,
        name: clean(p.name),
        kind: "menu",
        category: categoryOf(p.category, Boolean(p.wine)),
        yieldQty: 1,
        yieldUnit: "un",
        lines: [],
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("invRecipePrices", { company, recipeId: id, productId: cid, updatedAt: now });
      created++;
    }
    await audit(ctx, user, "Fichas criadas do cardápio", `${created}`, company);
    return created;
  },
});

const COCKTAIL = /cocktail|coquetel|spritz|mojito|negroni|martini|sour|g&t|gin & tonic|gin and tonic/i;
const FOOD = /food|starter|main|burger|steak|rib|side|dessert|cheese|josper|kids|snack|platter|salad|pasta|pizza/i;

function categoryOf(category: string, wine: boolean) {
  if (wine || /wine|vinho|vino|champagne|prosecco/i.test(category)) {
    return "wine";
  }
  if (COCKTAIL.test(category)) {
    return "cocktail";
  }
  if (/beer|cerveja|birra/i.test(category)) {
    return "beer";
  }
  if (/whisk|gin|rum|vodka|tequila|shot|spirit|liqu|cognac|brandy/i.test(category)) {
    return "spirits";
  }
  if (/soft|water|juice|coffee|tea|mocktail/i.test(category)) {
    return "soft";
  }
  if (FOOD.test(category)) {
    return "food";
  }
  return "other";
}

/**
 * "Selling this product takes `qty` of this item": adds the ingredient to
 * the product's sheet in this bar, or creates the sheet (linked to the
 * product) when it has none. Used by the invoice agent's suggestions
 * (Small Still Water = 1 bottle of 275 ml; Single Espresso = 7 g coffee).
 */
export const addUse = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    productId: v.string(),
    itemId: v.id("invItems"),
    qty: v.number(),
  },
  handler: async (ctx, { session, company, productId, itemId, qty }) => {
    const user = await requireStaff(ctx, session, EDIT, company);
    const group = await groupKey(ctx, company);
    const item = await ctx.db.get(itemId);
    if (item?.group !== group) {
      throw new ConvexError("Item não encontrado.");
    }
    if (!(qty > 0)) {
      throw new ConvexError("Quantidade inválida.");
    }
    const product = await ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", productId))
      .unique();
    if (!product || (product.company ?? "main") !== company) {
      throw new ConvexError("Produto não encontrado neste bar.");
    }
    const link = await ctx.db
      .query("invRecipePrices")
      .withIndex("by_product", (q) => q.eq("company", company).eq("productId", productId))
      .first();
    const recipe = link ? await ctx.db.get(link.recipeId) : null;
    const now = Date.now();
    const amount = Math.round(qty * 1000) / 1000;
    if (recipe) {
      if (recipe.lines.some((l) => l.itemId === itemId)) {
        return recipe._id;
      }
      await ctx.db.patch(recipe._id, {
        lines: [...recipe.lines, { itemId, qty: amount, waste: 0 }],
        updatedAt: now,
      });
      await audit(ctx, user, "Ingrediente na ficha", `${recipe.name}: ${item.name} ${amount}`, company);
      return recipe._id;
    }
    const id = await ctx.db.insert("invRecipes", {
      group,
      name: clean(product.name),
      kind: "menu",
      category: categoryOf(product.category, Boolean(product.wine)),
      yieldQty: 1,
      yieldUnit: "un",
      lines: [{ itemId, qty: amount, waste: 0 }],
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("invRecipePrices", { company, recipeId: id, productId, updatedAt: now });
    await audit(ctx, user, "Ficha criada", `${product.name}: ${item.name} ${amount}`, company);
    return id;
  },
});

/**
 * Admin import (run from the CLI): technical sheets by name. Each line
 * names a stock item or a prep of the group; a sheet is created or
 * replaced by name, preps first, then linked to POS products of the
 * bars. Sheets with an unknown ingredient are skipped and reported.
 */
export const importSheets = internalMutation({
  args: {
    company: v.string(),
    sheets: v.array(
      v.object({
        name: v.string(),
        kind: v.union(v.literal("menu"), v.literal("prep")),
        category: v.string(),
        yieldQty: v.number(),
        yieldUnit: invUnit,
        lines: v.array(v.object({ name: v.string(), qty: v.number() })),
        method: v.optional(v.string()),
        glass: v.optional(v.string()),
        garnish: v.optional(v.string()),
        products: v.optional(v.array(v.object({ company: v.string(), productId: v.string() }))),
      })
    ),
  },
  handler: async (ctx, { company, sheets }) => {
    const group = await groupKey(ctx, company);
    const items = await ctx.db
      .query("invItems")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(5000);
    const itemBy = new Map(items.filter((i) => i.active).map((i) => [i.name, i._id]));
    const out = { created: 0, updated: 0, linked: 0, skipped: [] as string[], linkErrors: [] as string[] };
    const ordered = [...sheets].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "prep" ? -1 : 1));
    for (const s of ordered.slice(0, 300)) {
      const name = clean(s.name);
      const recipes = await ctx.db
        .query("invRecipes")
        .withIndex("by_group", (q) => q.eq("group", group))
        .take(MAX);
      const prepBy = new Map(recipes.filter((r) => r.kind === "prep" && r.active).map((r) => [r.name, r._id]));
      const lines = [];
      const missing: string[] = [];
      for (const l of s.lines.slice(0, 60)) {
        const itemId = itemBy.get(clean(l.name));
        const prepId = itemId ? undefined : prepBy.get(clean(l.name));
        if (!(itemId || prepId) || !(l.qty > 0)) {
          missing.push(l.name);
          continue;
        }
        lines.push({ itemId, prepId, qty: Math.round(l.qty * 1000) / 1000, waste: 0 });
      }
      if (!name || missing.length) {
        out.skipped.push(`${name}: ${missing.join(", ")}`);
        continue;
      }
      const yieldQty = s.kind === "menu" ? 1 : s.yieldQty;
      const now = Date.now();
      const fields = {
        name,
        kind: s.kind,
        category: clean(s.category, 30) || "other",
        yieldQty,
        yieldUnit: s.kind === "menu" ? ("un" as const) : s.yieldUnit,
        lines,
        method: clean(s.method, 2000) || undefined,
        glass: clean(s.glass, 80) || undefined,
        garnish: clean(s.garnish, 120) || undefined,
        active: true,
        updatedAt: now,
      };
      const cur = recipes.find((r) => r.name === name);
      let id: Id<"invRecipes">;
      if (cur) {
        await ctx.db.patch(cur._id, fields);
        id = cur._id;
        out.updated++;
      } else {
        id = await ctx.db.insert("invRecipes", { ...fields, group, createdAt: now });
        out.created++;
      }
      for (const p of s.products ?? []) {
        const prod = await ctx.db
          .query("posProducts")
          .withIndex("by_cid", (q) => q.eq("cid", p.productId))
          .unique();
        if (!prod || (prod.company ?? "main") !== p.company) {
          out.linkErrors.push(`${name}: ${p.productId} não existe em ${p.company}`);
          continue;
        }
        const taken = await ctx.db
          .query("invRecipePrices")
          .withIndex("by_product", (q) => q.eq("company", p.company).eq("productId", p.productId))
          .first();
        if (taken && taken.recipeId !== id) {
          out.linkErrors.push(`${name}: ${prod.name} já está em outra ficha`);
          continue;
        }
        const row = await ctx.db
          .query("invRecipePrices")
          .withIndex("by_recipe", (q) => q.eq("recipeId", id).eq("company", p.company))
          .unique();
        if (row) {
          await ctx.db.patch(row._id, { productId: p.productId, updatedAt: now });
        } else {
          await ctx.db.insert("invRecipePrices", { company: p.company, recipeId: id, productId: p.productId, updatedAt: now });
        }
        out.linked++;
      }
    }
    await audit(ctx, null, "Fichas técnicas importadas", `${out.created} novas, ${out.updated} atualizadas`, company);
    return out;
  },
});
