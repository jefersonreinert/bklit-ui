import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
  query,
} from "./_generated/server";
import { audit, canReadPos, requireStaff } from "./access";
import type { Perm } from "./access";
import { ENDPOINT_ID, lskCall } from "./lightspeed";

/**
 * Lightspeed mode, part 2: the app controls the Lightspeed POS. Orders
 * go to a table (or add to an open check), checks are closed with a
 * payment, back-office items are created and edited, and messages reach
 * the register screen or printer. Every send gets a unique reference and
 * a row in lskOps, so a double tap or a retry never sends twice; the
 * POS's confirmation arrives through our webhook (/lightspeed/webhook).
 */

const REF = /^[\w-]{8,80}$/;

async function linkedFor(
  ctx: MutationCtx,
  session: string,
  company: string,
  perm: Perm | Perm[]
) {
  const user = await requireStaff(ctx, session, perm, company);
  const loc = await ctx.db
    .query("lskLocations")
    .withIndex("by_company", (q) => q.eq("company", company))
    .first();
  if (!loc?.enabled) {
    throw new ConvexError("Este bar não está ligado ao Lightspeed.");
  }
  const auth = await ctx.db
    .query("lskAuth")
    .withIndex("by_key", (q) => q.eq("key", "main"))
    .unique();
  if (!auth?.refreshToken) {
    throw new ConvexError("O Lightspeed está desconectado. Reconecte em Configurações.");
  }
  return { user, loc };
}

/** Creates the operation once per reference and starts the send. */
async function enqueue(
  ctx: MutationCtx,
  op: Omit<Doc<"lskOps">, "_id" | "_creationTime" | "status" | "createdAt" | "updatedAt">
) {
  if (!REF.test(op.ref)) {
    throw new ConvexError("Referência inválida.");
  }
  const same = await ctx.db
    .query("lskOps")
    .withIndex("by_ref", (q) => q.eq("ref", op.ref))
    .unique();
  if (same) {
    return same._id;
  }
  const now = Date.now();
  const id = await ctx.db.insert("lskOps", {
    ...op,
    status: "sending",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.lightspeedops.run, { id });
  return id;
}

const lineV = v.object({
  sku: v.string(),
  qty: v.number(),
  name: v.string(),
  price: v.number(),
});

/** A new order on a table, or more items on an open check (account). */
export const sendOrder = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    ref: v.string(),
    table: v.optional(v.string()),
    covers: v.optional(v.number()),
    account: v.optional(v.string()),
    note: v.optional(v.string()),
    items: v.array(lineV),
  },
  handler: async (ctx, a) => {
    const { user, loc } = await linkedFor(ctx, a.session, a.company, "orders");
    const items = a.items
      .filter((i) => i.sku && i.qty > 0)
      .slice(0, 100)
      .map((i) => ({ ...i, qty: Math.min(99, Math.round(i.qty)) }));
    if (!items.length) {
      throw new ConvexError("Adicione pelo menos um item.");
    }
    if (!(a.table || a.account)) {
      throw new ConvexError("Escolha a mesa.");
    }
    const count = items.reduce((s, i) => s + i.qty, 0);
    return await enqueue(ctx, {
      locationId: loc.locationId,
      company: a.company,
      ref: a.ref,
      kind: "order",
      summary: `${a.account ? "Itens na conta" : "Pedido"}${a.table ? ` · mesa ${a.table}` : ""} · ${count} ${count === 1 ? "item" : "itens"}`,
      payload: {
        items,
        covers: a.covers ? Math.max(1, Math.min(50, Math.round(a.covers))) : undefined,
        note: a.note?.slice(0, 200) || undefined,
      },
      table: a.table?.slice(0, 12),
      account: a.account,
      by: user.name,
    });
  },
});

/** Pays (and so closes, when it covers the total) an open check. */
export const payCheck = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    ref: v.string(),
    account: v.string(),
    table: v.optional(v.string()),
    method: v.string(),
    amount: v.number(),
    tip: v.number(),
  },
  handler: async (ctx, a) => {
    const { user, loc } = await linkedFor(ctx, a.session, a.company, "charge");
    if (!(a.amount > 0 && a.amount < 100_000 && a.tip >= 0 && a.tip < 10_000)) {
      throw new ConvexError("Valor inválido.");
    }
    const methods = (loc.paymentMethods ?? []) as { code: string; name: string }[];
    if (methods.length && !methods.some((m) => m.code === a.method)) {
      throw new ConvexError("Forma de pagamento desconhecida no Lightspeed.");
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const name = methods.find((m) => m.code === a.method)?.name ?? a.method;
    return await enqueue(ctx, {
      locationId: loc.locationId,
      company: a.company,
      ref: a.ref,
      kind: "payment",
      summary: `Pagamento ${name} · ${r2(a.amount).toFixed(2)}${a.tip ? ` + gorjeta ${r2(a.tip).toFixed(2)}` : ""}${a.table ? ` · mesa ${a.table}` : ""}`,
      payload: { method: a.method, amount: r2(a.amount), tip: r2(a.tip) },
      table: a.table,
      account: a.account,
      by: user.name,
    });
  },
});

/** Message on the register screen (and printer). */
export const printMessage = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    ref: v.string(),
    message: v.string(),
    toPrinter: v.boolean(),
  },
  handler: async (ctx, a) => {
    const { user, loc } = await linkedFor(ctx, a.session, a.company, "orders");
    const message = a.message.trim().slice(0, 500);
    if (!message) {
      throw new ConvexError("Escreva a mensagem.");
    }
    return await enqueue(ctx, {
      locationId: loc.locationId,
      company: a.company,
      ref: a.ref,
      kind: "message",
      summary: `Mensagem${a.toPrinter ? " (e impressora)" : ""}: ${message.slice(0, 60)}`,
      payload: { message, toPrinter: a.toPrinter },
      by: user.name,
    });
  },
});

/** Creates or edits a back-office item (name, SKU, price, cost…). */
export const saveItem = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    ref: v.string(),
    itemId: v.optional(v.number()),
    name: v.string(),
    sku: v.string(),
    barcode: v.optional(v.string()),
    price: v.number(),
    cost: v.optional(v.number()),
    active: v.boolean(),
    groupId: v.number(),
  },
  handler: async (ctx, a) => {
    const { user, loc } = await linkedFor(ctx, a.session, a.company, "products");
    const name = a.name.trim().slice(0, 80);
    const sku = a.sku.trim().slice(0, 40);
    if (!name) {
      throw new ConvexError("Dê um nome ao item.");
    }
    if (a.itemId !== undefined && !sku) {
      throw new ConvexError("O SKU é obrigatório para editar.");
    }
    if (!(a.price >= 0 && a.price < 100_000) || (a.cost !== undefined && !(a.cost >= 0))) {
      throw new ConvexError("Preço ou custo inválido.");
    }
    return await enqueue(ctx, {
      locationId: loc.locationId,
      company: a.company,
      ref: a.ref,
      kind: "item",
      summary: `${a.itemId === undefined ? "Novo item" : "Item editado"}: ${name}`,
      payload: {
        itemId: a.itemId,
        name,
        sku: sku || undefined,
        barcode: a.barcode?.trim() || undefined,
        price: Math.round(a.price * 100) / 100,
        cost: a.cost === undefined ? undefined : Math.round(a.cost * 100) / 100,
        active: a.active,
        groupId: a.groupId,
      },
      by: user.name,
    });
  },
});

/** Lightspeed sales take stock out of the independent inventory. */
export const setStockFromSales = mutation({
  args: { session: v.string(), company: v.string(), on: v.boolean() },
  handler: async (ctx, { session, company, on }) => {
    const { user, loc } = await linkedFor(ctx, session, company, "stock");
    await ctx.db.patch(loc._id, { stockFromSales: on, updatedAt: Date.now() });
    await audit(
      ctx,
      user,
      on ? "Estoque pelas vendas do Lightspeed: ligado" : "Estoque pelas vendas do Lightspeed: desligado",
      loc.name,
      company
    );
  },
});

/* --------------------------------- reads ---------------------------------- */

async function locFor(ctx: QueryCtx, session: string | undefined, company: string) {
  if (!(await canReadPos(ctx, session, company))) {
    return null;
  }
  const loc = await ctx.db
    .query("lskLocations")
    .withIndex("by_company", (q) => q.eq("company", company))
    .first();
  return loc?.enabled ? loc : null;
}

export const options = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const loc = await locFor(ctx, session, company);
    if (!loc) {
      return null;
    }
    const catalog = await ctx.db
      .query("lskCatalog")
      .withIndex("by_location", (q) => q.eq("locationId", loc.locationId))
      .take(5000);
    const own = new Set(
      (
        await ctx.db
          .query("posProducts")
          .withIndex("by_company", (q) => q.eq("company", company))
          .take(5000)
      )
        .map((p) => p.sku)
        .filter(Boolean)
    );
    const sold = catalog.filter((i) => i.active && i.sku);
    return {
      paymentMethods: (loc.paymentMethods ?? []) as { code: string; name: string }[],
      accountingGroups: (loc.accountingGroups ?? []) as { id: number; name: string }[],
      stockFromSales: Boolean(loc.stockFromSales),
      webhook: Boolean(loc.webhookAt),
      skus: sold.length,
      unmatched: sold.filter((i) => !own.has(i.sku)).length,
    };
  },
});

export const catalog = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const loc = await locFor(ctx, session, company);
    if (!loc) {
      return null;
    }
    return await ctx.db
      .query("lskCatalog")
      .withIndex("by_location", (q) => q.eq("locationId", loc.locationId))
      .take(5000);
  },
});

export const ops = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const loc = await locFor(ctx, session, company);
    if (!loc) {
      return null;
    }
    const rows = await ctx.db
      .query("lskOps")
      .withIndex("by_location_created", (q) => q.eq("locationId", loc.locationId))
      .order("desc")
      .take(40);
    return rows.map((r) => ({
      id: r._id,
      ref: r.ref,
      kind: r.kind,
      status: r.status,
      summary: r.summary,
      result: r.result ?? null,
      by: r.by,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },
});

/* --------------------------------- sending -------------------------------- */

export const getOp = internalQuery({
  args: { id: v.id("lskOps") },
  handler: async (ctx, { id }) => {
    const op = await ctx.db.get(id);
    if (!op) {
      return null;
    }
    const loc = await ctx.db
      .query("lskLocations")
      .withIndex("by_location", (q) => q.eq("locationId", op.locationId))
      .unique();
    return { op, loc };
  },
});

export const setOp = internalMutation({
  args: {
    id: v.optional(v.id("lskOps")),
    ref: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("done"), v.literal("failed")),
    result: v.optional(v.string()),
    account: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const op = a.id
      ? await ctx.db.get(a.id)
      : a.ref
        ? await ctx.db
            .query("lskOps")
            .withIndex("by_ref", (q) => q.eq("ref", a.ref as string))
            .unique()
        : null;
    if (!op) {
      return null;
    }
    // A final state is never overwritten by a late "sent"
    if (a.status === "sent" && (op.status === "done" || op.status === "failed")) {
      return op._id;
    }
    await ctx.db.patch(op._id, {
      status: a.status,
      result: a.result?.slice(0, 300),
      ...(a.account ? { account: a.account } : {}),
      updatedAt: Date.now(),
    });
    return op._id;
  },
});

export const run = internalAction({
  args: { id: v.id("lskOps") },
  handler: async (ctx, { id }) => {
    const found = await ctx.runQuery(internal.lightspeedops.getOp, { id });
    if (!found?.loc || found.op.status !== "sending") {
      return;
    }
    const { op, loc } = found;
    const location = loc.locationId;
    const p = op.payload as Record<string, unknown>;
    try {
      if (op.kind === "order") {
        const items = p.items as { sku: string; qty: number }[];
        await lskCall(ctx, "POST", "/o/op/1/order/local", {}, {
          businessLocationId: location,
          thirdPartyReference: op.ref,
          endpointId: ENDPOINT_ID,
          customerInfo: { firstName: op.table ? `Mesa ${op.table}` : "Casa Brasa" },
          ...(op.account ? { accountIdentifier: op.account } : { tableNumber: op.table }),
          ...(p.covers ? { clientCount: p.covers } : {}),
          ...(p.note ? { orderNote: p.note } : {}),
          items: items.map((i) => ({ sku: i.sku, quantity: i.qty })),
        });
        await ctx.runMutation(internal.lightspeedops.setOp, {
          id,
          status: "sent",
          result: "Enviado; aguardando o POS confirmar.",
        });
      } else if (op.kind === "payment") {
        await lskCall(ctx, "POST", "/o/op/1/pay", {}, {
          iKaccountIdentifier: op.account,
          thirdPartyPaymentReference: op.ref,
          endpointId: ENDPOINT_ID,
          businessLocationId: location,
          paymentMethod: p.method,
          paymentAmount: p.amount,
          tipAmount: p.tip || undefined,
        });
        await ctx.runMutation(internal.lightspeedops.setOp, {
          id,
          status: "sent",
          result: "Enviado; aguardando o POS confirmar.",
        });
      } else if (op.kind === "message") {
        await lskCall(
          ctx,
          "POST",
          "/o/op/1/printMsg",
          { businessLocationId: String(location) },
          { message: p.message, alsoToPrinter: p.toPrinter }
        );
        await ctx.runMutation(internal.lightspeedops.setOp, { id, status: "done", result: "Entregue ao POS." });
      } else if (op.kind === "item") {
        const body = {
          name: p.name,
          businessLocationId: location,
          sku: p.sku,
          barcode: p.barcode,
          active: p.active,
          accountingGroupId: p.groupId,
          costPrice: p.cost,
          defaultPrice: p.price,
          priceMode: "AMOUNT",
        };
        const res = p.itemId
          ? await lskCall(ctx, "PUT", `/items/v1/items/${p.itemId}`, {}, body)
          : await lskCall(ctx, "POST", "/items/v1/items", {}, body);
        await ctx.runMutation(internal.lightspeedops.setOp, {
          id,
          status: "done",
          result: p.itemId ? "Item atualizado no Lightspeed." : `Item criado (#${(res as { id?: number })?.id ?? "?"}).`,
        });
        await ctx.runMutation(internal.lightspeedops.catalogStale, { locationId: location });
      }
    } catch (err) {
      await ctx.runMutation(internal.lightspeedops.setOp, {
        id,
        status: "failed",
        result: (err as Error).message,
      });
      return;
    }
    // The check list catches up a little later
    if (op.kind === "order" || op.kind === "payment") {
      await ctx.scheduler.runAfter(15_000, internal.lightspeed.syncLocation, { locationId: location });
    }
  },
});

export const catalogStale = internalMutation({
  args: { locationId: v.number() },
  handler: async (ctx, { locationId }) => {
    const loc = await ctx.db
      .query("lskLocations")
      .withIndex("by_location", (q) => q.eq("locationId", locationId))
      .unique();
    if (loc) {
      await ctx.db.patch(loc._id, { catalogAt: undefined, menuAt: undefined });
      await ctx.scheduler.runAfter(0, internal.lightspeed.syncLocation, { locationId });
    }
  },
});

export const webhookAuth = internalQuery({
  args: {},
  handler: async (ctx) => {
    const a = await ctx.db
      .query("lskAuth")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    return a?.webhookSecret ?? null;
  },
});

const DONE = new Set(["SUCCESS", "CLOSED", "READY_FOR_PICKUP"]);
const FAILED = new Set(["FAILURE", "ABANDONED", "CANCELLED"]);

/** POST /lightspeed/webhook?k=… — order and payment notifications. */
export const webhook = httpAction(async (ctx, request) => {
  const secret = await ctx.runQuery(internal.lightspeedops.webhookAuth, {});
  const k = new URL(request.url).searchParams.get("k") ?? "";
  if (!(secret && k.length === secret.length && k === secret)) {
    return new Response("forbidden", { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > 500_000) {
    return new Response("too large", { status: 413 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const ref = String(body.thirdPartyReference ?? body.thirdPartyPaymentReference ?? "");
  const status = String(body.status ?? "");
  if (ref && (DONE.has(status) || FAILED.has(status))) {
    const errors = body.errors as { account?: { type?: string }; timeout?: { message?: string } } | undefined;
    const reason = String(body.reason ?? errors?.account?.type ?? errors?.timeout?.message ?? "");
    const id: Id<"lskOps"> | null = await ctx.runMutation(internal.lightspeedops.setOp, {
      ref,
      status: DONE.has(status) ? "done" : "failed",
      result: DONE.has(status) ? "Confirmado pelo POS." : `Recusado pelo POS${reason ? `: ${reason}` : ""}.`,
      account: body.ikentooAccountIdentifier ? String(body.ikentooAccountIdentifier) : undefined,
    });
    const location = Number(body.businessLocationId);
    if (id && Number.isFinite(location)) {
      await ctx.scheduler.runAfter(0, internal.lightspeed.syncLocation, { locationId: location });
    }
  }
  return new Response("ok");
});
