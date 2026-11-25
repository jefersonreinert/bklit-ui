import { ConvexError, v } from "convex/values";
import { normalizeName } from "../lib/inventory/match";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
} from "./_generated/server";
import { audit, companyOf, requireStaff } from "./access";
import { groupOf } from "./inv";

/**
 * Photos and brand logos of POS products and stock items. The browser
 * shrinks the picture, uploads it straight to Convex storage and calls
 * `attach`. A product and the stock item with the same name are the same
 * bottle (as with barcodes), so the picture goes on every same-name
 * product of the group's bars and on the item. A file nobody uses any more
 * is deleted.
 */

const EDIT = ["products", "stock"] as const;
/** Largest file accepted (the browser sends ≈ 100–600 KB). */
const MAX_BYTES = 6 * 1024 * 1024;

type Kind = "image" | "logo";
const ID_FIELD = { image: "imageId", logo: "logoId" } as const;

export const uploadUrl = mutation({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, a) => {
    await requireStaff(ctx, a.session, [...EDIT], a.company);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Same-name products of every bar in the group, and the group's items. */
async function sameBottle(ctx: MutationCtx, company: string, name: string) {
  const g = await groupOf(ctx, company);
  const companies = g?.companies ?? [company];
  const key = normalizeName(name);
  const products: Doc<"posProducts">[] = [];
  for (const c of companies) {
    const list = await ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", c))
      .take(5000);
    products.push(...list.filter((p) => normalizeName(p.name) === key));
  }
  const items = (
    await ctx.db
      .query("invItems")
      .withIndex("by_group", (q) => q.eq("group", g?.key ?? company))
      .take(5000)
  ).filter((i) => normalizeName(i.name) === key);
  return { products, items, companies, group: g?.key ?? company };
}

/** Whether any product or item still shows this file. */
async function stillUsed(
  ctx: MutationCtx,
  companies: string[],
  group: string,
  id: Id<"_storage">
) {
  for (const c of companies) {
    const list = await ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", c))
      .take(5000);
    if (list.some((p) => p.imageId === id || p.logoId === id)) {
      return true;
    }
  }
  const items = await ctx.db
    .query("invItems")
    .withIndex("by_group", (q) => q.eq("group", group))
    .take(5000);
  return items.some((i) => i.imageId === id || i.logoId === id);
}

const attachArgs = {
  session: v.optional(v.string()),
  company: v.string(),
  target: v.union(v.literal("product"), v.literal("item")),
  id: v.string(),
  kind: v.union(v.literal("image"), v.literal("logo")),
  storageId: v.optional(v.id("_storage")),
};

interface AttachIn {
  company: string;
  target: "product" | "item";
  id: string;
  kind: Kind;
  storageId?: Id<"_storage">;
}

/** Name of the product (POS id) or stock item, checked against the bar. */
async function nameOf(
  ctx: QueryCtx,
  a: Pick<AttachIn, "company" | "target" | "id">
) {
  if (a.target === "product") {
    const p = await ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", a.id))
      .unique();
    if (!p || companyOf(p) !== a.company) {
      throw new ConvexError("Produto não encontrado.");
    }
    return p;
  }
  const id = ctx.db.normalizeId("invItems", a.id);
  const item = id ? await ctx.db.get(id) : null;
  if (
    !item ||
    item.group !== ((await groupOf(ctx, a.company))?.key ?? a.company)
  ) {
    throw new ConvexError("Item não encontrado.");
  }
  return item;
}

async function applyMedia(
  ctx: MutationCtx,
  a: AttachIn,
  user: Pick<Doc<"posUsers">, "name">
) {
  const name = (await nameOf(ctx, a)).name;
  let url: string | undefined;
  if (a.storageId) {
    const meta = await ctx.db.system.get(a.storageId);
    // Convex keeps the upload's Content-Type; refuse anything but images
    const type = meta?.contentType ?? "";
    const ok =
      meta && (!type || type.startsWith("image/")) && meta.size <= MAX_BYTES;
    if (!ok) {
      await ctx.storage.delete(a.storageId);
      throw new ConvexError("Envie uma imagem (JPG, PNG ou WebP) de até 6 MB.");
    }
    url = (await ctx.storage.getUrl(a.storageId)) ?? undefined;
    if (!url) {
      throw new ConvexError("Não foi possível ler a imagem enviada.");
    }
  }
  const kind = a.kind as Kind;
  const idField = ID_FIELD[kind];
  const { products, items, companies, group } = await sameBottle(
    ctx,
    a.company,
    name
  );
  const old = new Set<Id<"_storage">>();
  const now = Date.now();
  const patch = { [kind]: url, [idField]: a.storageId, updatedAt: now };
  for (const doc of [...products, ...items]) {
    const prev = doc[idField];
    if (prev && prev !== a.storageId) {
      old.add(prev);
    }
    await ctx.db.patch(doc._id, patch);
  }
  for (const id of old) {
    if (!(await stillUsed(ctx, companies, group, id))) {
      await ctx.storage.delete(id);
    }
  }
  await audit(
    ctx,
    user,
    kind === "image" ? "Foto do produto" : "Logo da marca",
    `${name}: ${url ? "enviada" : "removida"} (${products.length} produtos, ${items.length} itens)`,
    a.company
  );
  return { url: url ?? null, products: products.length, items: items.length };
}

/**
 * Puts (or removes, without storageId) the photo or logo of a product
 * (by its POS id) or stock item, and of its same-name twins.
 */
export const attach = mutation({
  args: attachArgs,
  handler: async (ctx, { session, ...a }) => {
    const user = await requireStaff(ctx, session, [...EDIT], a.company);
    return await applyMedia(ctx, a, user);
  },
});

export const attachInternal = internalMutation({
  args: attachArgs,
  handler: async (ctx, { session, ...a }) => {
    const user = await requireStaff(ctx, session, [...EDIT], a.company);
    return await applyMedia(ctx, a, user);
  },
});

/* --------------------------- background removal -------------------------- */

const pick = {
  session: v.optional(v.string()),
  company: v.string(),
  target: v.union(v.literal("product"), v.literal("item")),
  id: v.string(),
  kind: v.union(v.literal("image"), v.literal("logo")),
};

/** The photo to clean (after checking the user may edit it). */
export const photoOf = internalQuery({
  args: pick,
  handler: async (ctx, { session, kind, ...a }) => {
    await requireStaff(ctx, session, [...EDIT], a.company);
    const doc = await nameOf(ctx, a);
    return doc[ID_FIELD[kind]] ?? null;
  },
});

/**
 * Removes the photo's (or logo's) background (transparent PNG) with the self-hosted
 * rembg service (/opt/rembg, U2Net, behind Caddy at REMBG_URL with
 * REMBG_KEY) and puts the result in place of the photo.
 */
export const removeBackground = action({
  args: pick,
  handler: async (ctx, a): Promise<{ url: string | null }> => {
    const imageId = await ctx.runQuery(internal.media.photoOf, a);
    if (!imageId) {
      throw new ConvexError("Envie a imagem primeiro.");
    }
    const url = process.env.REMBG_URL;
    const key = process.env.REMBG_KEY;
    if (!(url && key)) {
      throw new ConvexError("Remoção de fundo não configurada no servidor.");
    }
    const photo = await ctx.storage.get(imageId);
    if (!photo) {
      throw new ConvexError("Foto não encontrada.");
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Key": key,
        "Content-Type": photo.type || "application/octet-stream",
      },
      body: photo,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      throw new ConvexError(
        `Não consegui remover o fundo (serviço respondeu ${res.status}).`
      );
    }
    const png = new Blob([await res.arrayBuffer()], { type: "image/png" });
    const storageId = await ctx.storage.store(png);
    try {
      const r = await ctx.runMutation(internal.media.attachInternal, {
        ...a,
        storageId,
      });
      return { url: r.url };
    } catch (err) {
      await ctx.storage.delete(storageId);
      throw err;
    }
  },
});

/* ------------------------------ admin import ------------------------------ */

/** Admin (CLI): puts a stored picture on the item/products with that name. */
export const attachByName = internalMutation({
  args: {
    company: v.string(),
    name: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, a) => {
    const { products, items } = await sameBottle(ctx, a.company, a.name);
    const item = items[0];
    const product = products.find((p) => companyOf(p) === a.company);
    if (!(item || product)) {
      await ctx.storage.delete(a.storageId);
      throw new ConvexError(`Item não encontrado: ${a.name}`);
    }
    return await applyMedia(
      ctx,
      item
        ? {
            company: a.company,
            target: "item",
            id: item._id,
            kind: "image",
            storageId: a.storageId,
          }
        : {
            company: a.company,
            target: "product",
            id: product?.cid ?? "",
            kind: "image",
            storageId: a.storageId,
          },
      { name: "Admin" }
    );
  },
});

/**
 * Admin (CLI): uploads a picture (base64, e.g. a transparent PNG) and puts
 * it on the stock item and same-name products of the group.
 */
export const importPhoto = internalAction({
  args: {
    company: v.string(),
    name: v.string(),
    base64: v.string(),
    type: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<{ url: string | null }> => {
    const bytes = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0));
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: a.type ?? "image/png" })
    );
    const r = await ctx.runMutation(internal.media.attachByName, {
      company: a.company,
      name: a.name,
      storageId,
    });
    return { url: r.url };
  },
});
