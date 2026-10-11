import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requirePanel } from "./lib";

/**
 * Images used in the free-form menu designs (uploads, logos cut from
 * photos). They live in Convex file storage; designs keep only the URL,
 * so the synced design JSON stays small.
 */

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Public URL of an uploaded image. */
export const assetUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    return await ctx.storage.getUrl(a.storageId);
  },
});
