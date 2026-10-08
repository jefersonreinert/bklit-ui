import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { audit, meta, requireStaff } from "./access";
import { isPanel, requirePanel } from "./lib";

/**
 * POS data shared by every device. Each action is a small transaction on
 * the server (add an item, pay…), so devices never overwrite each other;
 * order numbers come from one counter.
 */

const item = v.object({
  id: v.string(),
  productId: v.union(v.string(), v.null()),
  name: v.string(),
  price: v.number(),
  cost: v.optional(v.number()),
  qty: v.number(),
  sent: v.boolean(),
});

const productFields = {
  name: v.string(),
  category: v.string(),
  price: v.number(),
  color: v.string(),
  available: v.boolean(),
  cost: v.optional(v.number()),
  sku: v.optional(v.string()),
  barcode: v.optional(v.string()),
  unit: v.optional(v.string()),
  trackStock: v.optional(v.boolean()),
  stock: v.optional(v.number()),
  minStock: v.optional(v.number()),
  description: v.optional(v.string()),
};
const product = v.object({ id: v.string(), ...productFields });

const toProduct = (p: Doc<"posProducts">) => {
  const { _id, _creationTime, cid, updatedAt, ...rest } = p;
  return { id: cid, ...rest };
};

const toOrder = (o: Doc<"posOrders">) => {
  const { _id, _creationTime, cid, closedAt, ...rest } = o;
  return { id: cid, ...rest };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/* -------------------------------- queries -------------------------------- */

/** Products, floor plan, settings and receipt design. */
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const [products, m] = await Promise.all([
      ctx.db.query("posProducts").take(3000),
      meta(ctx),
    ]);
    return {
      products: products.map(toProduct),
      meta: m
        ? { areas: m.areas, settings: m.settings, receipt: m.receipt }
        : null,
    };
  },
});

/** Orders being served right now (open or waiting for card payment). */
export const openOrders = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const [open, paying] = await Promise.all([
      ctx.db
        .query("posOrders")
        .withIndex("by_status_closed", (q) => q.eq("status", "open"))
        .take(500),
      ctx.db
        .query("posOrders")
        .withIndex("by_status_closed", (q) => q.eq("status", "paying"))
        .take(500),
    ]);
    return [...open, ...paying].map(toOrder);
  },
});

/** Paid and cancelled orders since a time (orders list, receipts). */
export const closedOrders = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const [paid, voided] = await Promise.all([
      ctx.db
        .query("posOrders")
        .withIndex("by_status_closed", (q) =>
          q.eq("status", "paid").gte("closedAt", since)
        )
        .order("desc")
        .take(400),
      ctx.db
        .query("posOrders")
        .withIndex("by_status_closed", (q) =>
          q.eq("status", "void").gte("closedAt", since)
        )
        .order("desc")
        .take(100),
    ]);
    return [...paid, ...voided].map(toOrder);
  },
});

/** Daily totals between two local days (YYYY-MM-DD, inclusive). */
export const daily = query({
  args: { session: v.optional(v.string()), from: v.string(), to: v.string() },
  handler: async (ctx, { session, from, to }) => {
    await requireStaff(ctx, session, ["reports", "products", "stock"]);
    return await ctx.db
      .query("posDaily")
      .withIndex("by_day", (q) => q.gte("day", from).lte("day", to))
      .take(400);
  },
});

export const stockMoves = query({
  args: { session: v.optional(v.string()), productId: v.string() },
  handler: async (ctx, { session, productId }) => {
    await requireStaff(ctx, session, ["stock", "products"]);
    const moves = await ctx.db
      .query("posStock")
      .withIndex("by_product", (q) => q.eq("productCid", productId))
      .order("desc")
      .take(15);
    return moves.map(({ _id, _creationTime, productCid, ...m }) => ({
      id: _id,
      productId: productCid,
      ...m,
    }));
  },
});

/* -------------------------------- orders --------------------------------- */

async function findOrder(ctx: MutationCtx, cid: string) {
  const order = await ctx.db
    .query("posOrders")
    .withIndex("by_cid", (q) => q.eq("cid", cid))
    .unique();
  if (!order) {
    throw new ConvexError("Pedido não encontrado.");
  }
  return order;
}

function editable(order: Doc<"posOrders">) {
  if (order.status === "paid" || order.status === "void") {
    throw new ConvexError(
      `O pedido ${order.number} já foi fechado em outro aparelho.`
    );
  }
}

export const createOrder = mutation({
  args: {
    session: v.string(),
    cid: v.string(),
    tableId: v.union(v.string(), v.null()),
    name: v.string(),
  },
  handler: async (ctx, { session, cid, tableId, name }) => {
    const user = await requireStaff(ctx, session, "orders");
    const existing = await ctx.db
      .query("posOrders")
      .withIndex("by_cid", (q) => q.eq("cid", cid))
      .unique();
    if (existing) {
      return existing.number;
    }
    const m = await meta(ctx);
    if (!m) {
      throw new ConvexError("POS sem configuração.");
    }
    const number = m.nextOrderNumber;
    await ctx.db.patch(m._id, { nextOrderNumber: number + 1 });
    const now = Date.now();
    await ctx.db.insert("posOrders", {
      cid,
      number,
      tableId,
      name,
      items: [],
      taxRate: 0,
      status: "open",
      createdAt: now,
      updatedAt: now,
      closedAt: 0,
      openedBy: user.name,
    });
    return number;
  },
});

/** Adds a line (merging with an unsent line of the same product). */
export const addItem = mutation({
  args: { session: v.string(), orderId: v.string(), item },
  handler: async (ctx, { session, orderId, item: line }) => {
    await requireStaff(ctx, session, "orders");
    const order = await findOrder(ctx, orderId);
    editable(order);
    const same = line.productId
      ? order.items.find((i) => i.productId === line.productId && !i.sent)
      : undefined;
    const items = same
      ? order.items.map((i) =>
          i === same ? { ...i, qty: i.qty + line.qty } : i
        )
      : [...order.items, line];
    await ctx.db.patch(order._id, { items, updatedAt: Date.now() });
  },
});

export const changeQty = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    itemId: v.string(),
    delta: v.number(),
  },
  handler: async (ctx, { session, orderId, itemId, delta }) => {
    const user = await requireStaff(ctx, session, "orders");
    const order = await findOrder(ctx, orderId);
    editable(order);
    const line = order.items.find((i) => i.id === itemId);
    if (!line) {
      return;
    }
    if (line.sent && delta < 0) {
      if (!user.perms.includes("void")) {
        throw new ConvexError(
          "Só gerente pode tirar item já enviado à cozinha."
        );
      }
      await audit(
        ctx,
        user,
        "Tirou item enviado",
        `${line.name} · pedido ${order.number}`
      );
    }
    const items = order.items
      .map((i) => (i.id === itemId ? { ...i, qty: i.qty + delta } : i))
      .filter((i) => i.qty > 0);
    await ctx.db.patch(order._id, { items, updatedAt: Date.now() });
  },
});

export const sendToKitchen = mutation({
  args: { session: v.string(), orderId: v.string() },
  handler: async (ctx, { session, orderId }) => {
    await requireStaff(ctx, session, "orders");
    const order = await findOrder(ctx, orderId);
    editable(order);
    await ctx.db.patch(order._id, {
      items: order.items.map((i) => ({ ...i, sent: true })),
      updatedAt: Date.now(),
    });
  },
});

export const patchOrder = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    name: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    tableId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { session, orderId, ...patch }) => {
    await requireStaff(ctx, session, "orders");
    const order = await findOrder(ctx, orderId);
    editable(order);
    await ctx.db.patch(order._id, { ...patch, updatedAt: Date.now() });
  },
});

/** open ↔ paying (card on the SumUp app) or cancel. */
export const setStatus = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    status: v.union(v.literal("open"), v.literal("paying"), v.literal("void")),
    payment: v.optional(
      v.object({
        method: v.string(),
        amount: v.number(),
        tip: v.number(),
        at: v.number(),
      })
    ),
  },
  handler: async (ctx, { session, orderId, status, payment }) => {
    const user = await requireStaff(
      ctx,
      session,
      status === "void" ? "void" : "charge"
    );
    const order = await findOrder(ctx, orderId);
    editable(order);
    const now = Date.now();
    await ctx.db.patch(order._id, {
      status,
      payment: payment ?? order.payment,
      updatedAt: now,
      closedAt: status === "void" ? now : 0,
      closedBy: status === "void" ? user.name : order.closedBy,
    });
    if (status === "void") {
      await audit(ctx, user, "Cancelou pedido", `nº ${order.number}`);
    }
  },
});

type Daily = Omit<Doc<"posDaily">, "_id" | "_creationTime">;

function addToDaily(
  d: Daily,
  order: Doc<"posOrders">,
  payment: { method: string; amount: number; tip: number },
  hour: string,
  products: Map<string, Doc<"posProducts">>
) {
  const subtotal = order.items.reduce((a, i) => a + i.price * i.qty, 0);
  const tax = Math.round(subtotal * order.taxRate) / 100;
  d.orders += 1;
  d.sales = r2(d.sales + subtotal + tax);
  d.subtotal = r2(d.subtotal + subtotal);
  d.tax = r2(d.tax + tax);
  d.tips = r2(d.tips + payment.tip);
  d.methods[payment.method] = r2(
    (d.methods[payment.method] ?? 0) + payment.amount
  );
  d.hours[hour] = r2((d.hours[hour] ?? 0) + subtotal + tax);
  for (const i of order.items) {
    const p = i.productId ? products.get(i.productId) : undefined;
    const unitCost = i.cost ?? p?.cost ?? 0;
    const key = i.productId ?? `avulso:${i.name}`;
    const cur = d.products[key] ?? {
      name: p?.name ?? i.name,
      category: p?.category ?? "Avulso",
      qty: 0,
      revenue: 0,
      cost: 0,
    };
    d.products[key] = {
      ...cur,
      qty: cur.qty + i.qty,
      revenue: r2(cur.revenue + i.price * i.qty),
      cost: r2(cur.cost + unitCost * i.qty),
    };
    d.cost = r2(d.cost + unitCost * i.qty);
    d.items += i.qty;
  }
}

/** Pays the order, takes stock out and updates the day's totals. */
export const pay = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    payment: v.object({
      method: v.string(),
      amount: v.number(),
      tip: v.number(),
      ref: v.optional(v.string()),
    }),
    day: v.string(),
    hour: v.string(),
  },
  handler: async (ctx, { session, orderId, payment, day, hour }) => {
    const user = await requireStaff(ctx, session, "charge");
    const order = await findOrder(ctx, orderId);
    if (order.status === "paid") {
      return order.number;
    }
    editable(order);
    const now = Date.now();
    const products = new Map<string, Doc<"posProducts">>();
    for (const i of order.items) {
      if (i.productId && !products.has(i.productId)) {
        const p = await ctx.db
          .query("posProducts")
          .withIndex("by_cid", (q) => q.eq("cid", i.productId as string))
          .unique();
        if (p) {
          products.set(i.productId, p);
        }
      }
    }
    // Stock
    for (const i of order.items) {
      const p = i.productId ? products.get(i.productId) : undefined;
      if (p?.trackStock) {
        const stock = (p.stock ?? 0) - i.qty;
        products.set(p.cid, { ...p, stock });
        await ctx.db.patch(p._id, { stock, updatedAt: now });
        await ctx.db.insert("posStock", {
          productCid: p.cid,
          qty: -i.qty,
          kind: "sale",
          orderCid: order.cid,
          userName: user.name,
          at: now,
        });
      }
    }
    // Day totals
    const existing = await ctx.db
      .query("posDaily")
      .withIndex("by_day", (q) => q.eq("day", day))
      .unique();
    const d: Daily = existing ?? {
      day,
      orders: 0,
      sales: 0,
      subtotal: 0,
      tax: 0,
      tips: 0,
      cost: 0,
      items: 0,
      methods: {},
      hours: {},
      products: {},
    };
    addToDaily(d, order, payment, hour, products);
    if (existing) {
      await ctx.db.replace(existing._id, d);
    } else {
      await ctx.db.insert("posDaily", d);
    }
    await ctx.db.patch(order._id, {
      status: "paid",
      payment: { ...payment, at: now },
      updatedAt: now,
      closedAt: now,
      closedBy: user.name,
    });
    return order.number;
  },
});

export const deleteOrder = mutation({
  args: { session: v.string(), orderId: v.string() },
  handler: async (ctx, { session, orderId }) => {
    const user = await requireStaff(ctx, session, "void");
    const order = await findOrder(ctx, orderId);
    if (order.status === "paid") {
      throw new ConvexError("Pedidos pagos ficam no histórico.");
    }
    await ctx.db.delete(order._id);
    await audit(ctx, user, "Excluiu pedido", `nº ${order.number}`);
  },
});

/* ------------------------------ products/stock --------------------------- */

export const saveProduct = mutation({
  args: { session: v.string(), product },
  handler: async (ctx, { session, product: p }) => {
    const user = await requireStaff(ctx, session, ["products", "stock"]);
    const { id, ...fields } = p;
    const current = await ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", id))
      .unique();
    const canEdit = user.perms.includes("products");
    if (!canEdit) {
      // Stock-only users may just switch availability
      if (!current) {
        throw new ConvexError("POS_FORBIDDEN");
      }
      await ctx.db.patch(current._id, {
        available: fields.available,
        updatedAt: Date.now(),
      });
      return;
    }
    if (current) {
      // Stock changes only through movements
      await ctx.db.patch(current._id, {
        ...fields,
        stock: current.stock,
        updatedAt: Date.now(),
      });
      if (current.price !== fields.price) {
        await audit(
          ctx,
          user,
          "Mudou preço",
          `${fields.name}: ${current.price} → ${fields.price}`
        );
      }
    } else {
      await ctx.db.insert("posProducts", {
        ...fields,
        cid: id,
        updatedAt: Date.now(),
      });
      await audit(ctx, user, "Criou produto", fields.name);
    }
  },
});

export const deleteProduct = mutation({
  args: { session: v.string(), id: v.string() },
  handler: async (ctx, { session, id }) => {
    const user = await requireStaff(ctx, session, "products");
    const current = await ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", id))
      .unique();
    if (current) {
      await ctx.db.delete(current._id);
      await audit(ctx, user, "Excluiu produto", current.name);
    }
  },
});

export const moveStock = mutation({
  args: {
    session: v.string(),
    productId: v.string(),
    qty: v.number(),
    kind: v.union(
      v.literal("purchase"),
      v.literal("adjust"),
      v.literal("waste")
    ),
    unitCost: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { session, productId, qty, kind, unitCost, note }) => {
    const user = await requireStaff(ctx, session, "stock");
    const p = await ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", productId))
      .unique();
    if (!p) {
      throw new ConvexError("Produto não encontrado.");
    }
    const before = Math.max(0, p.stock ?? 0);
    let cost = p.cost;
    if (kind === "purchase" && unitCost !== undefined) {
      const total = before + qty;
      cost = r2(
        total > 0
          ? (before * (p.cost ?? unitCost) + qty * unitCost) / total
          : unitCost
      );
    }
    const now = Date.now();
    await ctx.db.patch(p._id, {
      stock: (p.stock ?? 0) + qty,
      cost,
      trackStock: true,
      updatedAt: now,
    });
    await ctx.db.insert("posStock", {
      productCid: productId,
      qty,
      kind,
      unitCost,
      note,
      userName: user.name,
      at: now,
    });
  },
});

/* ------------------------------ settings/meta ---------------------------- */

export const saveMeta = mutation({
  args: {
    session: v.string(),
    areas: v.optional(v.any()),
    settings: v.optional(v.any()),
    receipt: v.optional(v.any()),
  },
  handler: async (ctx, { session, ...patch }) => {
    const need = patch.areas === undefined ? "settings" : "tables";
    const user = await requireStaff(ctx, session, need);
    const m = await meta(ctx);
    if (!m) {
      throw new ConvexError("POS sem configuração.");
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    await ctx.db.patch(m._id, clean);
    if (patch.settings !== undefined) {
      await audit(ctx, user, "Alterou configurações");
    }
  },
});

/**
 * First run after the administrator: imports this device's local POS
 * (or the sample menu) into the shared database.
 */
export const bootstrap = mutation({
  args: {
    session: v.string(),
    products: v.array(product),
    areas: v.any(),
    settings: v.any(),
    receipt: v.any(),
    nextOrderNumber: v.number(),
  },
  handler: async (ctx, { session, products, ...m }) => {
    const user = await requireStaff(ctx, session, "users");
    if (await meta(ctx)) {
      return false;
    }
    await ctx.db.insert("posMeta", { key: "main", ...m });
    const now = Date.now();
    for (const { id, ...p } of products.slice(0, 3000)) {
      await ctx.db.insert("posProducts", { ...p, cid: id, updatedAt: now });
    }
    await audit(ctx, user, "Configurou o POS", `${products.length} produtos`);
    return true;
  },
});

/** Used by the panel's setup check. */
export const ready = query({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    return Boolean(await meta(ctx));
  },
});
