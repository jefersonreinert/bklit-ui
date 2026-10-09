import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { audit, requireStaff } from "./access";

/**
 * QR vouchers: fixed amount or percent off, single or multi use, with an
 * optional expiry. Redeeming is one transaction (checks and counts the
 * use, adds the discount line), so a voucher can't be used twice at once.
 */

// No 0/O/1/I to avoid misreading a typed code
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Codes are read from QR ("CBV-XXXXXXXX") or typed. */
const PREFIX = /^CBV-/;
const NOT_CODE = /[^A-Z0-9]/g;

export const normalizeCode = (raw: string) =>
  raw.trim().toUpperCase().replace(PREFIX, "").replace(NOT_CODE, "");

const toPublic = (d: Doc<"posVouchers">) => {
  const { _id, _creationTime, ...rest } = d;
  return { id: _id, ...rest };
};

export const list = query({
  args: { session: v.optional(v.string()) },
  handler: async (ctx, { session }) => {
    await requireStaff(ctx, session, ["settings", "charge"]);
    const docs = await ctx.db
      .query("posVouchers")
      .withIndex("by_created")
      .order("desc")
      .take(300);
    return docs.map(toPublic);
  },
});

export const lookup = query({
  args: { session: v.optional(v.string()), code: v.string() },
  handler: async (ctx, { session, code }) => {
    await requireStaff(ctx, session, ["settings", "charge"]);
    const doc = await ctx.db
      .query("posVouchers")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(code)))
      .unique();
    return doc ? toPublic(doc) : null;
  },
});

export const create = mutation({
  args: {
    session: v.string(),
    kind: v.union(v.literal("amount"), v.literal("percent")),
    value: v.number(),
    label: v.string(),
    count: v.number(),
    maxUses: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { session, count, ...fields }) => {
    const user = await requireStaff(ctx, session, "settings");
    if (
      !(fields.value > 0) ||
      (fields.kind === "percent" && fields.value > 100)
    ) {
      throw new ConvexError("Valor do voucher inválido.");
    }
    const n = Math.max(1, Math.min(100, Math.floor(count)));
    const codes: string[] = [];
    for (let i = 0; i < n; i++) {
      let code = newCode();
      // Practically never collides; check anyway
      while (
        await ctx.db
          .query("posVouchers")
          .withIndex("by_code", (q) => q.eq("code", code))
          .unique()
      ) {
        code = newCode();
      }
      await ctx.db.insert("posVouchers", {
        ...fields,
        label: fields.label.trim() || "Voucher",
        maxUses: Math.max(1, Math.floor(fields.maxUses)),
        code,
        uses: 0,
        active: true,
        createdAt: Date.now(),
        createdBy: user.name,
        redemptions: [],
      });
      codes.push(code);
    }
    await audit(ctx, user, "Criou vouchers", `${n} × ${fields.label}`);
    return codes;
  },
});

export const setActive = mutation({
  args: { session: v.string(), id: v.id("posVouchers"), active: v.boolean() },
  handler: async (ctx, { session, id, active }) => {
    const user = await requireStaff(ctx, session, "settings");
    const doc = await ctx.db.get(id);
    if (doc) {
      await ctx.db.patch(id, { active });
      await audit(
        ctx,
        user,
        active ? "Reativou voucher" : "Desativou voucher",
        doc.code
      );
    }
  },
});

function problem(d: Doc<"posVouchers"> | null, now: number) {
  if (!d) {
    return "Voucher não encontrado.";
  }
  if (!d.active) {
    return "Este voucher foi desativado.";
  }
  if (d.expiresAt && d.expiresAt < now) {
    return "Este voucher expirou.";
  }
  if (d.uses >= d.maxUses) {
    return "Este voucher já foi usado.";
  }
  return null;
}

/** Applies the voucher to an open order as a discount line. */
export const redeem = mutation({
  args: { session: v.string(), orderId: v.string(), code: v.string() },
  handler: async (ctx, { session, orderId, code }) => {
    const user = await requireStaff(ctx, session, "charge");
    const now = Date.now();
    const voucher = await ctx.db
      .query("posVouchers")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(code)))
      .unique();
    const why = problem(voucher, now);
    if (why || !voucher) {
      throw new ConvexError(why ?? "Voucher inválido.");
    }
    const order = await ctx.db
      .query("posOrders")
      .withIndex("by_cid", (q) => q.eq("cid", orderId))
      .unique();
    if (!order || order.status === "paid" || order.status === "void") {
      throw new ConvexError("Pedido não encontrado ou já fechado.");
    }
    if (order.items.some((i) => i.id === `voucher:${voucher.code}`)) {
      throw new ConvexError("Este voucher já está neste pedido.");
    }
    const subtotal = order.items.reduce((a, i) => a + i.price * i.qty, 0);
    const raw =
      voucher.kind === "percent"
        ? (subtotal * voucher.value) / 100
        : voucher.value;
    const amount = Math.round(Math.min(raw, Math.max(0, subtotal)) * 100) / 100;
    if (amount <= 0) {
      throw new ConvexError("O pedido está vazio.");
    }
    await ctx.db.patch(order._id, {
      items: [
        ...order.items,
        {
          id: `voucher:${voucher.code}`,
          productId: null,
          name: `Voucher ${voucher.label} (${voucher.code})`,
          price: -amount,
          qty: 1,
          sent: true,
        },
      ],
      updatedAt: now,
    });
    await ctx.db.patch(voucher._id, {
      uses: voucher.uses + 1,
      redemptions: [
        ...voucher.redemptions,
        {
          orderCid: order.cid,
          orderNumber: order.number,
          amount,
          userName: user.name,
          at: now,
        },
      ].slice(-50),
    });
    await audit(
      ctx,
      user,
      "Usou voucher",
      `${voucher.code} · pedido ${order.number}`
    );
    return amount;
  },
});
