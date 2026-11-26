import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server";
import { audit, type Perm, requireStaff } from "./access";
import { groupOf } from "./inv";
import { cutout } from "./media";

/**
 * Bar equipment of each business: glasses, shakers, bar spoons, strainers,
 * jiggers, machines… with a photo (background can be removed), how many
 * there are, what was paid and to whom. Every change is a move (purchase,
 * broken, lost, count), so the history and the money spent stay.
 */

const READ: Perm[] = ["stock", "products", "reports"];
const EDIT: Perm[] = ["stock", "products"];
const MAX = 2000;
/** Largest photo accepted (the browser sends ≈ 100–600 KB). */
const MAX_BYTES = 6 * 1024 * 1024;

const clean = (s: string | undefined, max = 120) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
const pieces = (n: number) => Math.max(0, Math.round(n));

async function mine(ctx: MutationCtx, id: Id<"equipment">, company: string) {
  const e = await ctx.db.get(id);
  if (!e || e.company !== company) {
    throw new ConvexError("Equipamento não encontrado.");
  }
  return e;
}

/** Everything of the bar, with totals and the moves of the last year. */
export const list = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const user = await requireStaff(ctx, session, READ, company);
    const admin = user.perms.includes("users");
    const seePrices = admin || ["stock", "reports"].some((p) => user.perms.includes(p as Perm));
    const rows = await ctx.db
      .query("equipment")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(MAX);
    const since = Date.now() - 365 * 86_400_000;
    const moves = await ctx.db
      .query("equipmentMoves")
      .withIndex("by_company", (q) => q.eq("company", company).gte("at", since))
      .take(5000);
    const spent = new Map<string, number>();
    const broken = new Map<string, number>();
    for (const m of moves) {
      if (m.kind === "purchase" && m.unitPrice !== undefined) {
        spent.set(m.equipmentId, (spent.get(m.equipmentId) ?? 0) + m.qty * m.unitPrice);
      }
      if (m.kind === "broken" || m.kind === "lost") {
        broken.set(m.equipmentId, (broken.get(m.equipmentId) ?? 0) - m.qty);
      }
    }
    // Suppliers of the group, to suggest in the form
    const group = (await groupOf(ctx, company))?.key ?? company;
    const suppliers = await ctx.db
      .query("invSuppliers")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(500);
    const names = new Set(suppliers.filter((s) => s.active).map((s) => s.name));
    for (const r of rows) {
      if (r.supplier) names.add(r.supplier);
    }
    return {
      canEdit: admin || EDIT.some((p) => user.perms.includes(p)),
      seePrices,
      suppliers: [...names].sort((a, b) => a.localeCompare(b)),
      items: rows.map((r) => ({
        id: r._id,
        name: r.name,
        category: r.category,
        description: r.description ?? "",
        quantity: r.quantity,
        minQty: r.minQty ?? 0,
        unitPrice: seePrices ? (r.unitPrice ?? null) : null,
        supplier: r.supplier ?? "",
        image: r.image ?? "",
        active: r.active,
        spentYear: seePrices ? Math.round((spent.get(r._id) ?? 0) * 100) / 100 : null,
        brokenYear: broken.get(r._id) ?? 0,
        updatedAt: r.updatedAt,
      })),
    };
  },
});

/** The moves of one piece of equipment, newest first. */
export const history = query({
  args: { session: v.optional(v.string()), company: v.string(), id: v.id("equipment") },
  handler: async (ctx, { session, company, id }) => {
    const user = await requireStaff(ctx, session, READ, company);
    const e = await ctx.db.get(id);
    if (!e || e.company !== company) {
      return [];
    }
    const seePrices = user.perms.includes("users") || ["stock", "reports"].some((p) => user.perms.includes(p as Perm));
    const moves = await ctx.db
      .query("equipmentMoves")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", id))
      .order("desc")
      .take(200);
    return moves.map((m) => ({
      id: m._id,
      kind: m.kind,
      qty: m.qty,
      after: m.after,
      unitPrice: seePrices ? (m.unitPrice ?? null) : null,
      supplier: m.supplier ?? "",
      date: m.date,
      note: m.note ?? "",
      by: m.by,
    }));
  },
});

/** Create or edit (name, category, description, minimum). */
export const save = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.optional(v.id("equipment")),
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    minQty: v.optional(v.number()),
    /** Only when creating: first purchase / what is there now. */
    start: v.optional(
      v.object({
        quantity: v.number(),
        unitPrice: v.optional(v.number()),
        supplier: v.optional(v.string()),
        date: v.optional(v.string()),
      })
    ),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, EDIT, a.company);
    const name = clean(a.name, 80);
    if (!name) {
      throw new ConvexError("Dê um nome ao equipamento.");
    }
    const now = Date.now();
    const fields = {
      name,
      category: clean(a.category, 40) || "Outros",
      description: clean(a.description, 600) || undefined,
      minQty: a.minQty !== undefined && a.minQty > 0 ? pieces(a.minQty) : undefined,
      updatedAt: now,
    };
    if (a.id) {
      await mine(ctx, a.id, a.company);
      await ctx.db.patch(a.id, fields);
      return a.id;
    }
    const qty = pieces(a.start?.quantity ?? 0);
    const unitPrice = money(a.start?.unitPrice);
    const supplier = clean(a.start?.supplier, 80) || undefined;
    const id = await ctx.db.insert("equipment", {
      company: a.company,
      ...fields,
      quantity: qty,
      unitPrice,
      supplier,
      active: true,
      createdAt: now,
    });
    if (qty > 0) {
      await ctx.db.insert("equipmentMoves", {
        company: a.company,
        equipmentId: id,
        kind: "purchase",
        qty,
        after: qty,
        unitPrice,
        supplier,
        date: clean(a.start?.date, 10) || today(),
        note: "Cadastro inicial",
        by: user.name,
        at: now,
      });
    }
    if (a.storageId) {
      await setPhotoOf(ctx, id, a.storageId);
    }
    await audit(ctx, user, "Equipamento criado", `${name} (${qty})`, a.company);
    return id;
  },
});

/** Purchase (+), broken / lost (−) or a count (sets the quantity). */
export const move = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.id("equipment"),
    kind: v.union(v.literal("purchase"), v.literal("broken"), v.literal("lost"), v.literal("count")),
    qty: v.number(),
    unitPrice: v.optional(v.number()),
    supplier: v.optional(v.string()),
    date: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, EDIT, a.company);
    const e = await mine(ctx, a.id, a.company);
    const n = pieces(a.qty);
    let delta: number;
    if (a.kind === "count") {
      delta = n - e.quantity;
    } else if (a.kind === "purchase") {
      delta = n;
    } else {
      delta = -Math.min(n, e.quantity);
    }
    if (a.kind !== "count" && n <= 0) {
      throw new ConvexError("Informe a quantidade.");
    }
    const after = e.quantity + delta;
    const unitPrice = a.kind === "purchase" ? money(a.unitPrice) : undefined;
    const supplier = a.kind === "purchase" ? clean(a.supplier, 80) || undefined : undefined;
    const now = Date.now();
    await ctx.db.insert("equipmentMoves", {
      company: a.company,
      equipmentId: a.id,
      kind: a.kind,
      qty: delta,
      after,
      unitPrice,
      supplier,
      date: clean(a.date, 10) || today(),
      note: clean(a.note, 300) || undefined,
      by: user.name,
      at: now,
    });
    await ctx.db.patch(a.id, {
      quantity: after,
      ...(unitPrice !== undefined ? { unitPrice } : {}),
      ...(supplier ? { supplier } : {}),
      updatedAt: now,
    });
    return after;
  },
});

/** Archive (out of use) or bring back. */
export const setActive = mutation({
  args: { session: v.optional(v.string()), company: v.string(), id: v.id("equipment"), active: v.boolean() },
  handler: async (ctx, a) => {
    const user = await requireStaff(ctx, a.session, EDIT, a.company);
    const e = await mine(ctx, a.id, a.company);
    await ctx.db.patch(a.id, { active: a.active, updatedAt: Date.now() });
    await audit(ctx, user, a.active ? "Equipamento reativado" : "Equipamento arquivado", e.name, a.company);
  },
});

/* --------------------------------- photos --------------------------------- */

export const uploadUrl = mutation({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, a) => {
    await requireStaff(ctx, a.session, EDIT, a.company);
    return await ctx.storage.generateUploadUrl();
  },
});

async function setPhotoOf(ctx: MutationCtx, id: Id<"equipment">, storageId: Id<"_storage"> | undefined) {
  const e = (await ctx.db.get(id)) as Doc<"equipment">;
  let url: string | undefined;
  if (storageId) {
    const meta = await ctx.db.system.get(storageId);
    const type = meta?.contentType ?? "";
    if (!meta || (type && !type.startsWith("image/")) || meta.size > MAX_BYTES) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("Envie uma imagem (JPG, PNG ou WebP) de até 6 MB.");
    }
    url = (await ctx.storage.getUrl(storageId)) ?? undefined;
  }
  if (e.imageId && e.imageId !== storageId) {
    await ctx.storage.delete(e.imageId);
  }
  await ctx.db.patch(id, { image: url, imageId: storageId, updatedAt: Date.now() });
  return url ?? null;
}

/** Puts (or removes, without storageId) the photo. */
export const setPhoto = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    id: v.id("equipment"),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, a) => {
    await requireStaff(ctx, a.session, EDIT, a.company);
    await mine(ctx, a.id, a.company);
    return await setPhotoOf(ctx, a.id, a.storageId);
  },
});

export const photoOf = internalQuery({
  args: { session: v.optional(v.string()), company: v.string(), id: v.id("equipment") },
  handler: async (ctx, a) => {
    await requireStaff(ctx, a.session, EDIT, a.company);
    const e = await ctx.db.get(a.id);
    if (!e || e.company !== a.company) {
      throw new ConvexError("Equipamento não encontrado.");
    }
    return e.imageId ?? null;
  },
});

export const setPhotoInternal = internalMutation({
  args: { id: v.id("equipment"), storageId: v.id("_storage") },
  handler: async (ctx, a) => await setPhotoOf(ctx, a.id, a.storageId),
});

/** Transparent background for the photo (self-hosted rembg). */
export const removeBackground = action({
  args: { session: v.optional(v.string()), company: v.string(), id: v.id("equipment") },
  handler: async (ctx, a): Promise<{ url: string | null }> => {
    const imageId = await ctx.runQuery(internal.equipment.photoOf, a);
    if (!imageId) {
      throw new ConvexError("Envie a foto primeiro.");
    }
    const photo = await ctx.storage.get(imageId);
    if (!photo) {
      throw new ConvexError("Foto não encontrada.");
    }
    const storageId = await ctx.storage.store(await cutout(photo));
    try {
      return { url: await ctx.runMutation(internal.equipment.setPhotoInternal, { id: a.id, storageId }) };
    } catch (err) {
      await ctx.storage.delete(storageId);
      throw err;
    }
  },
});
