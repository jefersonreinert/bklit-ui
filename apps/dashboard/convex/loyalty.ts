import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { audit, MAIN, newToken, requireStaff } from "./access";

/**
 * Guest book and loyalty (like Lightspeed Loyalty: VIP, punch and gift
 * cards), shared by every business of the group:
 * - customers with their card code, VIP discount, stamps and history;
 * - punch cards per business ("the 10th coffee is free");
 * - gift cards with a balance: sold and topped up as order lines that
 *   activate when the order is paid, spent as a discount line that is
 *   taken from the balance when the order is paid.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const DIGITS = /\D/g;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Order lines made by this module (negative = discount). */
export const LINE = {
  vip: "vip:",
  reward: "reward:",
  gift: "gift:",
  giftSale: "gift-sale:",
  giftTopup: "gift-topup:",
} as const;

export const normalizePhone = (raw: string | undefined) => {
  const d = (raw ?? "").replace(DIGITS, "");
  return d.length >= 6 ? d : undefined;
};

function newCode(size = 8) {
  const raw = newToken();
  let out = "";
  for (let i = 0; i < size; i++) {
    out +=
      CODE_CHARS[
        Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16) % CODE_CHARS.length
      ];
  }
  return out;
}

const CARD_PREFIX = /^CB-(CUST|GIFT):/;
const NOT_CODE = /[^A-Z0-9]/g;
const cleanCode = (raw: string) =>
  raw.trim().toUpperCase().replace(CARD_PREFIX, "").replace(NOT_CODE, "");

async function order(ctx: QueryCtx, orderId: string) {
  const o = await ctx.db
    .query("posOrders")
    .withIndex("by_cid", (q) => q.eq("cid", orderId))
    .unique();
  if (!o || o.status === "paid" || o.status === "void") {
    throw new ConvexError("Pedido não encontrado ou já fechado.");
  }
  return o;
}

/** Sum of the real items (no discounts, no gift card sales). */
const goods = (items: Doc<"posOrders">["items"]) =>
  items
    .filter(
      (i) =>
        i.price > 0 &&
        !i.id.startsWith(LINE.giftSale) &&
        !i.id.startsWith(LINE.giftTopup)
    )
    .reduce((s, i) => s + i.price * i.qty, 0);

const publicCustomer = ({ _creationTime, ...c }: Doc<"posCustomers">) => ({
  ...c,
  id: c._id,
});

/* -------------------------------- customers ------------------------------ */

export const searchCustomers = query({
  args: { session: v.optional(v.string()), q: v.string() },
  handler: async (ctx, { session, q }) => {
    await requireStaff(ctx, session, ["orders", "charge"]);
    const text = q.trim();
    if (!text) {
      const recent = await ctx.db
        .query("posCustomers")
        .withIndex("by_lastVisit")
        .order("desc")
        .take(30);
      return recent.map(publicCustomer);
    }
    const found = new Map<string, Doc<"posCustomers">>();
    const code = cleanCode(text);
    if (code.length === 8) {
      const byCode = await ctx.db
        .query("posCustomers")
        .withIndex("by_code", (x) => x.eq("code", code))
        .unique();
      if (byCode) {
        found.set(byCode._id, byCode);
      }
    }
    const phone = normalizePhone(text);
    if (phone) {
      for (const c of await ctx.db
        .query("posCustomers")
        .withIndex("by_phone", (x) => x.eq("phone", phone))
        .take(5)) {
        found.set(c._id, c);
      }
    }
    if (text.includes("@")) {
      for (const c of await ctx.db
        .query("posCustomers")
        .withIndex("by_email", (x) => x.eq("email", text.toLowerCase()))
        .take(5)) {
        found.set(c._id, c);
      }
    }
    for (const c of await ctx.db
      .query("posCustomers")
      .withSearchIndex("search_name", (x) => x.search("name", text))
      .take(20)) {
      found.set(c._id, c);
    }
    return [...found.values()].map(publicCustomer);
  },
});

/** A customer with the last orders and their stamps per program. */
export const customer = query({
  args: { session: v.optional(v.string()), id: v.id("posCustomers") },
  handler: async (ctx, { session, id }) => {
    await requireStaff(ctx, session, ["orders", "charge"]);
    const c = await ctx.db.get(id);
    if (!c) {
      return null;
    }
    const orders = await ctx.db
      .query("posOrders")
      .withIndex("by_customer", (q) => q.eq("customerId", id))
      .order("desc")
      .take(20);
    const programs = await Promise.all(
      c.stamps.map(async (s) => {
        const p = await ctx.db.get(s.programId as Id<"posPunchPrograms">);
        return p
          ? {
              programId: s.programId,
              name: p.name,
              count: s.count,
              stamps: p.stamps,
              company: p.company,
            }
          : null;
      })
    );
    const gifts = await ctx.db
      .query("posGiftCards")
      .filter((q) => q.eq(q.field("customerId"), id))
      .take(20);
    return {
      ...publicCustomer(c),
      programs: programs.filter((p) => p !== null),
      gifts: gifts
        .filter((g) => g.active)
        .map((g) => ({ code: g.code, balance: g.balance, label: g.label })),
      orders: orders
        .filter((o) => o.status === "paid")
        .map((o) => ({
          id: o.cid,
          number: o.number,
          company: o.company ?? MAIN,
          closedAt: o.closedAt,
          total: r2(o.items.reduce((s, i) => s + i.price * i.qty, 0)),
          items: o.items
            .filter((i) => i.price > 0)
            .map((i) => `${i.qty}× ${i.name}`)
            .slice(0, 8),
        })),
    };
  },
});

export const saveCustomer = mutation({
  args: {
    session: v.string(),
    id: v.optional(v.id("posCustomers")),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    birthday: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    vip: v.optional(v.number()),
    optIn: v.optional(v.boolean()),
  },
  handler: async (ctx, { session, id, ...f }) => {
    const user = await requireStaff(ctx, session, ["orders", "charge"]);
    const name = f.name.trim().slice(0, 120);
    if (!name) {
      throw new ConvexError("Informe o nome do cliente.");
    }
    const vip = Math.max(0, Math.min(100, f.vip ?? 0));
    // Only managers decide VIP discounts
    if (vip > 0) {
      await requireStaff(ctx, session, ["settings", "reports"]);
    }
    const clean = {
      name,
      phone: normalizePhone(f.phone),
      email: f.email?.trim().toLowerCase().slice(0, 120) || undefined,
      birthday: f.birthday?.trim().slice(0, 10) || undefined,
      notes: f.notes?.trim().slice(0, 2000) || undefined,
      tags: (f.tags ?? [])
        .map((t) => t.trim().slice(0, 30))
        .filter(Boolean)
        .slice(0, 10),
      vip,
      optIn: f.optIn ?? false,
    };
    if (clean.phone) {
      const same = await ctx.db
        .query("posCustomers")
        .withIndex("by_phone", (q) => q.eq("phone", clean.phone))
        .first();
      if (same && same._id !== id) {
        throw new ConvexError(
          `Já existe um cliente com esse telefone: ${same.name}.`
        );
      }
    }
    if (id) {
      const cur = await ctx.db.get(id);
      if (!cur) {
        throw new ConvexError("Cliente não encontrado.");
      }
      await ctx.db.patch(id, clean);
      return id;
    }
    let code = newCode();
    while (
      await ctx.db
        .query("posCustomers")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first()
    ) {
      code = newCode();
    }
    const created = await ctx.db.insert("posCustomers", {
      ...clean,
      code,
      stamps: [],
      visits: 0,
      spent: 0,
      createdAt: Date.now(),
      createdBy: user.name,
    });
    await audit(ctx, user, "Cadastrou cliente", name);
    return created;
  },
});

/** Erases a customer (right to be forgotten); orders keep only the name. */
export const deleteCustomer = mutation({
  args: { session: v.string(), id: v.id("posCustomers") },
  handler: async (ctx, { session, id }) => {
    const user = await requireStaff(ctx, session, ["settings", "reports"]);
    const c = await ctx.db.get(id);
    if (!c) {
      return;
    }
    const orders = await ctx.db
      .query("posOrders")
      .withIndex("by_customer", (q) => q.eq("customerId", id))
      .take(1000);
    for (const o of orders) {
      await ctx.db.patch(o._id, { customerId: undefined });
    }
    await ctx.db.delete(id);
    await audit(ctx, user, "Apagou cliente", c.name);
  },
});

/** VIP line for the order's current items (replaces the old one). */
function withVip(
  items: Doc<"posOrders">["items"],
  c: Doc<"posCustomers"> | null
) {
  const rest = items.filter((i) => !i.id.startsWith(LINE.vip));
  if (!c?.vip) {
    return rest;
  }
  const off = r2((goods(rest) * c.vip) / 100);
  if (off <= 0) {
    return rest;
  }
  return [
    ...rest,
    {
      id: `${LINE.vip}${c._id}`,
      productId: null,
      name: `Desconto VIP ${c.vip}% · ${c.name}`,
      price: -off,
      qty: 1,
      sent: true,
    },
  ];
}

/**
 * Links a customer to an order (or unlinks with null) and refreshes the
 * VIP discount on the current items. Call again before charging.
 */
export const attachCustomer = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    customerId: v.union(v.id("posCustomers"), v.null()),
  },
  handler: async (ctx, { session, orderId, customerId }) => {
    await requireStaff(ctx, session, ["orders", "charge"]);
    const o = await order(ctx, orderId);
    const c = customerId ? await ctx.db.get(customerId) : null;
    if (customerId && !c) {
      throw new ConvexError("Cliente não encontrado.");
    }
    await ctx.db.patch(o._id, {
      customerId: c?._id,
      customerName: c?.name,
      items: withVip(o.items, c),
      updatedAt: Date.now(),
    });
    return c ? { name: c.name, vip: c.vip } : null;
  },
});

/* ------------------------------ punch cards ------------------------------ */

export const programs = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["orders", "charge", "settings"], company);
    const list = await ctx.db
      .query("posPunchPrograms")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(50);
    return list.map(({ _id, _creationTime, ...p }) => ({ id: _id, ...p }));
  },
});

export const saveProgram = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    id: v.optional(v.id("posPunchPrograms")),
    name: v.string(),
    categories: v.array(v.string()),
    productIds: v.array(v.string()),
    stamps: v.number(),
    reward: v.union(v.literal("free"), v.literal("amount")),
    rewardValue: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, { session, company, id, ...f }) => {
    const user = await requireStaff(ctx, session, "settings", company);
    const name = f.name.trim().slice(0, 80);
    if (!(name && f.stamps >= 2 && f.stamps <= 50)) {
      throw new ConvexError("Informe o nome e de 2 a 50 selos.");
    }
    if (!(f.categories.length || f.productIds.length)) {
      throw new ConvexError(
        "Escolha as categorias ou produtos que valem selo."
      );
    }
    const fields = {
      name,
      categories: f.categories.slice(0, 30),
      productIds: f.productIds.slice(0, 100),
      stamps: Math.round(f.stamps),
      reward: f.reward,
      rewardValue: Math.max(0, r2(f.rewardValue)),
      active: f.active,
    };
    if (id) {
      const cur = await ctx.db.get(id);
      if (!cur || cur.company !== company) {
        throw new ConvexError("Programa não encontrado.");
      }
      await ctx.db.patch(id, fields);
      return id;
    }
    const created = await ctx.db.insert("posPunchPrograms", {
      company,
      ...fields,
      createdAt: Date.now(),
    });
    await audit(ctx, user, "Criou cartão de selos", name, company);
    return created;
  },
});

async function qualifies(
  ctx: QueryCtx,
  program: Doc<"posPunchPrograms">,
  items: Doc<"posOrders">["items"]
) {
  const cats = new Set(program.categories);
  const ids = new Set(program.productIds);
  const out: { price: number; qty: number }[] = [];
  for (const i of items) {
    if (!(i.productId && i.price > 0)) {
      continue;
    }
    let ok = ids.has(i.productId);
    if (!ok && cats.size) {
      const p = await ctx.db
        .query("posProducts")
        .withIndex("by_cid", (q) => q.eq("cid", i.productId as string))
        .unique();
      ok = Boolean(p && cats.has(p.category));
    }
    if (ok) {
      out.push({ price: i.price, qty: i.qty });
    }
  }
  return out;
}

/** Uses a full punch card on this order (the stamps are taken when paid). */
export const redeemReward = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    programId: v.id("posPunchPrograms"),
  },
  handler: async (ctx, { session, orderId, programId }) => {
    await requireStaff(ctx, session, ["orders", "charge"]);
    const o = await order(ctx, orderId);
    if (!o.customerId) {
      throw new ConvexError("Escolha o cliente do pedido primeiro.");
    }
    const c = await ctx.db.get(o.customerId);
    const program = await ctx.db.get(programId);
    if (!(c && program?.active)) {
      throw new ConvexError("Cartão de selos não encontrado.");
    }
    const have = c.stamps.find((s) => s.programId === programId)?.count ?? 0;
    if (have < program.stamps) {
      throw new ConvexError(`Faltam ${program.stamps - have} selos.`);
    }
    const id = `${LINE.reward}${programId}`;
    if (o.items.some((i) => i.id === id)) {
      throw new ConvexError("O prêmio já está neste pedido.");
    }
    let off = program.rewardValue;
    if (program.reward === "free") {
      const items = await qualifies(ctx, program, o.items);
      if (!items.length) {
        throw new ConvexError("Adicione ao pedido um item do cartão de selos.");
      }
      off = Math.min(...items.map((i) => i.price));
    }
    off = r2(Math.min(off, goods(o.items)));
    await ctx.db.patch(o._id, {
      items: [
        ...o.items,
        {
          id,
          productId: null,
          name: `Prêmio ${program.name}`,
          price: -off,
          qty: 1,
          sent: true,
        },
      ],
      updatedAt: Date.now(),
    });
    return off;
  },
});

/* ------------------------------- gift cards ------------------------------ */

const giftProblem = (g: Doc<"posGiftCards"> | null, now: number) => {
  if (!g) {
    return "Gift card não encontrado.";
  }
  if (!g.active) {
    return "Gift card ainda não ativado (o pedido da venda não foi pago).";
  }
  if (g.expiresAt && g.expiresAt < now) {
    return "Gift card vencido.";
  }
  if (g.balance <= 0) {
    return "Gift card sem saldo.";
  }
  return null;
};

export const giftCards = query({
  args: { session: v.optional(v.string()) },
  handler: async (ctx, { session }) => {
    await requireStaff(ctx, session, ["charge", "settings"]);
    const list = await ctx.db.query("posGiftCards").order("desc").take(200);
    return list.map(({ _id, _creationTime, ...g }) => ({ id: _id, ...g }));
  },
});

export const giftLookup = query({
  args: { session: v.optional(v.string()), code: v.string() },
  handler: async (ctx, { session, code }) => {
    await requireStaff(ctx, session, ["orders", "charge"]);
    const g = await ctx.db
      .query("posGiftCards")
      .withIndex("by_code", (q) => q.eq("code", cleanCode(code)))
      .unique();
    if (!g) {
      return null;
    }
    return {
      code: g.code,
      label: g.label,
      balance: g.balance,
      active: g.active,
      expiresAt: g.expiresAt,
      problem: giftProblem(g, Date.now()),
    };
  },
});

/** Sells a new gift card on an order (active once the order is paid). */
export const sellGiftCard = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    amount: v.number(),
    label: v.optional(v.string()),
    months: v.optional(v.number()),
  },
  handler: async (ctx, { session, orderId, amount, label, months }) => {
    const user = await requireStaff(ctx, session, "charge");
    const o = await order(ctx, orderId);
    const value = r2(amount);
    if (!(value > 0 && value <= 5000)) {
      throw new ConvexError("Valor entre 0,01 e 5000.");
    }
    let code = newCode(10);
    while (
      await ctx.db
        .query("posGiftCards")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first()
    ) {
      code = newCode(10);
    }
    const now = Date.now();
    const valid = Math.max(0, Math.min(60, Math.round(months ?? 24)));
    await ctx.db.insert("posGiftCards", {
      code,
      label: label?.trim().slice(0, 60) || "Gift card",
      initial: value,
      balance: value,
      active: false,
      customerId: o.customerId,
      expiresAt: valid ? now + valid * 30 * 86_400_000 : 0,
      createdAt: now,
      createdBy: user.name,
      history: [],
    });
    await ctx.db.patch(o._id, {
      items: [
        ...o.items,
        {
          id: `${LINE.giftSale}${code}`,
          productId: null,
          name: `Gift card ${code}`,
          price: value,
          qty: 1,
          sent: true,
        },
      ],
      updatedAt: now,
    });
    return code;
  },
});

/** Tops up a gift card on an order (added once the order is paid). */
export const topUpGiftCard = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    code: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, { session, orderId, code, amount }) => {
    await requireStaff(ctx, session, "charge");
    const o = await order(ctx, orderId);
    const g = await ctx.db
      .query("posGiftCards")
      .withIndex("by_code", (q) => q.eq("code", cleanCode(code)))
      .unique();
    if (!g?.active) {
      throw new ConvexError("Gift card não encontrado.");
    }
    const value = r2(amount);
    if (!(value > 0 && value <= 5000)) {
      throw new ConvexError("Valor entre 0,01 e 5000.");
    }
    const id = `${LINE.giftTopup}${g.code}`;
    if (o.items.some((i) => i.id === id)) {
      throw new ConvexError("Este gift card já tem recarga neste pedido.");
    }
    await ctx.db.patch(o._id, {
      items: [
        ...o.items,
        {
          id,
          productId: null,
          name: `Recarga gift card ${g.code}`,
          price: value,
          qty: 1,
          sent: true,
        },
      ],
      updatedAt: Date.now(),
    });
  },
});

/** Pays part of an order with a gift card (taken from it when paid). */
export const redeemGiftCard = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    code: v.string(),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, { session, orderId, code, amount }) => {
    await requireStaff(ctx, session, "charge");
    const o = await order(ctx, orderId);
    const g = await ctx.db
      .query("posGiftCards")
      .withIndex("by_code", (q) => q.eq("code", cleanCode(code)))
      .unique();
    const why = giftProblem(g, Date.now());
    if (why || !g) {
      throw new ConvexError(why ?? "Gift card inválido.");
    }
    const id = `${LINE.gift}${g.code}`;
    if (o.items.some((i) => i.id === id)) {
      throw new ConvexError("Este gift card já está neste pedido.");
    }
    const due = r2(o.items.reduce((s, i) => s + i.price * i.qty, 0));
    const use = r2(Math.min(amount ?? g.balance, g.balance, Math.max(0, due)));
    if (use <= 0) {
      throw new ConvexError("Nada a pagar neste pedido.");
    }
    await ctx.db.patch(o._id, {
      items: [
        ...o.items,
        {
          id,
          productId: null,
          name: `Gift card ${g.code}`,
          price: -use,
          qty: 1,
          sent: true,
        },
      ],
      updatedAt: Date.now(),
    });
    return { used: use, left: r2(g.balance - use) };
  },
});

/* ------------------------------- on payment ------------------------------ */

type GiftKind = "issue" | "topup" | "redeem";

function giftKind(id: string): GiftKind | null {
  if (id.startsWith(LINE.giftSale)) {
    return "issue";
  }
  if (id.startsWith(LINE.giftTopup)) {
    return "topup";
  }
  if (id.startsWith(LINE.gift)) {
    return "redeem";
  }
  return null;
}

/** Applies one gift card line of a paid order. */
async function settleGiftLine(
  ctx: MutationCtx,
  o: Doc<"posOrders">,
  item: Doc<"posOrders">["items"][number],
  kind: GiftKind,
  entry: { userName: string; company: string; at: number }
) {
  const code = item.id.slice(item.id.indexOf(":") + 1);
  const g = await ctx.db
    .query("posGiftCards")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!g) {
    throw new ConvexError(`Gift card ${code} não encontrado.`);
  }
  const amount = r2(Math.abs(item.price * item.qty));
  const history = [
    ...g.history,
    { kind, amount, orderCid: o.cid, orderNumber: o.number, ...entry },
  ].slice(-100);
  if (kind === "redeem") {
    const why = giftProblem(g, entry.at);
    if (why || g.balance + 0.001 < amount) {
      throw new ConvexError(why ?? `Gift card ${code} sem saldo suficiente.`);
    }
    await ctx.db.patch(g._id, { balance: r2(g.balance - amount), history });
  } else if (kind === "issue") {
    await ctx.db.patch(g._id, {
      active: true,
      balance: amount,
      initial: amount,
      customerId: g.customerId ?? o.customerId,
      history,
    });
  } else {
    await ctx.db.patch(g._id, { balance: r2(g.balance + amount), history });
  }
}

/** Stamps earned (and used) on a paid order, per punch card. */
async function newStamps(
  ctx: MutationCtx,
  o: Doc<"posOrders">,
  c: Doc<"posCustomers">,
  company: string
) {
  const stamps = new Map(c.stamps.map((s) => [s.programId, s.count]));
  const programs = await ctx.db
    .query("posPunchPrograms")
    .withIndex("by_company", (q) => q.eq("company", company))
    .take(50);
  for (const p of programs.filter((x) => x.active)) {
    const key = p._id as string;
    let count = stamps.get(key) ?? 0;
    if (o.items.some((i) => i.id === `${LINE.reward}${key}`)) {
      count = Math.max(0, count - p.stamps);
    }
    const earned = (await qualifies(ctx, p, o.items)).reduce(
      (s, i) => s + i.qty,
      0
    );
    if (earned || stamps.has(key)) {
      stamps.set(key, count + Math.floor(earned));
    }
  }
  return [...stamps].map(([programId, count]) => ({ programId, count }));
}

/**
 * Called by pos.pay inside the same transaction: gift cards (spend,
 * activate, top up), punch card stamps and the customer's visit.
 * Throws (and so cancels the payment) when a gift card can't cover its
 * line any more.
 */
export async function settleLoyalty(
  ctx: MutationCtx,
  o: Doc<"posOrders">,
  userName: string,
  company: string,
  now: number
) {
  for (const i of o.items) {
    const kind = giftKind(i.id);
    if (kind) {
      await settleGiftLine(ctx, o, i, kind, { userName, company, at: now });
    }
  }
  if (!o.customerId) {
    return;
  }
  const c = await ctx.db.get(o.customerId);
  if (!c) {
    return;
  }
  const total = r2(
    o.items
      .filter((i) => giftKind(i.id) !== "issue" && giftKind(i.id) !== "topup")
      .reduce((s, i) => s + i.price * i.qty, 0)
  );
  await ctx.db.patch(c._id, {
    stamps: await newStamps(ctx, o, c, company),
    visits: c.visits + 1,
    spent: r2(c.spent + Math.max(0, total)),
    lastVisit: now,
    lastCompany: company,
  });
}
