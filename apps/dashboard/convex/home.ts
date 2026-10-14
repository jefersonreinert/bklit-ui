import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

/**
 * Home screen wallpaper: the browser uploads the photo or video straight to
 * Convex storage, then saves it here. No access code is needed (the user
 * asked for it to work on any device), so the file is checked instead: it
 * must be a photo or video under the size limit, or it is deleted. The
 * previous file is deleted too, so only one wallpaper is ever kept. The URL
 * goes into the synced home store.
 */

const MB = 1024 * 1024;
export const MAX_BYTES = { image: 30 * MB, video: 150 * MB } as const;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

async function clear(ctx: MutationCtx) {
  for (const w of await ctx.db.query("homeWallpapers").collect()) {
    await ctx.storage.delete(w.storageId);
    await ctx.db.delete(w._id);
  }
}

/**
 * Why the file can't be a wallpaper, or null when it can: a photo or video
 * under its limit. The browser always sends the type; a missing one is
 * judged by size alone.
 */
async function refuse(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  kind: "image" | "video"
) {
  const meta = await ctx.db.system.get(storageId);
  if (!meta) {
    return "O arquivo não chegou. Tente de novo.";
  }
  const type = meta.contentType ?? "";
  if ((type && !type.startsWith(`${kind}/`)) || meta.size > MAX_BYTES[kind]) {
    return kind === "video"
      ? "Envie um vídeo de até 150 MB."
      : "Envie uma foto de até 30 MB.";
  }
  return null;
}

export const setWallpaper = mutation({
  args: {
    storageId: v.id("_storage"),
    kind: v.union(v.literal("image"), v.literal("video")),
  },
  handler: async (ctx, { storageId, kind }) => {
    const url = await ctx.storage.getUrl(storageId);
    const error = url
      ? await refuse(ctx, storageId, kind)
      : "O arquivo não chegou. Tente de novo.";
    if (error || !url) {
      // Returned, not thrown: a throw would undo the delete
      await ctx.storage.delete(storageId).catch(() => null);
      return { ok: false as const, error: error ?? "Falhou." };
    }
    await clear(ctx);
    await ctx.db.insert("homeWallpapers", {
      storageId,
      kind,
      createdAt: Date.now(),
    });
    return { ok: true as const, url, storageId, kind };
  },
});

export const removeWallpaper = mutation({
  args: {},
  handler: async (ctx) => {
    await clear(ctx);
  },
});
