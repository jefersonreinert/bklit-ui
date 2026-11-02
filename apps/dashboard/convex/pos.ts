import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import {
  audit,
  canReadPos,
  companyOf,
  isPanelUser,
  MAIN,
  meta,
  requireStaff,
  worksIn,
} from "./access";
import { requirePanel } from "./lib";
import { modifierGroup, posItem, posWine } from "./schema";

/**
 * POS data shared by every device. Each action is a small transaction on
 * the server (add an item, pay…), so devices never overwrite each other;
 * order numbers come from one counter per business.
 *
 * Several businesses (bars, restaurants) share the database: products,
 * orders, stock and day totals carry their `company` (a posMeta key).
 * Documents from before companies existed have none and belong to "main".
 */

const item = posItem;

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
  modifiers: v.optional(v.array(modifierGroup)),
  wine: v.optional(posWine),
};
const product = v.object({ id: v.string(), ...productFields });

/** Business of the call; omitted = "main". */
const companyArg = { company: v.optional(v.string()) };

const toProduct = (p: Doc<"posProducts">) => {
  const { _id, _creationTime, cid, updatedAt, company, ...rest } = p;
  return { id: cid, ...rest };
};

const toOrder = (o: Doc<"posOrders">) => {
  const { _id, _creationTime, cid, closedAt, company, ...rest } = o;
  return { id: cid, ...rest };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Runs an index query for a business; "main" also gets the documents
 * saved before companies existed (no company field).
 */
async function inCompany<T>(
  company: string,
  run: (key: string | undefined) => Promise<T[]>
) {
  if (company !== MAIN) {
    return await run(company);
  }
  const [named, legacy] = await Promise.all([run(MAIN), run(undefined)]);
  return [...named, ...legacy];
}

const productsOf = (ctx: QueryCtx, company: string) =>
  inCompany(company, (key) =>
    ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", key))
      .take(3000)
  );

function ordersOf(
  ctx: QueryCtx,
  company: string,
  status: Doc<"posOrders">["status"],
  since = 0,
  limit = 500
) {
  return inCompany(company, (key) =>
    ctx.db
      .query("posOrders")
      .withIndex("by_company_status_closed", (q) =>
        q.eq("company", key).eq("status", status).gte("closedAt", since)
      )
      .order("desc")
      .take(limit)
  );
}

/* ------------------------------- businesses ------------------------------ */

export interface CompanyProfile {
  name: string;
  /** Accent color of the business in the POS. */
  color: string;
  /** Short line under the name ("Wine bar", "Craft beer pub"). */
  tagline?: string;
  /** Wine list with glasses from the bottle. */
  wine?: boolean;
}

function profileOf(m: Doc<"posMeta">): CompanyProfile {
  const p = (m.profile ?? {}) as Partial<CompanyProfile>;
  const receipt = (m.receipt ?? {}) as { businessName?: string };
  return {
    name: p.name || receipt.businessName || "Casa Brasa",
    color: p.color || "#c96442",
    tagline: p.tagline,
    wine: Boolean(p.wine),
  };
}

/** Businesses this device can open (all for the panel and admins). */
export const companies = query({
  args: { session: v.optional(v.string()) },
  handler: async (ctx, { session }) => {
    const metas = await ctx.db.query("posMeta").take(50);
    const panel = await isPanelUser(ctx, session);
    const user = panel.user;
    if (!(panel.panel || user)) {
      return null;
    }
    return metas
      .filter((m) => panel.panel || (user && worksIn(user, m.key)))
      .map((m) => ({
        key: m.key,
        currency:
          ((m.settings ?? {}) as { currency?: string }).currency ?? "EUR",
        ...profileOf(m),
      }))
      .sort((a, b) => {
        if (a.key === MAIN || b.key === MAIN) {
          return a.key === MAIN ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  },
});

const KEY = /^[a-z0-9-]{2,32}$/;

/** Creates or edits a business (administrator). */
export const saveCompany = mutation({
  args: {
    session: v.string(),
    key: v.string(),
    profile: v.object({
      name: v.string(),
      color: v.string(),
      tagline: v.optional(v.string()),
      wine: v.optional(v.boolean()),
    }),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, { session, key, profile, currency }) => {
    const user = await requireStaff(ctx, session, "users");
    if (!(KEY.test(key) && profile.name.trim())) {
      throw new ConvexError("Informe o nome da empresa.");
    }
    const current = await meta(ctx, key);
    if (current) {
      await ctx.db.patch(current._id, {
        profile: { ...(current.profile ?? {}), ...profile },
        settings: currency
          ? { ...(current.settings ?? {}), currency }
          : current.settings,
      });
      await audit(ctx, user, "Editou empresa", profile.name, key);
      return key;
    }
    await ctx.db.insert("posMeta", await newMeta(ctx, key, profile, currency));
    await audit(ctx, user, "Criou empresa", profile.name, key);
    return key;
  },
});

/** A new business starts with the first one's settings and receipt design. */
async function newMeta(
  ctx: QueryCtx,
  key: string,
  profile: CompanyProfile,
  currency?: string
) {
  const base = await meta(ctx);
  return {
    key,
    profile,
    areas: [{ id: "salao", name: "Salão", tables: [] }],
    settings: {
      ...((base?.settings ?? {}) as object),
      currency: currency ?? "EUR",
    },
    receipt: {
      ...((base?.receipt ?? {}) as object),
      businessName: profile.name,
      logo: "",
    },
    printers: [],
    nextOrderNumber: 1,
  };
}

/* -------------------------------- queries -------------------------------- */

/** Products, floor plan, settings and receipt design. */
export const catalog = query({
  args: { session: v.optional(v.string()), ...companyArg },
  handler: async (ctx, { session, company = MAIN }) => {
    if (!(await canReadPos(ctx, session, company))) {
      return null;
    }
    const [products, m] = await Promise.all([
      productsOf(ctx, company),
      meta(ctx, company),
    ]);
    return {
      products: products.map(toProduct),
      meta: m
        ? {
            areas: m.areas,
            settings: m.settings,
            receipt: m.receipt,
            printers: m.printers,
          }
        : null,
    };
  },
});

/** Orders being served right now (open or waiting for card payment). */
export const openOrders = query({
  args: { session: v.optional(v.string()), ...companyArg },
  handler: async (ctx, { session, company = MAIN }) => {
    if (!(await canReadPos(ctx, session, company))) {
      return null;
    }
    const [open, paying] = await Promise.all([
      ordersOf(ctx, company, "open"),
      ordersOf(ctx, company, "paying"),
    ]);
    return [...open, ...paying].map(toOrder);
  },
});

/** Paid and cancelled orders since a time (orders list, receipts). */
export const closedOrders = query({
  args: { since: v.number(), session: v.optional(v.string()), ...companyArg },
  handler: async (ctx, { since, session, company = MAIN }) => {
    if (!(await canReadPos(ctx, session, company))) {
      return null;
    }
    const [paid, voided] = await Promise.all([
      ordersOf(ctx, company, "paid", since, 400),
      ordersOf(ctx, company, "void", since, 100),
    ]);
    return [...paid, ...voided]
      .sort((a, b) => b.closedAt - a.closedAt)
      .map(toOrder);
  },
});

/** Daily totals between two local days (YYYY-MM-DD, inclusive). */
export const daily = query({
  args: {
    session: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    ...companyArg,
  },
  handler: async (ctx, { session, from, to, company = MAIN }) => {
    await requireStaff(ctx, session, ["reports", "products", "stock"], company);
    const days = await inCompany(company, (key) =>
      ctx.db
        .query("posDaily")
        .withIndex("by_company_day", (q) =>
          q.eq("company", key).gte("day", from).lte("day", to)
        )
        .take(400)
    );
    return days.sort((a, b) => a.day.localeCompare(b.day));
  },
});

export const stockMoves = query({
  args: { session: v.optional(v.string()), productId: v.string() },
  handler: async (ctx, { session, productId }) => {
    const user = await requireStaff(ctx, session, ["stock", "products"]);
    const moves = await ctx.db
      .query("posStock")
      .withIndex("by_product", (q) => q.eq("productCid", productId))
      .order("desc")
      .take(15);
    if (moves[0] && !worksIn(user, companyOf(moves[0]))) {
      throw new ConvexError("POS_FORBIDDEN");
    }
    return moves.map(({ _id, _creationTime, productCid, company, ...m }) => ({
      id: _id,
      productId: productCid,
      ...m,
    }));
  },
});

/* -------------------------------- orders --------------------------------- */

async function findOrder(ctx: MutationCtx, cid: string, user: Doc<"posUsers">) {
  const order = await ctx.db
    .query("posOrders")
    .withIndex("by_cid", (q) => q.eq("cid", cid))
    .unique();
  if (!order) {
    throw new ConvexError("Pedido não encontrado.");
  }
  if (!worksIn(user, companyOf(order))) {
    throw new ConvexError("POS_FORBIDDEN");
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
    ...companyArg,
  },
  handler: async (ctx, { session, cid, tableId, name, company = MAIN }) => {
    const user = await requireStaff(ctx, session, "orders", company);
    const existing = await ctx.db
      .query("posOrders")
      .withIndex("by_cid", (q) => q.eq("cid", cid))
      .unique();
    if (existing) {
      return existing.number;
    }
    const m = await meta(ctx, company);
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
      company,
    });
    return number;
  },
});

/** Adds a line (merging with an unsent line of the same product). */
export const addItem = mutation({
  args: { session: v.string(), orderId: v.string(), item },
  handler: async (ctx, { session, orderId, item: line }) => {
    const user = await requireStaff(ctx, session, "orders");
    const order = await findOrder(ctx, orderId, user);
    editable(order);
    const plain = (i: typeof line) => !(i.mods?.length || i.note);
    const same =
      line.productId && plain(line)
        ? order.items.find(
            (i) =>
              i.productId === line.productId &&
              i.name === line.name &&
              !i.sent &&
              plain(i)
          )
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
    const order = await findOrder(ctx, orderId, user);
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

/** Note for the kitchen on a line not sent yet. */
export const setItemNote = mutation({
  args: {
    session: v.string(),
    orderId: v.string(),
    itemId: v.string(),
    note: v.string(),
  },
  handler: async (ctx, { session, orderId, itemId, note }) => {
    const user = await requireStaff(ctx, session, "orders");
    const order = await findOrder(ctx, orderId, user);
    editable(order);
    await ctx.db.patch(order._id, {
      items: order.items.map((i) =>
        i.id === itemId
          ? { ...i, note: note.trim().slice(0, 200) || undefined }
          : i
      ),
      updatedAt: Date.now(),
    });
  },
});

export const sendToKitchen = mutation({
  args: { session: v.string(), orderId: v.string() },
  handler: async (ctx, { session, orderId }) => {
    const user = await requireStaff(ctx, session, "orders");
    const order = await findOrder(ctx, orderId, user);
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
    const user = await requireStaff(ctx, session, "orders");
    const order = await findOrder(ctx, orderId, user);
    editable(order);
    await ctx.db.patch(order._id, { ...patch, updatedAt: Date.now() });
  },
});

/**
 * Moves items (all when itemIds is empty) to another table. Joins the
 * table's open order or opens one; the source closes when emptied.
 */
export const transferItems = mutation({
  args: {
    session: v.string(),
    fromId: v.string(),
    toTableId: v.string(),
    itemIds: v.array(v.string()),
    newCid: v.string(),
  },
  handler: async (ctx, { session, fromId, toTableId, itemIds, newCid }) => {
    const user = await requireStaff(ctx, session, "orders");
    const from = await findOrder(ctx, fromId, user);
    editable(from);
    const moving = itemIds.length
      ? from.items.filter((i) => itemIds.includes(i.id))
      : from.items;
    const staying = from.items.filter((i) => !moving.includes(i));
    const now = Date.now();
    const company = companyOf(from);
    const [open, paying] = await Promise.all([
      ordersOf(ctx, company, "open"),
      ordersOf(ctx, company, "paying"),
    ]);
    const target = [...(open ?? []), ...(paying ?? [])].find(
      (o) => o.tableId === toTableId && o._id !== from._id
    );
    let targetCid: string;
    if (target) {
      await ctx.db.patch(target._id, {
        items: [...target.items, ...moving],
        updatedAt: now,
      });
      targetCid = target.cid;
    } else if (staying.length === 0) {
      // Whole order to a free table: just move it
      await ctx.db.patch(from._id, { tableId: toTableId, updatedAt: now });
      await audit(ctx, user, "Mudou de mesa", `pedido ${from.number}`);
      return from.cid;
    } else {
      const m = await meta(ctx, company);
      if (!m) {
        throw new ConvexError("POS sem configuração.");
      }
      await ctx.db.patch(m._id, { nextOrderNumber: m.nextOrderNumber + 1 });
      await ctx.db.insert("posOrders", {
        cid: newCid,
        number: m.nextOrderNumber,
        tableId: toTableId,
        name: "",
        items: moving,
        taxRate: from.taxRate,
        status: "open",
        createdAt: now,
        updatedAt: now,
        closedAt: 0,
        openedBy: user.name,
        company,
      });
      targetCid = newCid;
    }
    if (staying.length === 0) {
      await ctx.db.delete(from._id);
    } else {
      await ctx.db.patch(from._id, { items: staying, updatedAt: now });
    }
    await audit(
      ctx,
      user,
      "Transferiu itens",
      `pedido ${from.number}: ${moving.length} itens`
    );
    return targetCid;
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
    const order = await findOrder(ctx, orderId, user);
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
    const unitCost = i.cost ?? (p?.cost ?? 0) * (i.portion ?? 1);
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
    const order = await findOrder(ctx, orderId, user);
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
    const company = companyOf(order);
    // Stock (a glass takes its share of the bottle)
    for (const i of order.items) {
      const p = i.productId ? products.get(i.productId) : undefined;
      if (p?.trackStock) {
        const used = Math.round(i.qty * (i.portion ?? 1) * 10_000) / 10_000;
        const stock = Math.round(((p.stock ?? 0) - used) * 10_000) / 10_000;
        products.set(p.cid, { ...p, stock });
        await ctx.db.patch(p._id, { stock, updatedAt: now });
        await ctx.db.insert("posStock", {
          productCid: p.cid,
          qty: -used,
          kind: "sale",
          orderCid: order.cid,
          userName: user.name,
          company,
          at: now,
        });
      }
    }
    // Day totals
    const [existing] = await inCompany(company, (key) =>
      ctx.db
        .query("posDaily")
        .withIndex("by_company_day", (q) => q.eq("company", key).eq("day", day))
        .take(1)
    );
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
      company,
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
    const order = await findOrder(ctx, orderId, user);
    if (order.status === "paid") {
      throw new ConvexError("Pedidos pagos ficam no histórico.");
    }
    await ctx.db.delete(order._id);
    await audit(ctx, user, "Excluiu pedido", `nº ${order.number}`);
  },
});

/* ------------------------------ products/stock --------------------------- */

export const saveProduct = mutation({
  args: { session: v.string(), product, ...companyArg },
  handler: async (ctx, { session, product: p, company = MAIN }) => {
    const { id, ...fields } = p;
    const current = await ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", id))
      .unique();
    const user = await requireStaff(
      ctx,
      session,
      ["products", "stock"],
      current ? companyOf(current) : company
    );
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
        company,
        updatedAt: Date.now(),
      });
      await audit(ctx, user, "Criou produto", fields.name, company);
    }
  },
});

export const deleteProduct = mutation({
  args: { session: v.string(), id: v.string() },
  handler: async (ctx, { session, id }) => {
    const current = await ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", id))
      .unique();
    const user = await requireStaff(
      ctx,
      session,
      "products",
      current ? companyOf(current) : undefined
    );
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
    const p = await ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", productId))
      .unique();
    if (!p) {
      throw new ConvexError("Produto não encontrado.");
    }
    const user = await requireStaff(ctx, session, "stock", companyOf(p));
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
      company: companyOf(p),
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
    printers: v.optional(v.any()),
    ...companyArg,
  },
  handler: async (ctx, { session, company = MAIN, ...patch }) => {
    const need = patch.areas === undefined ? "settings" : "tables";
    const user = await requireStaff(ctx, session, need, company);
    const m = await meta(ctx, company);
    if (!m) {
      throw new ConvexError("POS sem configuração.");
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    await ctx.db.patch(m._id, clean);
    if (patch.settings !== undefined) {
      await audit(ctx, user, "Alterou configurações", "", company);
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

/**
 * Loads a business's menu (scripts/pos-menus/import.mjs). Products of the
 * business are replaced; stock counts of products that stay (same id) are
 * kept. Big menus go in parts: `keep` adds a part without removing the
 * products of the previous parts.
 */
export const importMenu = internalMutation({
  args: {
    company: v.string(),
    profile: v.object({
      name: v.string(),
      color: v.string(),
      tagline: v.optional(v.string()),
      wine: v.optional(v.boolean()),
    }),
    currency: v.string(),
    products: v.array(product),
    keep: v.optional(v.boolean()),
  },
  handler: async (ctx, { company, profile, currency, products, keep }) => {
    if (!KEY.test(company) || company === MAIN) {
      throw new ConvexError("Empresa inválida.");
    }
    const m = await meta(ctx, company);
    if (m) {
      await ctx.db.patch(m._id, {
        profile: { ...(m.profile ?? {}), ...profile },
        settings: { ...((m.settings ?? {}) as object), currency },
      });
    } else {
      await ctx.db.insert(
        "posMeta",
        await newMeta(ctx, company, profile, currency)
      );
    }
    const old = new Map(
      (await productsOf(ctx, company)).map((p) => [p.cid, p])
    );
    const now = Date.now();
    for (const { id, ...p } of products.slice(0, 3000)) {
      const cur = old.get(id);
      if (cur) {
        old.delete(id);
        await ctx.db.replace(cur._id, {
          ...p,
          stock: cur.stock ?? p.stock,
          cost: cur.cost ?? p.cost,
          cid: id,
          company,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("posProducts", {
          ...p,
          cid: id,
          company,
          updatedAt: now,
        });
      }
    }
    if (!keep) {
      for (const gone of old.values()) {
        await ctx.db.delete(gone._id);
      }
    }
    await audit(
      ctx,
      null,
      "Importou cardápio",
      `${profile.name}: ${products.length} produtos`,
      company
    );
    return { products: products.length, removed: keep ? 0 : old.size };
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
