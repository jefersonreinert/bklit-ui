import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requirePanel } from "./lib";

/**
 * Home screen wallpaper: the browser uploads the photo or video straight to
 * Convex storage, then saves it here. The previous file is deleted, so only
 * one wallpaper is ever kept. The URL goes into the synced home store.
 */

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

async function clear(ctx: MutationCtx) {
  for (const w of await ctx.db.query("homeWallpapers").collect()) {
    await ctx.storage.delete(w.storageId);
    await ctx.db.delete(w._id);
  }
}

export const setWallpaper = mutation({
  args: {
    storageId: v.id("_storage"),
    kind: v.union(v.literal("image"), v.literal("video")),
  },
  handler: async (ctx, { storageId, kind }) => {
    await requirePanel(ctx);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) {
      throw new Error("O arquivo não chegou. Tente de novo.");
    }
    await clear(ctx);
    await ctx.db.insert("homeWallpapers", {
      storageId,
      kind,
      createdAt: Date.now(),
    });
    return { url, storageId, kind };
  },
});

export const removeWallpaper = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    await clear(ctx);
  },
});
