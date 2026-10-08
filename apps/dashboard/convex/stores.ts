import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/** Module stores (POS, agents, finances…) as JSON, newest wins. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    return await ctx.db.query("stores").take(200);
  },
});

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requirePanel(ctx);
    return await ctx.db
      .query("stores")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
  },
});

export const set = mutation({
  args: {
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
    device: v.string(),
  },
  handler: async (ctx, doc) => {
    await requirePanel(ctx);
    const current = await ctx.db
      .query("stores")
      .withIndex("by_key", (q) => q.eq("key", doc.key))
      .unique();
    if (!current) {
      await ctx.db.insert("stores", doc);
      return true;
    }
    if (current.updatedAt > doc.updatedAt) {
      return false;
    }
    await ctx.db.replace(current._id, doc);
    return true;
  },
});
