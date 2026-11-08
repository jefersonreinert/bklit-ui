import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * Reservations CRM (panel): one guest profile across every venue, found
 * by phone or e-mail. Visits, no-shows and favourite venues come from the
 * guest's reservations. GDPR: marketing consent with its date, export of
 * everything we hold, and erasure on request (bookings anonymised).
 */

const text = (s: string | undefined, max: number) => {
  const t = s?.trim().slice(0, max);
  return t ? t : undefined;
};

/** Finds or creates the guest of a booking (by phone, then e-mail). */
export async function upsertGuest(
  ctx: MutationCtx,
  g: { name: string; phone?: string; email?: string; vip?: boolean }
) {
  if (!(g.phone || g.email)) {
    return undefined;
  }
  let guest: Doc<"resGuests"> | null = null;
  if (g.phone) {
    guest = await ctx.db
      .query("resGuests")
      .withIndex("by_phone", (q) => q.eq("phone", g.phone))
      .first();
  }
  if (!guest && g.email) {
    guest = await ctx.db
      .query("resGuests")
      .withIndex("by_email", (q) => q.eq("email", g.email))
      .first();
  }
  const now = Date.now();
  if (guest) {
    await ctx.db.patch(guest._id, {
      phone: guest.phone ?? g.phone,
      email: guest.email ?? g.email,
      vip: guest.vip || g.vip || undefined,
      updatedAt: now,
    });
    return guest._id;
  }
  return await ctx.db.insert("resGuests", {
    name: g.name,
    phone: g.phone,
    email: g.email,
    vip: g.vip || undefined,
    createdAt: now,
    updatedAt: now,
  });
}

const historyOf = (ctx: QueryCtx, id: Id<"resGuests">) =>
  ctx.db
    .query("reservations")
    .withIndex("by_guest", (q) => q.eq("guestId", id))
    .order("desc")
    .take(300);

/** Visit figures from a guest's reservations. */
export function stats(rows: Doc<"reservations">[]) {
  const visits = rows.filter((r) => ["seated", "completed"].includes(r.status));
  const venues: Record<string, number> = {};
  for (const r of visits) {
    venues[r.company] = (venues[r.company] ?? 0) + 1;
  }
  return {
    bookings: rows.length,
    visits: visits.length,
    noShows: rows.filter((r) => r.status === "no_show").length,
    cancellations: rows.filter((r) => r.status === "cancelled").length,
    lastVisit:
      visits
        .map((r) => r.date)
        .sort()
        .at(-1) ?? null,
    favourite:
      Object.entries(venues).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    avgParty: rows.length
      ? Math.round((rows.reduce((a, r) => a + r.party, 0) / rows.length) * 10) /
        10
      : 0,
  };
}

export const list = query({
  args: { q: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const q = a.q?.trim().toLowerCase() ?? "";
    const rows = await ctx.db
      .query("resGuests")
      .withIndex("by_updated")
      .order("desc")
      .take(600);
    const hits = q
      ? rows.filter((g) =>
          [g.name, g.phone, g.email].some((x) => x?.toLowerCase().includes(q))
        )
      : rows;
    return await Promise.all(
      hits.slice(0, 200).map(async (g) => ({
        id: g._id,
        name: g.name,
        phone: g.phone ?? "",
        email: g.email ?? "",
        vip: Boolean(g.vip),
        tags: g.tags ?? [],
        marketing: Boolean(g.marketing),
        ...stats(await historyOf(ctx, g._id)),
      }))
    );
  },
});

export const get = query({
  args: { id: v.id("resGuests") },
  handler: async (ctx, { id }) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const g = await ctx.db.get(id);
    if (!g) {
      return null;
    }
    const rows = await historyOf(ctx, id);
    return {
      id: g._id,
      name: g.name,
      phone: g.phone ?? "",
      email: g.email ?? "",
      vip: Boolean(g.vip),
      tags: g.tags ?? [],
      preferences: g.preferences ?? "",
      occasions: g.occasions ?? "",
      notes: g.notes ?? "",
      marketing: Boolean(g.marketing),
      consentAt: g.consentAt ?? null,
      createdAt: g.createdAt,
      stats: stats(rows),
      history: rows.map((r) => ({
        id: r._id,
        company: r.company,
        ref: r.ref,
        date: r.date,
        time: r.time,
        party: r.party,
        status: r.status,
        source: r.source,
      })),
    };
  },
});

/** The known guest for a phone or e-mail typed in a new booking. */
export const byContact = query({
  args: { phone: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const phone = a.phone?.replace(/[^\d+]/g, "");
    const email = a.email?.trim().toLowerCase();
    let g: Doc<"resGuests"> | null = null;
    if (phone && phone.length >= 6) {
      g = await ctx.db
        .query("resGuests")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .first();
    }
    if (!g && email?.includes("@")) {
      g = await ctx.db
        .query("resGuests")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
    }
    if (!g) {
      return null;
    }
    return {
      id: g._id,
      name: g.name,
      email: g.email ?? "",
      phone: g.phone ?? "",
      vip: Boolean(g.vip),
      preferences: g.preferences ?? "",
      occasions: g.occasions ?? "",
      ...stats(await historyOf(ctx, g._id)),
    };
  },
});

export const save = mutation({
  args: {
    id: v.id("resGuests"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    vip: v.boolean(),
    tags: v.array(v.string()),
    preferences: v.optional(v.string()),
    occasions: v.optional(v.string()),
    notes: v.optional(v.string()),
    marketing: v.boolean(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const g = await ctx.db.get(a.id);
    if (!g) {
      throw new ConvexError("Cliente não encontrado.");
    }
    const name = text(a.name, 80);
    if (!name) {
      throw new ConvexError("Nome é obrigatório.");
    }
    const now = Date.now();
    await ctx.db.patch(a.id, {
      name,
      phone: text(a.phone, 30)?.replace(/[^\d+]/g, ""),
      email: text(a.email, 120)?.toLowerCase(),
      vip: a.vip || undefined,
      tags: a.tags
        .map((t) => t.trim().slice(0, 30))
        .filter(Boolean)
        .slice(0, 12),
      preferences: text(a.preferences, 500),
      occasions: text(a.occasions, 200),
      notes: text(a.notes, 800),
      marketing: a.marketing,
      // The date consent was given or withdrawn (GDPR evidence)
      consentAt: a.marketing === Boolean(g.marketing) ? g.consentAt : now,
      updatedAt: now,
    });
  },
});

/** Everything held about a guest (GDPR access / portability). */
export const exportData = query({
  args: { id: v.id("resGuests") },
  handler: async (ctx, { id }) => {
    await requirePanel(ctx);
    const g = await ctx.db.get(id);
    if (!g) {
      return null;
    }
    const rows = await historyOf(ctx, id);
    const { _id, _creationTime, ...profile } = g;
    return {
      exportedAt: new Date().toISOString(),
      profile,
      reservations: rows.map(
        ({ _id: rid, _creationTime: c, guestId, customerId, ...r }) => r
      ),
    };
  },
});

/** Erases a guest (GDPR): profile deleted, bookings kept anonymised. */
export const forget = mutation({
  args: { id: v.id("resGuests") },
  handler: async (ctx, { id }) => {
    await requirePanel(ctx);
    const g = await ctx.db.get(id);
    if (!g) {
      return 0;
    }
    const rows = await historyOf(ctx, id);
    const now = Date.now();
    for (const r of rows) {
      await ctx.db.patch(r._id, {
        name: "Guest (data erased)",
        phone: undefined,
        email: undefined,
        requests: undefined,
        notes: undefined,
        occasion: undefined,
        guestId: undefined,
        customerId: undefined,
        log: [
          { at: now, by: "Painel", what: "Dados pessoais apagados (GDPR)" },
        ],
      });
    }
    await ctx.db.delete(id);
    return rows.length;
  },
});
