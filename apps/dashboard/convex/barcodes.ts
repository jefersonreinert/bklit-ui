import { ConvexError, v } from "convex/values";
import { validGtin, normalizeGtin } from "../lib/inventory/gtin";
import { AUTO_SCORE, bestByName, nameScore, wmKey } from "../lib/inventory/match";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { audit, requireStaff } from "./access";
import { groupOf, setBarcodes } from "./inv";

/**
 * Barcodes (GTIN) of the wines in the dispensers. The finder agent
 * (lib/server/barcode-finder.ts) looks each wine up and saves what it
 * found with its source; a person accepts it (or scans the bottle). On
 * accept the code joins the wine's stock item — created when missing —
 * and the dispenser wine is linked to it, so its pours take stock.
 */

const clean = (s: string | undefined, max = 200) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

interface WmWine {
  sku: string;
  name: string;
  producer?: string;
  description?: string;
  title2?: string;
  origin?: string;
  vintage?: string;
  volumeMl?: number;
}

async function wines(ctx: QueryCtx, company: string) {
  const state = await ctx.db
    .query("wmState")
    .withIndex("by_company", (q) => q.eq("company", company))
    .first();
  const list = (Array.isArray(state?.wines) ? state.wines : []) as WmWine[];
  // "sku" below is the wine's unique key (SKU + name): the portal reuses SKUs
  const seen = new Set<string>();
  return list
    .filter((w) => w?.sku && w.name)
    .map((w) => ({ ...w, wmSku: w.sku, sku: wmKey(w.sku, w.name) }))
    .filter((w) => !seen.has(w.sku) && Boolean(seen.add(w.sku)));
}

async function wineItems(ctx: QueryCtx, company: string) {
  const group = (await groupOf(ctx, company))?.key ?? company;
  const items = await ctx.db
    .query("invItems")
    .withIndex("by_group", (q) => q.eq("group", group))
    .take(2000);
  return { group, items: items.filter((i) => i.active) };
}

async function linkOf(ctx: QueryCtx, company: string, sku: string) {
  return await ctx.db
    .query("invSaleLinks")
    .withIndex("by_key", (q) => q.eq("company", company).eq("source", "wm").eq("key", sku))
    .unique();
}

/** Every dispenser wine with its stock item (or best guess) and find. */
export const context = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    const [list, { items }] = await Promise.all([wines(ctx, company), wineItems(ctx, company)]);
    const byId = new Map(items.map((i) => [i._id as string, i]));
    const ml = items.filter((i) => i.unit === "ml");
    const rows = [];
    for (const w of list) {
      const link = await linkOf(ctx, company, w.sku);
      const linked = link?.itemId ? byId.get(link.itemId) : undefined;
      const find = await ctx.db
        .query("invBarcodeFinds")
        .withIndex("by_sku", (q) => q.eq("company", company).eq("sku", w.sku))
        .first();
      const chosen = find?.itemId ? byId.get(find.itemId) : undefined;
      const guess = linked || chosen
        ? null
        : bestByName(w.name, ml.map((i) => ({ id: i._id as string, name: i.name })));
      const item = linked ?? chosen ?? (guess && guess.score >= AUTO_SCORE ? byId.get(guess.item.id) : undefined);
      // The closest catalog wines, for the finder to say which is the same
      const candidates = linked
        ? []
        : ml
            .map((i) => ({ id: i._id, name: i.name, score: Math.round(nameScore(w.name, i.name) * 100) / 100 }))
            .filter((c) => c.score >= 0.2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
      rows.push({
        sku: w.sku,
        wmSku: w.wmSku,
        wine: w.name,
        producer: w.producer ?? "",
        grape: w.title2 || w.description || "",
        origin: w.origin ?? "",
        vintage: w.vintage ?? "",
        volumeMl: w.volumeMl ?? 750,
        itemId: item?._id ?? null,
        itemName: item?.name ?? null,
        linked: Boolean(linked),
        candidates,
        barcodes: item?.barcodes ?? [],
        find: find
          ? {
              gtin: find.gtin ?? null,
              source: find.source ?? null,
              note: find.note ?? null,
              confidence: find.confidence,
              status: find.status,
            }
          : null,
      });
    }
    return rows.sort((a, b) => a.wine.localeCompare(b.wine));
  },
});

const findV = v.object({
  sku: v.string(),
  gtin: v.optional(v.string()),
  itemId: v.optional(v.id("invItems")),
  source: v.optional(v.string()),
  note: v.optional(v.string()),
  confidence: v.number(),
});

type FindIn = {
  sku: string;
  gtin?: string;
  itemId?: Id<"invItems">;
  source?: string;
  note?: string;
  confidence: number;
};

/** Saves finds for review; codes with a wrong check digit are dropped. */
async function saveFindsFor(ctx: MutationCtx, company: string, finds: FindIn[]) {
  const { items } = await wineItems(ctx, company);
  const inGroup = new Set(items.map((i) => i._id as string));
  const known = new Map((await wines(ctx, company)).map((w) => [w.sku, w.name]));
  let saved = 0;
  for (const f of finds.slice(0, 200)) {
    const wine = known.get(f.sku);
    if (!wine) {
      continue;
    }
    const code = f.gtin ? normalizeGtin(f.gtin) : "";
    const ok = code && validGtin(code);
    const row = await ctx.db
      .query("invBarcodeFinds")
      .withIndex("by_sku", (q) => q.eq("company", company).eq("sku", f.sku))
      .first();
    if (row?.status === "accepted") {
      continue;
    }
    const doc = {
      company,
      sku: f.sku,
      wine,
      gtin: ok ? code : undefined,
      itemId: f.itemId && inGroup.has(f.itemId) ? f.itemId : undefined,
      source: clean(f.source, 300) || undefined,
      note:
        clean(code && !ok ? `Código ${code} com dígito verificador errado, descartado. ${f.note ?? ""}` : f.note, 300) ||
        undefined,
      confidence: Math.min(1, Math.max(0, f.confidence)),
      status: ok ? ("found" as const) : ("notfound" as const),
      at: Date.now(),
    };
    if (row) {
      await ctx.db.replace(row._id, doc);
    } else {
      await ctx.db.insert("invBarcodeFinds", doc);
    }
    saved++;
  }
  return saved;
}

/** What the finder agent found (codes with a wrong check digit are dropped). */
export const saveFinds = mutation({
  args: { session: v.optional(v.string()), company: v.string(), finds: v.array(findV) },
  handler: async (ctx, { session, company, finds }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    return await saveFindsFor(ctx, company, finds);
  },
});

/**
 * The same from a lookup done outside the app (by the operator with
 * the deploy key): the finds wait for a person to accept them.
 */
export const importFinds = internalMutation({
  args: { company: v.string(), finds: v.array(findV) },
  handler: async (ctx, { company, finds }) => await saveFindsFor(ctx, company, finds),
});

/**
 * The wine's stock item: the one linked to the dispenser wine, else the
 * same name in the catalog, else a new bottle — and the link is made.
 */
async function itemFor(ctx: MutationCtx, company: string, w: WmWine): Promise<Doc<"invItems">> {
  const link = await linkOf(ctx, company, w.sku);
  const { group, items } = await wineItems(ctx, company);
  let item = link?.itemId ? items.find((i) => i._id === link.itemId) : undefined;
  if (!item) {
    // The finder's choice of the same wine in the catalog
    const find = await ctx.db
      .query("invBarcodeFinds")
      .withIndex("by_sku", (q) => q.eq("company", company).eq("sku", w.sku))
      .first();
    item = find?.itemId ? items.find((i) => i._id === find.itemId) : undefined;
  }
  if (!item) {
    const guess = bestByName(w.name, items.filter((i) => i.unit === "ml").map((i) => ({ id: i._id as string, name: i.name })));
    item = guess && guess.score >= AUTO_SCORE ? items.find((i) => i._id === guess.item.id) : undefined;
  }
  if (!item) {
    const now = Date.now();
    const id = await ctx.db.insert("invItems", {
      group,
      name: clean(w.name, 120),
      category: "wine",
      unit: "ml",
      size: w.volumeMl && w.volumeMl > 0 ? w.volumeMl : 750,
      container: "garrafa",
      barcodes: [],
      note: [w.title2 || w.description, w.origin, w.vintage].filter(Boolean).join(" · ") || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    item = (await ctx.db.get(id)) as Doc<"invItems">;
  }
  if (!link) {
    await ctx.db.insert("invSaleLinks", {
      company,
      source: "wm",
      key: w.sku,
      name: w.name,
      itemId: item._id,
      updatedAt: Date.now(),
    });
  } else if (link.itemId !== item._id) {
    await ctx.db.patch(link._id, { itemId: item._id, recipeId: undefined, updatedAt: Date.now() });
  }
  return item;
}

/** Puts a code on the wine's item (found by the agent, or scanned). */
export const accept = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    sku: v.string(),
    gtin: v.string(),
    scanned: v.optional(v.boolean()),
  },
  handler: async (ctx, { session, company, sku, gtin, scanned }) => {
    const user = await requireStaff(ctx, session, ["stock", "products"], company);
    const w = (await wines(ctx, company)).find((x) => x.sku === sku);
    if (!w) {
      throw new ConvexError("Vinho não encontrado nas máquinas.");
    }
    // A scanned code is kept as read (internal labels may have letters)
    const code = scanned ? gtin.trim().slice(0, 40) : normalizeGtin(gtin);
    if (!code || (!scanned && !validGtin(code))) {
      throw new ConvexError("Código inválido (dígito verificador).");
    }
    const item = await itemFor(ctx, company, w);
    const codes = await setBarcodes(ctx, item.group, item._id as Id<"invItems">, [...item.barcodes, code]);
    await ctx.db.patch(item._id, { barcodes: codes, updatedAt: Date.now() });
    const row = await ctx.db
      .query("invBarcodeFinds")
      .withIndex("by_sku", (q) => q.eq("company", company).eq("sku", sku))
      .first();
    const doc = {
      company,
      sku,
      wine: w.name,
      gtin: code,
      itemId: item._id,
      source: scanned ? "escaneado na garrafa" : row?.source,
      note: row?.note,
      confidence: scanned ? 1 : (row?.confidence ?? 1),
      status: "accepted" as const,
      at: Date.now(),
    };
    if (row) {
      await ctx.db.replace(row._id, doc);
    } else {
      await ctx.db.insert("invBarcodeFinds", doc);
    }
    await audit(ctx, user, "Código de barras do vinho", `${w.name}: ${code}`, company);
    return item._id;
  },
});

export const reject = mutation({
  args: { session: v.optional(v.string()), company: v.string(), sku: v.string() },
  handler: async (ctx, { session, company, sku }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    const row = await ctx.db
      .query("invBarcodeFinds")
      .withIndex("by_sku", (q) => q.eq("company", company).eq("sku", sku))
      .first();
    if (row && row.status !== "accepted") {
      await ctx.db.patch(row._id, { status: "rejected", at: Date.now() });
    }
  },
});
