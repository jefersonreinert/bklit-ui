import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { audit, MAIN, meta, requireStaff } from "./access";
import { inCompany } from "./pos";

/**
 * Read-only POS API for the accountant or other systems (convex/http.ts,
 * GET /api/v1/…). Keys are made in the browser; only their SHA-256 hash is
 * stored here, so the server never sees a usable key.
 */

const HASH = /^[0-9a-f]{64}$/;
const MAX_KEYS = 20;
const DEFAULT_VAT = 18;
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------------------------- keys ---------------------------------- */

export const keys = query({
  args: { session: v.optional(v.string()), company: v.optional(v.string()) },
  handler: async (ctx, { session, company = MAIN }) => {
    await requireStaff(ctx, session, "settings", company);
    const rows = await ctx.db
      .query("posApiKeys")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(100);
    return rows
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        id: k._id,
        name: k.name,
        prefix: k.prefix,
        createdAt: k.createdAt,
        createdBy: k.createdBy,
        lastUsedAt: k.lastUsedAt,
      }));
  },
});

export const createKey = mutation({
  args: {
    session: v.string(),
    company: v.optional(v.string()),
    name: v.string(),
    prefix: v.string(),
    hash: v.string(),
  },
  handler: async (ctx, { session, company = MAIN, name, prefix, hash }) => {
    const user = await requireStaff(ctx, session, "settings", company);
    if (!HASH.test(hash)) {
      throw new ConvexError("Chave inválida.");
    }
    const active = (
      await ctx.db
        .query("posApiKeys")
        .withIndex("by_company", (q) => q.eq("company", company))
        .take(100)
    ).filter((k) => !k.revokedAt);
    if (active.length >= MAX_KEYS) {
      throw new ConvexError(`Limite de ${MAX_KEYS} chaves ativas.`);
    }
    const label = name.trim().slice(0, 60) || "Chave";
    await ctx.db.insert("posApiKeys", {
      company,
      name: label,
      prefix: prefix.slice(0, 16),
      hash,
      createdAt: Date.now(),
      createdBy: user.name,
    });
    await audit(ctx, user, "Criou chave de API", label, company);
  },
});

export const revokeKey = mutation({
  args: { session: v.string(), id: v.id("posApiKeys") },
  handler: async (ctx, { session, id }) => {
    const key = await ctx.db.get(id);
    if (!key) {
      return;
    }
    const user = await requireStaff(ctx, session, "settings", key.company);
    await ctx.db.patch(id, { revokedAt: Date.now() });
    await audit(ctx, user, "Revogou chave de API", key.name, key.company);
  },
});

/** The active key with this hash (HTTP API). */
export const keyByHash = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    const key = await ctx.db
      .query("posApiKeys")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    return key && !key.revokedAt
      ? {
          id: key._id,
          company: key.company,
          name: key.name,
          lastUsedAt: key.lastUsedAt,
        }
      : null;
  },
});

export const touchKey = internalMutation({
  args: { id: v.id("posApiKeys") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { lastUsedAt: Date.now() });
  },
});

/* ---------------------------------- data ---------------------------------- */

async function settingsOf(ctx: Parameters<typeof meta>[0], company: string) {
  const m = await meta(ctx, company);
  const s = (m?.settings ?? {}) as { currency?: string; vatRate?: number };
  const r = (m?.receipt ?? {}) as {
    businessName?: string;
    legalName?: string;
    taxId?: string;
    exoNumber?: string;
  };
  return {
    currency: s.currency ?? "EUR",
    vatRate: s.vatRate ?? DEFAULT_VAT,
    business: r.legalName || r.businessName || "",
    vatNo: r.taxId ?? "",
    exoNo: r.exoNumber ?? "",
  };
}

const iso = (ms: number | undefined) =>
  ms ? new Date(ms).toISOString() : null;

function orderOut(o: Doc<"posOrders">, vatRate: number) {
  const subtotal = r2(o.items.reduce((a, i) => a + i.price * i.qty, 0));
  const service = Math.round(subtotal * o.taxRate) / 100;
  const total = r2(subtotal + service);
  const vat = vatRate > 0 ? r2((total * vatRate) / (100 + vatRate)) : 0;
  return {
    order_no: o.number,
    fiscal_receipt_no: o.fiscalNumber ?? null,
    status: o.status,
    opened_at: iso(o.createdAt),
    closed_at: iso(o.closedAt),
    customer: o.customerName ?? null,
    items: o.items.map((i) => ({
      product_id: i.productId,
      name: i.name,
      qty: i.qty,
      unit_price: i.price,
      total: r2(i.price * i.qty),
      options: (i.mods ?? []).map((m) => m.name),
    })),
    subtotal,
    service_charge: service,
    total,
    vat_rate: vatRate,
    vat,
    net: r2(total - vat),
    tip: o.payment?.tip ?? 0,
    payment: o.payment
      ? {
          method: o.payment.method,
          amount: o.payment.amount,
          ref: o.payment.ref ?? null,
        }
      : null,
    opened_by: o.openedBy ?? null,
    closed_by: o.closedBy ?? null,
  };
}

/** Paid and cancelled orders closed in [from, to). */
export const orders = internalQuery({
  args: { company: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, { company, from, to }) => {
    const s = await settingsOf(ctx, company);
    const range = (status: Doc<"posOrders">["status"]) =>
      inCompany(company, (key) =>
        ctx.db
          .query("posOrders")
          .withIndex("by_company_status_closed", (q) =>
            q
              .eq("company", key)
              .eq("status", status)
              .gte("closedAt", from)
              .lt("closedAt", to)
          )
          .take(5000)
      );
    const [paid, voided] = await Promise.all([range("paid"), range("void")]);
    const list = [...paid, ...voided].sort((a, b) => a.closedAt - b.closedAt);
    return {
      business: s.business,
      vat_no: s.vatNo,
      exo_no: s.exoNo,
      currency: s.currency,
      count: list.length,
      orders: list.map((o) => orderOut(o, s.vatRate)),
    };
  },
});

/** Day totals kept by the POS (YYYY-MM-DD, inclusive). */
export const daily = internalQuery({
  args: { company: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, { company, from, to }) => {
    const s = await settingsOf(ctx, company);
    const days = await inCompany(company, (key) =>
      ctx.db
        .query("posDaily")
        .withIndex("by_company_day", (q) =>
          q.eq("company", key).gte("day", from).lte("day", to)
        )
        .take(400)
    );
    return {
      currency: s.currency,
      vat_rate: s.vatRate,
      days: days
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((d) => {
          const vat =
            s.vatRate > 0 ? r2((d.sales * s.vatRate) / (100 + s.vatRate)) : 0;
          return {
            day: d.day,
            orders: d.orders,
            gross_sales: d.sales,
            vat,
            net: r2(d.sales - vat),
            service_charge: d.tax,
            tips: d.tips,
            cost: d.cost,
            items: d.items,
            payment_methods: d.methods,
          };
        }),
    };
  },
});

export const products = internalQuery({
  args: { company: v.string() },
  handler: async (ctx, { company }) => {
    const s = await settingsOf(ctx, company);
    const list = await inCompany(company, (key) =>
      ctx.db
        .query("posProducts")
        .withIndex("by_company", (q) => q.eq("company", key))
        .take(3000)
    );
    return {
      currency: s.currency,
      count: list.length,
      products: list.map((p) => ({
        id: p.cid,
        name: p.name,
        category: p.category,
        price: p.price,
        available: p.available,
        sku: p.sku ?? null,
        barcode: p.barcode ?? null,
        stock: p.trackStock ? (p.stock ?? 0) : null,
      })),
    };
  },
});
