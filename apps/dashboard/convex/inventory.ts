import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { audit, MAIN, requireStaff } from "./access";

/**
 * Inventory of a business: suppliers, purchase orders (receiving one adds
 * the stock and updates the average cost), stock takes (the count replaces
 * the system's number and the difference is logged) and an overview of
 * stock value and what is running low.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

async function productsOf(ctx: QueryCtx, company: string) {
  const run = (key: string | undefined) =>
    ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", key))
      .take(3000);
  if (company !== MAIN) {
    return await run(company);
  }
  const [named, legacy] = await Promise.all([run(MAIN), run(undefined)]);
  return [...named, ...legacy];
}

const productByCid = (ctx: QueryCtx, cid: string) =>
  ctx.db
    .query("posProducts")
    .withIndex("by_cid", (q) => q.eq("cid", cid))
    .unique();

const inBusiness = (p: Doc<"posProducts">, company: string) =>
  (p.company ?? MAIN) === company;

/** Adds stock (a purchase) with the weighted average cost. */
async function addStock(
  ctx: MutationCtx,
  p: Doc<"posProducts">,
  qty: number,
  unitCost: number | undefined,
  note: string,
  userName: string,
  kind: "purchase" | "count" | "adjust" | "waste"
) {
  const before = Math.max(0, p.stock ?? 0);
  let cost = p.cost;
  if (kind === "purchase" && unitCost !== undefined && qty > 0) {
    const total = before + qty;
    cost = r2(
      total > 0
        ? (before * (p.cost ?? unitCost) + qty * unitCost) / total
        : unitCost
    );
  }
  const now = Date.now();
  await ctx.db.patch(p._id, {
    stock: r4((p.stock ?? 0) + qty),
    cost,
    trackStock: true,
    updatedAt: now,
  });
  await ctx.db.insert("posStock", {
    productCid: p.cid,
    qty: r4(qty),
    kind,
    unitCost,
    note,
    userName,
    company: p.company ?? MAIN,
    at: now,
  });
}

/* -------------------------------- overview ------------------------------- */

export const overview = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    const products = (await productsOf(ctx, company)).filter(
      (p) => p.trackStock
    );
    const rows = products
      .map((p) => {
        const stock = p.stock ?? 0;
        const min = p.minStock ?? 0;
        return {
          id: p.cid,
          name: p.name,
          category: p.category,
          unit: p.unit ?? "un",
          stock,
          minStock: min,
          cost: p.cost ?? 0,
          value: r2(Math.max(0, stock) * (p.cost ?? 0)),
          low: stock <= min,
          // Enough to reach twice the minimum
          suggest: stock <= min ? r2(Math.max(min * 2 - stock, 1)) : 0,
        };
      })
      .sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
      );
    return {
      items: rows,
      totalValue: r2(rows.reduce((s, r) => s + r.value, 0)),
      lowCount: rows.filter((r) => r.low).length,
    };
  },
});

/** Last stock movements of the business (all products). */
export const movements = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    const moves = await ctx.db
      .query("posStock")
      .order("desc")
      .filter((q) =>
        company === MAIN
          ? q.or(
              q.eq(q.field("company"), MAIN),
              q.eq(q.field("company"), undefined)
            )
          : q.eq(q.field("company"), company)
      )
      .take(150);
    const names = new Map<string, string>();
    for (const m of moves) {
      if (!names.has(m.productCid)) {
        const p = await productByCid(ctx, m.productCid);
        names.set(m.productCid, p?.name ?? m.productCid);
      }
    }
    return moves.map((m) => ({
      id: m._id,
      at: m.at,
      kind: m.kind,
      qty: m.qty,
      product: names.get(m.productCid) ?? "",
      note: m.note ?? "",
      userName: m.userName ?? "",
    }));
  },
});

/* -------------------------------- suppliers ------------------------------ */

const supplierFields = {
  name: v.string(),
  contact: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const suppliers = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    const list = await ctx.db
      .query("posSuppliers")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(500);
    return list
      .filter((s) => s.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ _id, _creationTime, company: _c, ...s }) => ({ id: _id, ...s }));
  },
});

export const saveSupplier = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    id: v.optional(v.id("posSuppliers")),
    ...supplierFields,
  },
  handler: async (ctx, { session, company, id, ...fields }) => {
    const user = await requireStaff(ctx, session, "stock", company);
    const name = fields.name.trim().slice(0, 120);
    if (!name) {
      throw new ConvexError("Informe o nome do fornecedor.");
    }
    const clean = {
      name,
      contact: fields.contact?.trim().slice(0, 120) || undefined,
      phone: fields.phone?.trim().slice(0, 40) || undefined,
      email: fields.email?.trim().slice(0, 120) || undefined,
      notes: fields.notes?.trim().slice(0, 1000) || undefined,
    };
    if (id) {
      const cur = await ctx.db.get(id);
      if (!cur || cur.company !== company) {
        throw new ConvexError("Fornecedor não encontrado.");
      }
      await ctx.db.patch(id, clean);
      return id;
    }
    const created = await ctx.db.insert("posSuppliers", {
      company,
      ...clean,
      active: true,
      createdAt: Date.now(),
    });
    await audit(ctx, user, "Criou fornecedor", name, company);
    return created;
  },
});

export const removeSupplier = mutation({
  args: { session: v.string(), id: v.id("posSuppliers") },
  handler: async (ctx, { session, id }) => {
    const cur = await ctx.db.get(id);
    if (!cur) {
      return;
    }
    const user = await requireStaff(ctx, session, "stock", cur.company);
    await ctx.db.patch(id, { active: false });
    await audit(ctx, user, "Removeu fornecedor", cur.name, cur.company);
  },
});

/* -------------------------------- purchases ------------------------------ */

const purchaseItem = v.object({
  productId: v.string(),
  qty: v.number(),
  unitCost: v.number(),
});

const publicPurchase = ({
  _id,
  _creationTime,
  company: _c,
  ...p
}: Doc<"posPurchases">) => ({
  id: _id,
  ...p,
  total: r2(p.items.reduce((s, i) => s + i.qty * i.unitCost, 0)),
});

export const purchases = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    const list = await ctx.db
      .query("posPurchases")
      .withIndex("by_company_created", (q) => q.eq("company", company))
      .order("desc")
      .take(100);
    return list.map(publicPurchase);
  },
});

async function itemsFor(
  ctx: QueryCtx,
  company: string,
  items: { productId: string; qty: number; unitCost: number }[]
) {
  if (items.length > 300) {
    throw new ConvexError("Até 300 itens por compra.");
  }
  const out: Doc<"posPurchases">["items"] = [];
  for (const i of items) {
    if (!(i.qty > 0 && i.unitCost >= 0)) {
      continue;
    }
    const p = await productByCid(ctx, i.productId);
    if (!(p && inBusiness(p, company))) {
      throw new ConvexError("Produto não encontrado.");
    }
    out.push({
      productId: p.cid,
      name: p.name,
      qty: r4(i.qty),
      unitCost: r4(i.unitCost),
    });
  }
  return out;
}

/** Creates or edits a draft purchase order. */
export const savePurchase = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    id: v.optional(v.id("posPurchases")),
    supplierId: v.optional(v.id("posSuppliers")),
    items: v.array(purchaseItem),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { session, company, id, supplierId, items, note }) => {
    const user = await requireStaff(ctx, session, "stock", company);
    const supplier = supplierId ? await ctx.db.get(supplierId) : null;
    if (supplierId && !(supplier && supplier.company === company)) {
      throw new ConvexError("Fornecedor não encontrado.");
    }
    const lines = await itemsFor(ctx, company, items);
    const fields = {
      supplierId: supplier?._id,
      supplierName: supplier?.name ?? "Sem fornecedor",
      items: lines,
      note: note?.trim().slice(0, 1000) || undefined,
    };
    if (id) {
      const cur = await ctx.db.get(id);
      if (!cur || cur.company !== company) {
        throw new ConvexError("Compra não encontrada.");
      }
      if (cur.status !== "draft") {
        throw new ConvexError("Só dá para editar compras em rascunho.");
      }
      await ctx.db.patch(id, fields);
      return id;
    }
    const [last] = await ctx.db
      .query("posPurchases")
      .withIndex("by_company_created", (q) => q.eq("company", company))
      .order("desc")
      .take(1);
    return await ctx.db.insert("posPurchases", {
      company,
      number: (last?.number ?? 0) + 1,
      status: "draft",
      createdAt: Date.now(),
      createdBy: user.name,
      ...fields,
    });
  },
});

export const setPurchaseStatus = mutation({
  args: {
    session: v.string(),
    id: v.id("posPurchases"),
    status: v.union(v.literal("ordered"), v.literal("cancelled")),
  },
  handler: async (ctx, { session, id, status }) => {
    const cur = await ctx.db.get(id);
    if (!cur) {
      throw new ConvexError("Compra não encontrada.");
    }
    const user = await requireStaff(ctx, session, "stock", cur.company);
    if (cur.status === "received" || cur.status === "cancelled") {
      throw new ConvexError("Esta compra já foi finalizada.");
    }
    if (status === "ordered" && cur.items.length === 0) {
      throw new ConvexError("Adicione produtos antes de enviar o pedido.");
    }
    await ctx.db.patch(id, {
      status,
      ...(status === "ordered" ? { orderedAt: Date.now() } : {}),
    });
    await audit(
      ctx,
      user,
      status === "ordered" ? "Enviou pedido de compra" : "Cancelou compra",
      `#${cur.number} · ${cur.supplierName}`,
      cur.company
    );
  },
});

/** Receives a purchase: adds what arrived to the stock (average cost). */
export const receivePurchase = mutation({
  args: {
    session: v.string(),
    id: v.id("posPurchases"),
    received: v.array(
      v.object({ productId: v.string(), qty: v.number(), unitCost: v.number() })
    ),
  },
  handler: async (ctx, { session, id, received }) => {
    const cur = await ctx.db.get(id);
    if (!cur) {
      throw new ConvexError("Compra não encontrada.");
    }
    const user = await requireStaff(ctx, session, "stock", cur.company);
    if (cur.status === "received" || cur.status === "cancelled") {
      throw new ConvexError("Esta compra já foi finalizada.");
    }
    const got = new Map(received.map((r) => [r.productId, r]));
    const items: Doc<"posPurchases">["items"] = [];
    for (const i of cur.items) {
      const r = got.get(i.productId);
      const qty = Math.max(0, r ? r.qty : i.qty);
      const unitCost = Math.max(0, r ? r.unitCost : i.unitCost);
      items.push({ ...i, unitCost: r4(unitCost), received: r4(qty) });
      const p = await productByCid(ctx, i.productId);
      if (p && qty > 0) {
        await addStock(
          ctx,
          p,
          qty,
          unitCost,
          `Compra #${cur.number} · ${cur.supplierName}`,
          user.name,
          "purchase"
        );
      }
    }
    await ctx.db.patch(id, {
      items,
      status: "received",
      receivedAt: Date.now(),
      receivedBy: user.name,
    });
    await audit(
      ctx,
      user,
      "Recebeu compra",
      `#${cur.number} · ${cur.supplierName}`,
      cur.company
    );
  },
});

/* ------------------------------- stock takes ----------------------------- */

const publicCount = ({
  _id,
  _creationTime,
  company: _c,
  ...c
}: Doc<"posCounts">) => {
  const counted = c.items.filter((i) => i.counted !== null);
  const diffValue = r2(
    counted.reduce(
      (s, i) => s + ((i.counted ?? 0) - i.expected) * i.unitCost,
      0
    )
  );
  return {
    id: _id,
    ...c,
    countedItems: counted.length,
    differences: counted.filter((i) => i.counted !== i.expected).length,
    diffValue,
  };
};

export const counts = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["stock", "products"], company);
    const list = await ctx.db
      .query("posCounts")
      .withIndex("by_company_created", (q) => q.eq("company", company))
      .order("desc")
      .take(50);
    return list.map(publicCount);
  },
});

/** Starts a stock take of the tracked products (optionally one category). */
export const startCount = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { session, company, category }) => {
    const user = await requireStaff(ctx, session, "stock", company);
    const products = (await productsOf(ctx, company)).filter(
      (p) => p.trackStock && (!category || p.category === category)
    );
    if (products.length === 0) {
      throw new ConvexError(
        "Nenhum produto com controle de estoque para contar."
      );
    }
    const [last] = await ctx.db
      .query("posCounts")
      .withIndex("by_company_created", (q) => q.eq("company", company))
      .order("desc")
      .take(1);
    const now = Date.now();
    const id = await ctx.db.insert("posCounts", {
      company,
      number: (last?.number ?? 0) + 1,
      name: category ? `Contagem · ${category}` : "Contagem geral",
      status: "open",
      items: products
        .sort(
          (a, b) =>
            a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
        )
        .map((p) => ({
          productId: p.cid,
          name: p.name,
          category: p.category,
          unit: p.unit,
          expected: p.stock ?? 0,
          counted: null,
          unitCost: p.cost ?? 0,
        })),
      createdAt: now,
      createdBy: user.name,
    });
    await audit(ctx, user, "Iniciou contagem de estoque", "", company);
    return id;
  },
});

/** Saves counted quantities (null = not counted yet). */
export const saveCount = mutation({
  args: {
    session: v.string(),
    id: v.id("posCounts"),
    counts: v.array(
      v.object({
        productId: v.string(),
        counted: v.union(v.number(), v.null()),
      })
    ),
  },
  handler: async (ctx, { session, id, counts: entered }) => {
    const cur = await ctx.db.get(id);
    if (!cur) {
      throw new ConvexError("Contagem não encontrada.");
    }
    await requireStaff(ctx, session, "stock", cur.company);
    if (cur.status !== "open") {
      throw new ConvexError("Esta contagem já foi fechada.");
    }
    const map = new Map(entered.map((c) => [c.productId, c.counted]));
    await ctx.db.patch(id, {
      items: cur.items.map((i) =>
        map.has(i.productId)
          ? {
              ...i,
              counted: (() => {
                const n = map.get(i.productId);
                return n === null || n === undefined
                  ? null
                  : Math.max(0, r4(n));
              })(),
            }
          : i
      ),
    });
  },
});

/** Closes the count: each counted product gets the counted stock. */
export const closeCount = mutation({
  args: { session: v.string(), id: v.id("posCounts") },
  handler: async (ctx, { session, id }) => {
    const cur = await ctx.db.get(id);
    if (!cur) {
      throw new ConvexError("Contagem não encontrada.");
    }
    const user = await requireStaff(ctx, session, "stock", cur.company);
    if (cur.status !== "open") {
      throw new ConvexError("Esta contagem já foi fechada.");
    }
    let changed = 0;
    for (const i of cur.items) {
      if (i.counted === null) {
        continue;
      }
      const p = await productByCid(ctx, i.productId);
      if (!p) {
        continue;
      }
      // Against the stock now (sales may have happened while counting)
      const delta = r4(i.counted - (p.stock ?? 0));
      if (delta !== 0) {
        changed++;
        await addStock(
          ctx,
          p,
          delta,
          undefined,
          `Contagem #${cur.number}`,
          user.name,
          "count"
        );
      }
    }
    await ctx.db.patch(id, {
      status: "closed",
      closedAt: Date.now(),
      closedBy: user.name,
    });
    await audit(
      ctx,
      user,
      "Fechou contagem de estoque",
      `#${cur.number}: ${changed} ajustes`,
      cur.company
    );
    return { changed };
  },
});

export const deleteCount = mutation({
  args: { session: v.string(), id: v.id("posCounts") },
  handler: async (ctx, { session, id }) => {
    const cur = await ctx.db.get(id);
    if (!cur) {
      return;
    }
    await requireStaff(ctx, session, "stock", cur.company);
    if (cur.status !== "open") {
      throw new ConvexError("Contagens fechadas ficam no histórico.");
    }
    await ctx.db.delete(id);
  },
});

/* --------------------------------- recipes ------------------------------- */

/** Sets a product's recipe (technical sheet). */
export const saveRecipe = mutation({
  args: {
    session: v.string(),
    productId: v.string(),
    recipe: v.array(v.object({ productId: v.string(), qty: v.number() })),
  },
  handler: async (ctx, { session, productId, recipe }) => {
    const p = await productByCid(ctx, productId);
    if (!p) {
      throw new ConvexError("Produto não encontrado.");
    }
    const company = p.company ?? MAIN;
    const user = await requireStaff(
      ctx,
      session,
      ["products", "stock"],
      company
    );
    const lines: { productId: string; qty: number }[] = [];
    for (const r of recipe.slice(0, 40)) {
      if (r.productId === productId || !(r.qty > 0)) {
        continue;
      }
      const ing = await productByCid(ctx, r.productId);
      if (!(ing && inBusiness(ing, company))) {
        throw new ConvexError("Ingrediente não encontrado.");
      }
      lines.push({ productId: ing.cid, qty: r4(r.qty) });
    }
    await ctx.db.patch(p._id, {
      recipe: lines.length ? lines : undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "Ficha técnica", p.name, company);
  },
});

/** Cost of a recipe from its ingredients' current costs. */
export const recipeCost = query({
  args: { session: v.optional(v.string()), productId: v.string() },
  handler: async (ctx, { session, productId }) => {
    const p = await productByCid(ctx, productId);
    if (!p) {
      return null;
    }
    await requireStaff(ctx, session, ["products", "stock"], p.company ?? MAIN);
    let cost = 0;
    const lines: {
      productId: string;
      name: string;
      qty: number;
      unit: string;
      cost: number;
    }[] = [];
    for (const r of p.recipe ?? []) {
      const ing = await productByCid(ctx, r.productId);
      const c = r2((ing?.cost ?? 0) * r.qty);
      cost += c;
      lines.push({
        productId: r.productId,
        name: ing?.name ?? "?",
        qty: r.qty,
        unit: ing?.unit ?? "un",
        cost: c,
      });
    }
    const total = r2(cost);
    return {
      lines,
      cost: total,
      price: p.price,
      margin: p.price > 0 ? r2(((p.price - total) / p.price) * 100) : null,
    };
  },
});

export type SupplierId = Id<"posSuppliers">;
