import { ConvexError, v } from "convex/values";
import { dayKey, reorder, transferSuggestion } from "../lib/inventory/reorder";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { audit, type Perm, requireStaff } from "./access";
import { groupOf } from "./inv";

/**
 * Purchasing: what each bar should order, from whom, and what another bar
 * of the group can send instead. Usage per day comes from invUsageDaily
 * (sales and waste, kept by the ledger); the pack and expected cost from
 * what each supplier's approved invoices taught (invSupplierItems).
 * Orders go draft → sent → received; an approved invoice of the supplier
 * receives its open order (the stock itself comes in by the invoice).
 */

const READ: Perm[] = ["stock", "reports"];
const DEFAULT_COVER = 7;
const USAGE_DAYS = 28;

const clean = (s: string | undefined, max = 200) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

type Pack = { supplierId: Id<"invSuppliers">; perUnit: number; lastCost: number };

/** Stock, usage and what is on order of one bar, per item. */
async function barState(ctx: QueryCtx, company: string, days: number) {
  const since = dayKey(Date.now() - days * 86_400_000);
  const [stock, usage, orders] = await Promise.all([
    ctx.db
      .query("invStock")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(2000),
    ctx.db
      .query("invUsageDaily")
      .withIndex("by_company_day", (q) => q.eq("company", company).gt("day", since))
      .take(20_000),
    ctx.db
      .query("invOrders")
      .withIndex("by_company", (q) => q.eq("company", company))
      .order("desc")
      .take(200),
  ]);
  const used = new Map<string, number>();
  for (const u of usage) {
    used.set(u.itemId, (used.get(u.itemId) ?? 0) + u.qty);
  }
  const onOrder = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "draft" || o.status === "sent") {
      for (const l of o.lines) {
        onOrder.set(l.itemId, (onOrder.get(l.itemId) ?? 0) + l.packs * l.perUnit);
      }
    }
  }
  return {
    stock: new Map(stock.map((s) => [s.itemId as string, s])),
    perDay: (id: string) => Math.max(0, (used.get(id) ?? 0) / days),
    onOrder: (id: string) => onOrder.get(id) ?? 0,
  };
}

/** The supplier each item was last bought from, with its pack and cost. */
async function packOf(ctx: QueryCtx, itemId: Id<"invItems">): Promise<Pack | null> {
  const last = await ctx.db
    .query("invSupplierItems")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .order("desc")
    .first();
  return last ? { supplierId: last.supplierId, perUnit: last.perUnit, lastCost: last.lastCost } : null;
}

/**
 * What this bar should order now, grouped by supplier, and what the other
 * bars of the group could send it instead.
 */
export const suggestions = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const user = await requireStaff(ctx, session, READ, company);
    const group = await groupOf(ctx, company);
    const key = group?.key ?? company;
    const items = (
      await ctx.db
        .query("invItems")
        .withIndex("by_group", (q) => q.eq("group", key))
        .take(2000)
    ).filter((i) => i.active);
    const suppliers = await ctx.db
      .query("invSuppliers")
      .withIndex("by_group", (q) => q.eq("group", key))
      .take(500);
    const supplierById = new Map(suppliers.map((s) => [s._id as string, s]));
    const here = await barState(ctx, company, USAGE_DAYS);
    const others = await Promise.all(
      (group?.companies ?? [])
        .filter((c) => c !== company)
        .map(async (c) => ({ company: c, state: await barState(ctx, c, USAGE_DAYS) }))
    );
    const seeCosts = ["users", "stock", "reports"].some((p) => user.perms.includes(p));

    type Line = {
      itemId: Id<"invItems">;
      name: string;
      unit: Doc<"invItems">["unit"];
      size: number;
      container: string;
      onHand: number;
      onOrder: number;
      perDay: number;
      daysLeft: number | null;
      target: number;
      packs: number;
      perUnit: number;
      packCost: number | null;
    };
    const bySupplier = new Map<string, Line[]>();
    const transfers: {
      itemId: Id<"invItems">;
      name: string;
      from: string;
      qty: number;
      unit: Doc<"invItems">["unit"];
      size: number;
      container: string;
    }[] = [];

    for (const item of items) {
      const st = here.stock.get(item._id);
      const pack = await packOf(ctx, item._id);
      const supplier = pack ? supplierById.get(pack.supplierId) : undefined;
      const cover = supplier?.coverDays ?? DEFAULT_COVER;
      const perUnit = pack?.perUnit && pack.perUnit > 0 ? pack.perUnit : item.size;
      const r = reorder({
        onHand: st?.qty ?? 0,
        onOrder: here.onOrder(item._id),
        perDay: here.perDay(item._id),
        coverDays: cover,
        min: st?.min,
        par: st?.par,
        pack: perUnit,
      });
      if (!r.packs) {
        continue;
      }
      // Another bar with more than it needs can send it first
      for (const o of others) {
        const os = o.state.stock.get(item._id);
        const theirs = reorder({
          onHand: os?.qty ?? 0,
          onOrder: 0,
          perDay: o.state.perDay(item._id),
          coverDays: cover,
          min: os?.min,
          par: os?.par,
          pack: perUnit,
        });
        const qty = transferSuggestion(
          { onHand: os?.qty ?? 0, target: theirs.target },
          { onHand: st?.qty ?? 0, target: r.target, onOrder: here.onOrder(item._id) },
          item.unit === "un" ? 1 : item.size
        );
        if (qty > 0) {
          transfers.push({ itemId: item._id, name: item.name, from: o.company, qty, unit: item.unit, size: item.size, container: item.container });
        }
      }
      const line: Line = {
        itemId: item._id,
        name: item.name,
        unit: item.unit,
        size: item.size,
        container: item.container,
        onHand: st?.qty ?? 0,
        onOrder: here.onOrder(item._id),
        perDay: r3(here.perDay(item._id)),
        daysLeft: r.daysLeft,
        target: r.target,
        packs: r.packs,
        perUnit,
        packCost: seeCosts && pack ? Math.round(pack.lastCost * perUnit * 100) / 100 : null,
      };
      const k = supplier?._id ?? "";
      bySupplier.set(k, [...(bySupplier.get(k) ?? []), line]);
    }
    return {
      usageDays: USAGE_DAYS,
      groups: [...bySupplier].map(([id, lines]) => {
        const s = id ? supplierById.get(id) : undefined;
        return {
          supplierId: (s?._id ?? null) as Id<"invSuppliers"> | null,
          supplier: s?.name ?? null,
          coverDays: s?.coverDays ?? DEFAULT_COVER,
          lines: lines.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
        };
      }),
      transfers,
    };
  },
});

/* -------------------------------- suppliers ------------------------------- */

export const suppliers = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, READ, company);
    const key = (await groupOf(ctx, company))?.key ?? company;
    const rows = await ctx.db
      .query("invSuppliers")
      .withIndex("by_group", (q) => q.eq("group", key))
      .take(500);
    return rows.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const saveSupplier = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.optional(v.id("invSuppliers")),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    coverDays: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requireStaff(ctx, a.session, "stock", a.company);
    const key = (await groupOf(ctx, a.company))?.key ?? a.company;
    const name = clean(a.name, 80);
    if (!name) {
      throw new ConvexError("Dê um nome ao fornecedor.");
    }
    const fields = {
      name,
      email: clean(a.email, 120) || undefined,
      phone: clean(a.phone, 40) || undefined,
      coverDays:
        a.coverDays !== undefined && a.coverDays >= 1 && a.coverDays <= 90 ? Math.round(a.coverDays) : undefined,
      note: clean(a.note, 300) || undefined,
    };
    if (a.id) {
      const s = await ctx.db.get(a.id);
      if (s?.group !== key) {
        throw new ConvexError("Fornecedor não encontrado.");
      }
      await ctx.db.patch(a.id, fields);
      return a.id;
    }
    const norm = name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return await ctx.db.insert("invSuppliers", {
      group: key,
      key: norm,
      ...fields,
      active: true,
      createdAt: Date.now(),
    });
  },
});

/* --------------------------------- orders -------------------------------- */

const orderLine = v.object({
  itemId: v.id("invItems"),
  packs: v.number(),
  perUnit: v.number(),
  packCost: v.number(),
});

async function checkLines(ctx: QueryCtx, company: string, lines: Doc<"invOrders">["lines"]) {
  const key = (await groupOf(ctx, company))?.key ?? company;
  const out: Doc<"invOrders">["lines"] = [];
  for (const l of lines.slice(0, 200)) {
    const item = await ctx.db.get(l.itemId);
    if (item?.group !== key) {
      throw new ConvexError("Item não encontrado.");
    }
    if (!(l.packs > 0 && l.perUnit > 0)) {
      continue;
    }
    out.push({ itemId: l.itemId, packs: r3(l.packs), perUnit: r3(l.perUnit), packCost: Math.max(0, l.packCost) });
  }
  if (!out.length) {
    throw new ConvexError("O pedido está vazio.");
  }
  return out;
}

export const orders = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, READ, company);
    return await ctx.db
      .query("invOrders")
      .withIndex("by_company", (q) => q.eq("company", company))
      .order("desc")
      .take(100);
  },
});

export const createOrder = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    supplierId: v.id("invSuppliers"),
    lines: v.array(orderLine),
    note: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, "stock", a.company);
    const supplier = await ctx.db.get(a.supplierId);
    const key = (await groupOf(ctx, a.company))?.key ?? a.company;
    if (supplier?.group !== key) {
      throw new ConvexError("Fornecedor não encontrado.");
    }
    const lines = await checkLines(ctx, a.company, a.lines);
    const last = await ctx.db
      .query("invOrders")
      .withIndex("by_company", (q) => q.eq("company", a.company))
      .order("desc")
      .first();
    const id = await ctx.db.insert("invOrders", {
      company: a.company,
      number: (last?.number ?? 0) + 1,
      supplierId: supplier._id,
      supplierName: supplier.name,
      status: "draft",
      lines,
      note: clean(a.note, 500) || undefined,
      deliveryDate: a.deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(a.deliveryDate) ? a.deliveryDate : undefined,
      createdAt: Date.now(),
      createdBy: user.name,
    });
    await audit(ctx, user, "Pedido de compra criado", `${supplier.name}: ${lines.length} itens`, a.company);
    return id;
  },
});

export const updateOrder = mutation({
  args: {
    session: v.optional(v.string()),
    id: v.id("invOrders"),
    lines: v.array(orderLine),
    note: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const order = await ctx.db.get(a.id);
    if (!order) {
      throw new ConvexError("Pedido não encontrado.");
    }
    await requireStaff(ctx, a.session, "stock", order.company);
    if (order.status !== "draft") {
      throw new ConvexError("Só rascunhos podem ser editados.");
    }
    await ctx.db.patch(a.id, {
      lines: await checkLines(ctx, order.company, a.lines),
      note: clean(a.note, 500) || undefined,
      deliveryDate: a.deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(a.deliveryDate) ? a.deliveryDate : undefined,
    });
  },
});

/** sent (it went to the supplier), received (by hand) or cancelled. */
export const setOrderStatus = mutation({
  args: {
    session: v.optional(v.string()),
    id: v.id("invOrders"),
    status: v.union(v.literal("sent"), v.literal("received"), v.literal("cancelled")),
  },
  handler: async (ctx, { session, id, status }) => {
    const order = await ctx.db.get(id);
    if (!order) {
      throw new ConvexError("Pedido não encontrado.");
    }
    const user = await requireStaff(ctx, session, "stock", order.company);
    const allowed: Record<string, string[]> = {
      draft: ["sent", "cancelled"],
      sent: ["received", "cancelled"],
      received: [],
      cancelled: [],
    };
    if (!allowed[order.status]?.includes(status)) {
      throw new ConvexError("Este pedido não pode mudar para esse estado.");
    }
    const now = Date.now();
    await ctx.db.patch(id, {
      status,
      ...(status === "sent" ? { sentAt: now } : {}),
      ...(status === "received" ? { receivedAt: now } : {}),
    });
    await audit(ctx, user, `Pedido ${status}`, `#${order.number} ${order.supplierName}`, order.company);
  },
});
