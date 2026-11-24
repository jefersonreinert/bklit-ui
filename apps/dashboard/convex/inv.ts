import { ConvexError, v } from "convex/values";
import {
  averageCost,
  type BottleProfile,
  countedQty,
} from "../lib/inventory/units";
import { normalizeName } from "../lib/inventory/match";
import { dayKey } from "../lib/inventory/reorder";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { audit, type Perm, requireStaff } from "./access";
import { invUnit } from "./schema";

/**
 * Stock control of a group of bars. The catalog of stock items belongs
 * to the group (the same bottle in every bar); each business has its own
 * balance and average cost. Every change of stock is a row of the ledger
 * (invMoves) written by post(): the balance (invStock) is only a cache of
 * the ledger's sum, and a source reference (`ref`) makes the same count
 * line, invoice line or sale move stock only once.
 */

const READ: Perm[] = ["stock", "products", "reports"];
const EDIT: Perm[] = ["stock", "products"];
const MAX_ITEMS = 2000;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const clean = (s: string | undefined, max = 120) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/* --------------------------------- group --------------------------------- */

/** The group a business belongs to (a business alone is its own group). */
export async function groupOf(ctx: QueryCtx, company: string) {
  const groups = await ctx.db.query("invGroups").take(50);
  const g = groups.find((x) => x.companies.includes(company));
  return g ?? null;
}

const groupKey = async (ctx: QueryCtx, company: string) =>
  (await groupOf(ctx, company))?.key ?? company;

/* ------------------------- barcodes: product ↔ item ------------------------ */
// A POS product and the stock item with the same name are the same bottle:
// a code scanned on either one is saved on the other too. Codes never move
// from one item to another, and a product's own code is never replaced.

/** Code typed on a POS product → the same-name stock item of its group. */
export async function codeToItem(
  ctx: MutationCtx,
  company: string,
  name: string,
  code: string | undefined
) {
  const c = (code ?? "").trim();
  if (!c) {
    return;
  }
  const group = await groupKey(ctx, company);
  const key = normalizeName(name);
  const items = await ctx.db
    .query("invItems")
    .withIndex("by_group", (q) => q.eq("group", group))
    .take(5000);
  const item = items.find((i) => i.active && normalizeName(i.name) === key);
  if (!item || item.barcodes.includes(c)) {
    return;
  }
  const taken = await ctx.db
    .query("invBarcodes")
    .withIndex("by_code", (q) => q.eq("group", group).eq("code", c))
    .first();
  if (taken) {
    return;
  }
  const codes = await setBarcodes(ctx, group, item._id, [...item.barcodes, c]);
  await ctx.db.patch(item._id, { barcodes: codes, updatedAt: Date.now() });
}

/** Codes of a stock item → same-name POS products (of every bar in the group) without one. */
export async function codesToProducts(
  ctx: MutationCtx,
  company: string,
  name: string,
  codes: string[]
) {
  const code = codes[0];
  if (!code) {
    return;
  }
  const companies = (await groupOf(ctx, company))?.companies ?? [company];
  const key = normalizeName(name);
  for (const c of companies) {
    const products = await ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", c))
      .take(3000);
    for (const p of products) {
      if (!p.barcode && normalizeName(p.name) === key) {
        await ctx.db.patch(p._id, { barcode: code, updatedAt: Date.now() });
      }
    }
  }
}

/**
 * Country of a bottle → its same-name stock item and POS products in every
 * bar of the group (wines keep wine.country in step too).
 */
export async function countryToTwins(
  ctx: MutationCtx,
  company: string,
  name: string,
  country: string | undefined
) {
  await originToTwins(ctx, company, name, { country });
}

/**
 * Country and/or alcohol (% vol.) of one bottle, copied to the stock item
 * and every product with the same name in the group (wines keep
 * wine.country in step). Only the keys present are written.
 */
export async function originToTwins(
  ctx: MutationCtx,
  company: string,
  name: string,
  set: { country?: string | undefined; abv?: number | undefined }
) {
  const g = await groupOf(ctx, company);
  const key = normalizeName(name);
  const now = Date.now();
  const hasCountry = "country" in set;
  const hasAbv = "abv" in set;
  const items = await ctx.db
    .query("invItems")
    .withIndex("by_group", (q) => q.eq("group", g?.key ?? company))
    .take(5000);
  for (const i of items) {
    const off =
      (hasCountry && i.country !== set.country) ||
      (hasAbv && i.abv !== set.abv);
    if (off && normalizeName(i.name) === key) {
      await ctx.db.patch(i._id, {
        ...(hasCountry ? { country: set.country } : {}),
        ...(hasAbv ? { abv: set.abv } : {}),
        updatedAt: now,
      });
    }
  }
  for (const c of g?.companies ?? [company]) {
    const products = await ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", c))
      .take(5000);
    for (const p of products) {
      if (normalizeName(p.name) !== key) {
        continue;
      }
      const off =
        (hasCountry &&
          (p.country !== set.country ||
            (p.wine && p.wine.country !== set.country))) ||
        (hasAbv && p.abv !== set.abv);
      if (!off) {
        continue;
      }
      await ctx.db.patch(p._id, {
        ...(hasCountry ? { country: set.country } : {}),
        ...(hasAbv ? { abv: set.abv } : {}),
        ...(p.wine
          ? {
              wine: {
                ...p.wine,
                ...(hasCountry ? { country: set.country } : {}),
              },
            }
          : {}),
        updatedAt: now,
      });
    }
  }
}

async function itemInGroup(
  ctx: QueryCtx,
  itemId: Id<"invItems">,
  company: string
) {
  const item = await ctx.db.get(itemId);
  if (!item || item.group !== (await groupKey(ctx, company))) {
    throw new ConvexError("Item não encontrado neste bar.");
  }
  return item;
}

/* -------------------------------- ledger --------------------------------- */

async function stockRow(
  ctx: QueryCtx,
  company: string,
  itemId: Id<"invItems">
) {
  return await ctx.db
    .query("invStock")
    .withIndex("by_item", (q) => q.eq("itemId", itemId).eq("company", company))
    .unique();
}

type MoveKind = Doc<"invMoves">["kind"];

/** Movements that bring stock in at a cost (they move the average). */
const COSTED_IN: MoveKind[] = ["opening", "purchase", "transfer_in"];

/**
 * Writes one movement of the ledger and updates the balance. A movement
 * whose `ref` was already written is skipped (returns null).
 */
export async function post(
  ctx: MutationCtx,
  m: {
    company: string;
    itemId: Id<"invItems">;
    kind: MoveKind;
    qty: number;
    unitCost?: number;
    ref?: string;
    note?: string;
    userName: string;
    at?: number;
  }
) {
  if (!Number.isFinite(m.qty)) {
    throw new ConvexError("Quantidade inválida.");
  }
  if (m.ref) {
    const done = await ctx.db
      .query("invMoves")
      .withIndex("by_ref", (q) => q.eq("ref", m.ref))
      .first();
    if (done) {
      return null;
    }
  }
  const at = m.at ?? Date.now();
  const row = await stockRow(ctx, m.company, m.itemId);
  const before = row?.qty ?? 0;
  const avg = row?.avgCost ?? 0;
  const qty = r3(m.qty);
  const after = r3(before + qty);
  const unitCost = r6(m.unitCost ?? avg);
  const avgCost =
    COSTED_IN.includes(m.kind) && qty > 0 && m.unitCost !== undefined
      ? averageCost(before, avg, qty, m.unitCost)
      : avg;
  if (row) {
    await ctx.db.patch(row._id, { qty: after, avgCost, updatedAt: at });
  } else {
    await ctx.db.insert("invStock", {
      company: m.company,
      itemId: m.itemId,
      qty: after,
      avgCost,
      updatedAt: at,
    });
  }
  // Daily usage for reorder suggestions (a sale given back lowers it)
  if (m.kind === "sale" || m.kind === "waste") {
    const day = dayKey(at);
    const used = await ctx.db
      .query("invUsageDaily")
      .withIndex("by_item_day", (q) =>
        q.eq("company", m.company).eq("itemId", m.itemId).eq("day", day)
      )
      .unique();
    if (used) {
      await ctx.db.patch(used._id, { qty: r3(used.qty - qty) });
    } else {
      await ctx.db.insert("invUsageDaily", {
        company: m.company,
        itemId: m.itemId,
        day,
        qty: -qty,
      });
    }
  }
  return await ctx.db.insert("invMoves", {
    company: m.company,
    itemId: m.itemId,
    kind: m.kind,
    qty,
    unitCost,
    after,
    ref: m.ref,
    note: m.note ? clean(m.note, 200) : undefined,
    userName: m.userName,
    at,
  });
}

/* --------------------------------- reads --------------------------------- */

/** Catalog of the group with this business's balances, and its areas. */
export const overview = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const user = await requireStaff(ctx, session, READ, company);
    const group = await groupOf(ctx, company);
    const key = group?.key ?? company;
    const [items, stock, areas] = await Promise.all([
      ctx.db
        .query("invItems")
        .withIndex("by_group", (q) => q.eq("group", key))
        .take(MAX_ITEMS),
      ctx.db
        .query("invStock")
        .withIndex("by_company", (q) => q.eq("company", company))
        .take(MAX_ITEMS),
      ctx.db
        .query("invAreas")
        .withIndex("by_company", (q) => q.eq("company", company))
        .take(100),
    ]);
    const byItem = new Map(stock.map((s) => [s.itemId, s]));
    const costs =
      user.perms.includes("users") ||
      user.perms.includes("reports") ||
      user.perms.includes("stock");
    return {
      group: group
        ? { key: group.key, name: group.name, companies: group.companies }
        : null,
      seeCosts: costs,
      items: items.map((i) => {
        const s = byItem.get(i._id);
        return {
          ...i,
          qty: s?.qty ?? 0,
          avgCost: costs ? (s?.avgCost ?? 0) : null,
          min: s?.min,
          par: s?.par,
          lastCountAt: s?.lastCountAt,
        };
      }),
      areas: areas.filter((a) => a.active),
    };
  },
});

/** Latest movements of a business (optionally one item). */
export const moves = query({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    itemId: v.optional(v.id("invItems")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { session, company, itemId, limit }) => {
    await requireStaff(ctx, session, READ, company);
    const n = Math.min(500, Math.max(1, limit ?? 200));
    const rows = itemId
      ? await ctx.db
          .query("invMoves")
          .withIndex("by_item", (q) =>
            q.eq("itemId", itemId).eq("company", company)
          )
          .order("desc")
          .take(n)
      : await ctx.db
          .query("invMoves")
          .withIndex("by_company_at", (q) => q.eq("company", company))
          .order("desc")
          .take(n);
    return rows;
  },
});

/** The item with this barcode in the business's group. */
export const byBarcode = query({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    code: v.string(),
  },
  handler: async (ctx, { session, company, code }) => {
    await requireStaff(ctx, session, READ, company);
    const key = await groupKey(ctx, company);
    const hit = await ctx.db
      .query("invBarcodes")
      .withIndex("by_code", (q) => q.eq("group", key).eq("code", code.trim()))
      .first();
    return hit?.itemId ?? null;
  },
});

/* ------------------------------ group & items ----------------------------- */

/** Administrator: the businesses that share one catalog. */
export const saveGroup = mutation({
  args: {
    session: v.optional(v.string()),
    key: v.string(),
    name: v.string(),
    companies: v.array(v.string()),
  },
  handler: async (ctx, { session, key, name, companies }) => {
    const user = await requireStaff(ctx, session, "users");
    const k = clean(key, 40).toLowerCase();
    if (!(k && companies.length)) {
      throw new ConvexError("Informe o nome e os bares do grupo.");
    }
    const others = (await ctx.db.query("invGroups").take(50)).filter(
      (g) => g.key !== k
    );
    for (const c of companies) {
      if (others.some((g) => g.companies.includes(c))) {
        throw new ConvexError(`O bar ${c} já está em outro grupo.`);
      }
    }
    const existing = await ctx.db
      .query("invGroups")
      .withIndex("by_key", (q) => q.eq("key", k))
      .unique();
    const doc = {
      key: k,
      name: clean(name, 60),
      companies: [...new Set(companies)],
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("invGroups", doc);
    }
    await audit(
      ctx,
      user,
      "Grupo de estoque",
      `${doc.name}: ${doc.companies.join(", ")}`
    );
    return k;
  },
});

export async function setBarcodes(
  ctx: MutationCtx,
  group: string,
  itemId: Id<"invItems">,
  codes: string[]
) {
  const want = [...new Set(codes.map((c) => c.trim()).filter(Boolean))].slice(
    0,
    20
  );
  for (const code of want) {
    const taken = await ctx.db
      .query("invBarcodes")
      .withIndex("by_code", (q) => q.eq("group", group).eq("code", code))
      .first();
    if (taken && taken.itemId !== itemId) {
      const other = await ctx.db.get(taken.itemId);
      throw new ConvexError(
        `O código ${code} já é do item ${other?.name ?? "outro"}.`
      );
    }
  }
  const old = await ctx.db
    .query("invBarcodes")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .take(50);
  for (const b of old) {
    if (!want.includes(b.code)) {
      await ctx.db.delete(b._id);
    }
  }
  for (const code of want) {
    if (!old.some((b) => b.code === code)) {
      await ctx.db.insert("invBarcodes", { group, code, itemId });
    }
  }
  return want;
}

const positive = (n: number | undefined) =>
  n === undefined ? undefined : Number.isFinite(n) && n > 0 ? r3(n) : undefined;

/** Creates or edits a stock item, and this business's levels and cost. */
export const saveItem = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.optional(v.id("invItems")),
    name: v.string(),
    category: v.string(),
    unit: invUnit,
    size: v.number(),
    container: v.string(),
    barcodes: v.array(v.string()),
    emptyG: v.optional(v.number()),
    fullG: v.optional(v.number()),
    abv: v.optional(v.number()),
    sku: v.optional(v.string()),
    note: v.optional(v.string()),
    /** Country of origin (English short name); "" clears it. */
    country: v.optional(v.string()),
    min: v.optional(v.number()),
    par: v.optional(v.number()),
    /** Cost per base unit, until invoices set it. */
    avgCost: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, EDIT, a.company);
    const group = await groupKey(ctx, a.company);
    const name = clean(a.name);
    if (!name) {
      throw new ConvexError("Dê um nome ao item.");
    }
    const size = a.unit === "un" ? Math.max(1, Math.round(a.size)) : r3(a.size);
    if (!(size > 0)) {
      throw new ConvexError("Informe o conteúdo da embalagem.");
    }
    const emptyG = positive(a.emptyG);
    const fullG = positive(a.fullG);
    if (emptyG !== undefined && fullG !== undefined && fullG <= emptyG) {
      throw new ConvexError("O peso cheio deve ser maior que o vazio.");
    }
    const now = Date.now();
    const fields = {
      name,
      category: clean(a.category, 30) || "other",
      unit: a.unit,
      size,
      container: clean(a.container, 30) || "un",
      emptyG,
      fullG,
      abv:
        a.abv !== undefined && a.abv >= 0 && a.abv <= 100 ? a.abv : undefined,
      sku: clean(a.sku, 40) || undefined,
      note: clean(a.note, 300) || undefined,
      ...(a.country === undefined
        ? {}
        : { country: clean(a.country, 60) || undefined }),
      updatedAt: now,
    };
    let id = a.id;
    let abvChanged = fields.abv !== undefined;
    if (id) {
      const before = await itemInGroup(ctx, id, a.company);
      abvChanged = before.abv !== fields.abv;
      await ctx.db.patch(id, fields);
    } else {
      const same = await ctx.db
        .query("invItems")
        .withIndex("by_group", (q) => q.eq("group", group).eq("name", name))
        .first();
      if (same) {
        throw new ConvexError("Já existe um item com esse nome.");
      }
      id = await ctx.db.insert("invItems", {
        ...fields,
        group,
        barcodes: [],
        active: true,
        createdAt: now,
      });
    }
    const barcodes = await setBarcodes(ctx, group, id, a.barcodes);
    await ctx.db.patch(id, { barcodes });
    await codesToProducts(ctx, a.company, name, barcodes);
    if (a.country !== undefined || abvChanged) {
      await originToTwins(ctx, a.company, name, {
        ...(a.country === undefined
          ? {}
          : { country: clean(a.country, 60) || undefined }),
        ...(abvChanged ? { abv: fields.abv } : {}),
      });
    }
    // Levels and manual cost belong to this business
    const row = await stockRow(ctx, a.company, id);
    const levels = {
      min: a.min !== undefined && a.min >= 0 ? r3(a.min) : undefined,
      par: a.par !== undefined && a.par >= 0 ? r3(a.par) : undefined,
      ...(a.avgCost !== undefined && a.avgCost >= 0
        ? { avgCost: r6(a.avgCost) }
        : {}),
      updatedAt: now,
    };
    if (row) {
      await ctx.db.patch(row._id, levels);
    } else {
      await ctx.db.insert("invStock", {
        company: a.company,
        itemId: id,
        qty: 0,
        avgCost: levels.avgCost ?? 0,
        min: levels.min,
        par: levels.par,
        updatedAt: now,
      });
    }
    await audit(
      ctx,
      user,
      a.id ? "Item de estoque editado" : "Item de estoque criado",
      name,
      a.company
    );
    return id;
  },
});

export const setItemActive = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.id("invItems"),
    active: v.boolean(),
  },
  handler: async (ctx, { session, company, id, active }) => {
    const user = await requireStaff(ctx, session, EDIT, company);
    const item = await itemInGroup(ctx, id, company);
    await ctx.db.patch(id, { active, updatedAt: Date.now() });
    await audit(
      ctx,
      user,
      active ? "Item reativado" : "Item arquivado",
      item.name,
      company
    );
  },
});

/**
 * Starts the catalog from the POS menu: each chosen product becomes a
 * stock item (a wine sold by the glass becomes its bottle in ml).
 */
export const importFromPos = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    productIds: v.array(v.string()),
  },
  handler: async (ctx, { session, company, productIds }) => {
    const user = await requireStaff(ctx, session, EDIT, company);
    const group = await groupKey(ctx, company);
    let created = 0;
    for (const cid of productIds.slice(0, 500)) {
      const p = await ctx.db
        .query("posProducts")
        .withIndex("by_cid", (q) => q.eq("cid", cid))
        .unique();
      if (!p || (p.company ?? "main") !== company) {
        continue;
      }
      const name = clean(p.name);
      const same = await ctx.db
        .query("invItems")
        .withIndex("by_group", (q) => q.eq("group", group).eq("name", name))
        .first();
      if (same) {
        continue;
      }
      const wine = p.wine;
      const now = Date.now();
      const id = await ctx.db.insert("invItems", {
        group,
        name,
        category: wine ? "wine" : guessCategory(p.category),
        unit: wine ? "ml" : "un",
        size: wine ? wine.bottleMl || 750 : 1,
        container: wine || p.unit === "garrafa" ? "garrafa" : "un",
        barcodes: [],
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      if (p.barcode) {
        const codes = await setBarcodes(ctx, group, id, [p.barcode]).catch(
          () => []
        );
        await ctx.db.patch(id, { barcodes: codes });
      }
      created++;
    }
    await audit(
      ctx,
      user,
      "Itens importados do POS",
      `${created} itens`,
      company
    );
    return created;
  },
});

function guessCategory(category: string) {
  const c = category.toLowerCase();
  if (/wine|vinho|vino/.test(c)) {
    return c.includes("spark") || c.includes("champ") ? "sparkling" : "wine";
  }
  if (/beer|cerveja|birra/.test(c)) {
    return "beer";
  }
  if (/whisk|gin|rum|vodka|tequila|cogna|brandy|spirit/.test(c)) {
    return "spirits";
  }
  if (/liqu|licor|amaro/.test(c)) {
    return "liqueur";
  }
  if (/soft|water|água|juice|suco/.test(c)) {
    return "soft";
  }
  return "other";
}

/* --------------------------------- areas --------------------------------- */

export const saveArea = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.optional(v.id("invAreas")),
    name: v.string(),
    items: v.optional(v.array(v.id("invItems"))),
  },
  handler: async (ctx, { session, company, id, name, items }) => {
    await requireStaff(ctx, session, EDIT, company);
    const label = clean(name, 40);
    if (!label) {
      throw new ConvexError("Dê um nome à área.");
    }
    const list = items ? [...new Set(items)].slice(0, MAX_ITEMS) : undefined;
    if (id) {
      const area = await ctx.db.get(id);
      if (!area || area.company !== company) {
        throw new ConvexError("Área não encontrada.");
      }
      await ctx.db.patch(id, { name: label, ...(list ? { items: list } : {}) });
      return id;
    }
    const all = await ctx.db
      .query("invAreas")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(100);
    return await ctx.db.insert("invAreas", {
      company,
      name: label,
      sort: all.length,
      items: list ?? [],
      active: true,
    });
  },
});

export const removeArea = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.id("invAreas"),
  },
  handler: async (ctx, { session, company, id }) => {
    await requireStaff(ctx, session, EDIT, company);
    const area = await ctx.db.get(id);
    if (area?.company === company) {
      await ctx.db.patch(id, { active: false });
    }
  },
});

/* ------------------------------- movements ------------------------------- */

const MANUAL = v.union(
  v.literal("opening"),
  v.literal("waste"),
  v.literal("adjust")
);

/**
 * A manual movement: opening stock, waste (breakage, spill, staff,
 * comp — a reason is required) or a signed adjustment.
 */
export const addMove = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    itemId: v.id("invItems"),
    kind: MANUAL,
    qty: v.number(),
    unitCost: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, "stock", a.company);
    const item = await itemInGroup(ctx, a.itemId, a.company);
    if (!(Number.isFinite(a.qty) && a.qty !== 0)) {
      throw new ConvexError("Informe a quantidade.");
    }
    if (a.kind !== "adjust" && a.qty < 0) {
      throw new ConvexError("Use uma quantidade positiva.");
    }
    if (a.kind !== "opening" && !clean(a.note)) {
      throw new ConvexError("Diga o motivo.");
    }
    const qty = a.kind === "waste" ? -a.qty : a.qty;
    await post(ctx, {
      company: a.company,
      itemId: a.itemId,
      kind: a.kind,
      qty,
      unitCost: a.kind === "opening" ? a.unitCost : undefined,
      note: a.note,
      userName: user.name,
    });
    await audit(
      ctx,
      user,
      `Estoque: ${a.kind}`,
      `${item.name} ${qty}`,
      a.company
    );
  },
});

/** Moves stock from one bar of the group to another at its average cost. */
export const transfer = mutation({
  args: {
    session: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    itemId: v.id("invItems"),
    qty: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, "stock", a.from);
    await requireStaff(ctx, a.session, "stock", a.to);
    const group = await groupOf(ctx, a.from);
    if (!(group?.companies.includes(a.to) && a.from !== a.to)) {
      throw new ConvexError("Os dois bares precisam estar no mesmo grupo.");
    }
    const item = await itemInGroup(ctx, a.itemId, a.from);
    if (!(a.qty > 0)) {
      throw new ConvexError("Informe a quantidade.");
    }
    const row = await stockRow(ctx, a.from, a.itemId);
    const cost = row?.avgCost ?? 0;
    const ref = `transfer:${Date.now()}:${a.itemId}`;
    const note = clean(a.note) || undefined;
    await post(ctx, {
      company: a.from,
      itemId: a.itemId,
      kind: "transfer_out",
      qty: -a.qty,
      note: `→ ${a.to}${note ? ` · ${note}` : ""}`,
      ref: `${ref}:out`,
      userName: user.name,
    });
    await post(ctx, {
      company: a.to,
      itemId: a.itemId,
      kind: "transfer_in",
      qty: a.qty,
      unitCost: cost,
      note: `← ${a.from}${note ? ` · ${note}` : ""}`,
      ref: `${ref}:in`,
      userName: user.name,
    });
    await audit(
      ctx,
      user,
      "Transferência",
      `${item.name} ${a.qty} ${a.from} → ${a.to}`,
      a.from
    );
  },
});

/* --------------------------------- counts -------------------------------- */

export const counts = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, READ, company);
    return await ctx.db
      .query("invCounts")
      .withIndex("by_company", (q) => q.eq("company", company))
      .order("desc")
      .take(50);
  },
});

/** A count with its lines (and, while open, what the system expects). */
export const countDetail = query({
  args: { session: v.optional(v.string()), countId: v.id("invCounts") },
  handler: async (ctx, { session, countId }) => {
    const count = await ctx.db.get(countId);
    if (!count) {
      return null;
    }
    await requireStaff(ctx, session, READ, count.company);
    const lines = await ctx.db
      .query("invCountLines")
      .withIndex("by_count", (q) => q.eq("countId", countId))
      .take(5000);
    return { count, lines };
  },
});

async function openCount(ctx: QueryCtx, countId: Id<"invCounts">) {
  const count = await ctx.db.get(countId);
  if (!count) {
    throw new ConvexError("Contagem não encontrada.");
  }
  if (count.status !== "open") {
    throw new ConvexError("Esta contagem já foi fechada.");
  }
  return count;
}

export const startCount = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { session, company, name }) => {
    const user = await requireStaff(ctx, session, "stock", company);
    const all = await ctx.db
      .query("invCounts")
      .withIndex("by_company", (q) => q.eq("company", company))
      .order("desc")
      .take(50);
    const open = all.find((c) => c.status === "open");
    if (open) {
      return open._id;
    }
    const number = (all[0]?.number ?? 0) + 1;
    const now = Date.now();
    const id = await ctx.db.insert("invCounts", {
      company,
      number,
      name: clean(name, 60) || `Contagem ${number}`,
      status: "open",
      startedAt: now,
      startedBy: user.name,
    });
    await audit(ctx, user, "Contagem aberta", `#${number}`, company);
    return id;
  },
});

/** Saves one counted item in one area (each tap saves; many can count). */
export const saveCountLine = mutation({
  args: {
    session: v.optional(v.string()),
    countId: v.id("invCounts"),
    itemId: v.id("invItems"),
    areaId: v.optional(v.id("invAreas")),
    full: v.number(),
    weights: v.array(v.number()),
    loose: v.number(),
  },
  handler: async (ctx, a) => {
    const count = await openCount(ctx, a.countId);
    const user = await requireStaff(ctx, a.session, "stock", count.company);
    const item = await itemInGroup(ctx, a.itemId, count.company);
    const profile: BottleProfile = item;
    let total: { qty: number; estimated: boolean };
    try {
      total = countedQty(
        { full: a.full, weights: a.weights.slice(0, 100), loose: a.loose },
        profile
      );
    } catch (err) {
      throw new ConvexError(
        err instanceof Error && err.message === "NO_PROFILE"
          ? "Pese uma garrafa vazia deste item antes (perfil da garrafa)."
          : "Quantidades inválidas."
      );
    }
    const existing = await ctx.db
      .query("invCountLines")
      .withIndex("by_count_item", (q) =>
        q.eq("countId", a.countId).eq("itemId", a.itemId).eq("areaId", a.areaId)
      )
      .unique();
    const doc = {
      full: r3(a.full),
      weights: a.weights.slice(0, 100).map(r3),
      loose: r3(a.loose),
      qty: total.qty,
      estimated: total.estimated,
      userName: user.name,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("invCountLines", {
        countId: a.countId,
        itemId: a.itemId,
        areaId: a.areaId,
        ...doc,
      });
    }
    return total;
  },
});

export const removeCountLine = mutation({
  args: {
    session: v.optional(v.string()),
    countId: v.id("invCounts"),
    itemId: v.id("invItems"),
    areaId: v.optional(v.id("invAreas")),
  },
  handler: async (ctx, a) => {
    const count = await openCount(ctx, a.countId);
    await requireStaff(ctx, a.session, "stock", count.company);
    const line = await ctx.db
      .query("invCountLines")
      .withIndex("by_count_item", (q) =>
        q.eq("countId", a.countId).eq("itemId", a.itemId).eq("areaId", a.areaId)
      )
      .unique();
    if (line) {
      await ctx.db.delete(line._id);
    }
  },
});

/**
 * Closes a count: every counted item's balance becomes what was counted
 * (all its areas added up), the difference written to the ledger as a
 * "count" movement. Items nobody counted keep their balance.
 */
export const closeCount = mutation({
  args: { session: v.optional(v.string()), countId: v.id("invCounts") },
  handler: async (ctx, { session, countId }) => {
    const count = await openCount(ctx, countId);
    const user = await requireStaff(ctx, session, "stock", count.company);
    const lines = await ctx.db
      .query("invCountLines")
      .withIndex("by_count", (q) => q.eq("countId", countId))
      .take(5000);
    const totals = new Map<Id<"invItems">, number>();
    for (const l of lines) {
      totals.set(l.itemId, r3((totals.get(l.itemId) ?? 0) + l.qty));
    }
    const now = Date.now();
    let value = 0;
    let diffValue = 0;
    for (const [itemId, counted] of totals) {
      const row = await stockRow(ctx, count.company, itemId);
      const diff = r3(counted - (row?.qty ?? 0));
      const cost = row?.avgCost ?? 0;
      value += counted * cost;
      diffValue += diff * cost;
      if (diff !== 0) {
        await post(ctx, {
          company: count.company,
          itemId,
          kind: "count",
          qty: diff,
          ref: `count:${countId}:${itemId}`,
          note: `${count.name} (#${count.number})`,
          userName: user.name,
          at: now,
        });
      }
      const after = await stockRow(ctx, count.company, itemId);
      if (after) {
        await ctx.db.patch(after._id, { lastCountAt: now });
      } else {
        await ctx.db.insert("invStock", {
          company: count.company,
          itemId,
          qty: 0,
          avgCost: 0,
          lastCountAt: now,
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch(countId, {
      status: "closed",
      closedAt: now,
      closedBy: user.name,
      value: Math.round(value * 100) / 100,
      diffValue: Math.round(diffValue * 100) / 100,
    });
    await audit(
      ctx,
      user,
      "Contagem fechada",
      `#${count.number}: ${totals.size} itens`,
      count.company
    );
    return {
      items: totals.size,
      value: Math.round(value * 100) / 100,
      diffValue: Math.round(diffValue * 100) / 100,
    };
  },
});

export const deleteCount = mutation({
  args: { session: v.optional(v.string()), countId: v.id("invCounts") },
  handler: async (ctx, { session, countId }) => {
    const count = await openCount(ctx, countId);
    const user = await requireStaff(ctx, session, "stock", count.company);
    const lines = await ctx.db
      .query("invCountLines")
      .withIndex("by_count", (q) => q.eq("countId", countId))
      .take(5000);
    for (const l of lines) {
      await ctx.db.delete(l._id);
    }
    await ctx.db.delete(countId);
    await audit(
      ctx,
      user,
      "Contagem apagada",
      `#${count.number}`,
      count.company
    );
  },
});

/**
 * Admin import (run from the CLI): creates the bar's stock items by name,
 * or fixes an existing one's unit, size, container and category — only
 * while it has no movement, so a balance is never reinterpreted.
 */
export const upsertItems = internalMutation({
  args: {
    company: v.string(),
    items: v.array(
      v.object({
        name: v.string(),
        category: v.string(),
        unit: invUnit,
        size: v.number(),
        container: v.string(),
        note: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { company, items }) => {
    const group = await groupKey(ctx, company);
    const out = { created: 0, updated: 0, same: 0, locked: [] as string[] };
    for (const a of items.slice(0, 500)) {
      const name = clean(a.name);
      const size =
        a.unit === "un" ? Math.max(1, Math.round(a.size)) : r3(a.size);
      if (!(name && size > 0)) {
        continue;
      }
      const fields = {
        category: clean(a.category, 40) || "other",
        unit: a.unit,
        size,
        container: clean(a.container, 40) || "un",
      };
      const cur = await ctx.db
        .query("invItems")
        .withIndex("by_group", (q) => q.eq("group", group).eq("name", name))
        .first();
      const now = Date.now();
      if (!cur) {
        await ctx.db.insert("invItems", {
          group,
          name,
          ...fields,
          barcodes: [],
          note: a.note,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        out.created++;
        continue;
      }
      const same =
        cur.active &&
        cur.category === fields.category &&
        cur.unit === fields.unit &&
        cur.size === fields.size &&
        cur.container === fields.container;
      if (same) {
        out.same++;
        continue;
      }
      const moved = await ctx.db
        .query("invMoves")
        .withIndex("by_item", (q) => q.eq("itemId", cur._id))
        .first();
      if (moved && (cur.unit !== fields.unit || cur.size !== fields.size)) {
        out.locked.push(name);
        await ctx.db.patch(cur._id, {
          category: fields.category,
          container: fields.container,
          active: true,
          updatedAt: now,
        });
        continue;
      }
      await ctx.db.patch(cur._id, { ...fields, active: true, updatedAt: now });
      out.updated++;
    }
    await audit(
      ctx,
      null,
      "Itens do bar importados",
      `${out.created} novos, ${out.updated} corrigidos`,
      company
    );
    return out;
  },
});

/**
 * Admin (CLI): adds a code to the bar's stock item with that name. A code
 * already on another item is reported and left where it is.
 */
export const addBarcodes = internalMutation({
  args: {
    company: v.string(),
    rows: v.array(v.object({ name: v.string(), code: v.string() })),
  },
  handler: async (ctx, { company, rows }) => {
    const group = await groupKey(ctx, company);
    const out = {
      added: 0,
      had: 0,
      noItem: [] as string[],
      taken: [] as string[],
    };
    for (const r of rows.slice(0, 500)) {
      const name = clean(r.name);
      const code = r.code.trim().slice(0, 40);
      const item = await ctx.db
        .query("invItems")
        .withIndex("by_group", (q) => q.eq("group", group).eq("name", name))
        .first();
      if (!(item && code)) {
        out.noItem.push(name);
        continue;
      }
      if (item.barcodes.includes(code)) {
        out.had++;
        continue;
      }
      const other = await ctx.db
        .query("invBarcodes")
        .withIndex("by_code", (q) => q.eq("group", group).eq("code", code))
        .first();
      if (other && other.itemId !== item._id) {
        out.taken.push(`${name}: ${code}`);
        continue;
      }
      const codes = await setBarcodes(ctx, group, item._id, [
        ...item.barcodes,
        code,
      ]);
      await ctx.db.patch(item._id, { barcodes: codes, updatedAt: Date.now() });
      out.added++;
    }
    await audit(
      ctx,
      null,
      "Códigos copiados para o estoque",
      `${out.added} códigos`,
      company
    );
    return out;
  },
});

/** Admin (CLI): copies codes both ways between same-name products and items of a bar. */
export const syncCodes = internalMutation({
  args: { company: v.string() },
  handler: async (ctx, { company }) => {
    const group = await groupKey(ctx, company);
    const products = await ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(3000);
    for (const p of products) {
      await codeToItem(ctx, company, p.name, p.barcode);
    }
    const items = await ctx.db
      .query("invItems")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(5000);
    for (const i of items) {
      if (i.active && i.barcodes.length) {
        await codesToProducts(ctx, company, i.name, i.barcodes);
      }
    }
    return { products: products.length, items: items.length };
  },
});

/* -------------------------------- pending -------------------------------- */

const BOTTLES = new Set([
  "spirits",
  "liqueur",
  "wine",
  "sparkling",
  "beer",
  "soft",
  "mixer",
]);
const LIST = 40;

/**
 * What still needs someone in this bar, for the Gestão panel: products on
 * sale for nothing or without a price, cocktails with no technical sheet,
 * bottles without a barcode, stock under its minimum and invoices waiting.
 */
export const pending = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, READ, company);
    const key = await groupKey(ctx, company);
    const [products, items, stock, prices, invoices] = await Promise.all([
      ctx.db
        .query("posProducts")
        .withIndex("by_company", (q) => q.eq("company", company))
        .take(3000),
      ctx.db
        .query("invItems")
        .withIndex("by_group", (q) => q.eq("group", key))
        .take(MAX_ITEMS),
      ctx.db
        .query("invStock")
        .withIndex("by_company", (q) => q.eq("company", company))
        .take(MAX_ITEMS),
      ctx.db
        .query("invRecipePrices")
        .withIndex("by_company", (q) => q.eq("company", company))
        .take(3000),
      ctx.db
        .query("invInvoices")
        .withIndex("by_company", (q) => q.eq("company", company))
        .order("desc")
        .take(200),
    ]);
    const product = (p: Doc<"posProducts">) => ({
      id: p.cid,
      name: p.name,
      category: p.category,
    });
    const linked = new Set(prices.map((r) => r.productId).filter(Boolean));
    const byItem = new Map(stock.map((s) => [s.itemId as string, s]));
    const active = items.filter((i) => i.active);
    const free = products.filter((p) => p.available && !(p.price > 0));
    const noPrice = products.filter((p) => !p.available && !(p.price > 0));
    const noSheet = products.filter(
      (p) => /cocktail/i.test(p.category) && !linked.has(p.cid)
    );
    const noCode = active.filter(
      (i) => BOTTLES.has(i.category) && !i.barcodes.length
    );
    const low = active
      .map((i) => ({ i, s: byItem.get(i._id) }))
      .filter(({ s }) => s?.min !== undefined && s.qty < s.min)
      .map(({ i, s }) => ({
        id: i._id,
        name: i.name,
        qty: s?.qty ?? 0,
        min: s?.min ?? 0,
        unit: i.unit,
        size: i.size,
        container: i.container,
      }));
    const review = invoices.filter((x) => x.status === "review");
    const neverCounted = active.filter(
      (i) => byItem.get(i._id)?.lastCountAt === undefined
    ).length;
    return {
      free: { count: free.length, list: free.slice(0, LIST).map(product) },
      noPrice: {
        count: noPrice.length,
        list: noPrice.slice(0, LIST).map(product),
      },
      noSheet: {
        count: noSheet.length,
        list: noSheet.slice(0, LIST).map(product),
      },
      noCode: {
        count: noCode.length,
        list: noCode
          .slice(0, LIST)
          .map((i) => ({ id: i._id, name: i.name, category: i.category })),
      },
      low: { count: low.length, list: low.slice(0, LIST) },
      invoices: {
        count: review.length,
        list: review.slice(0, LIST).map((x) => ({
          id: x._id,
          supplier: x.supplierName,
          number: x.number,
          total: x.total,
          date: x.date,
        })),
      },
      totals: {
        products: products.length,
        items: active.length,
        sheets: linked.size,
        neverCounted,
      },
    };
  },
});

/** Admin fill: country and alcohol for many bottles by name (whole group). */
export const fillOrigin = internalMutation({
  args: {
    company: v.string(),
    rows: v.array(
      v.object({
        name: v.string(),
        country: v.optional(v.string()),
        abv: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, { company, rows }) => {
    for (const r of rows) {
      await originToTwins(ctx, company, r.name, {
        ...(r.country ? { country: r.country } : {}),
        ...(r.abv !== undefined && r.abv > 0 && r.abv <= 100
          ? { abv: r.abv }
          : {}),
      });
    }
    return rows.length;
  },
});
