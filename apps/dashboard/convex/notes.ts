import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

const noteFields = {
  clientId: v.string(),
  title: v.string(),
  folder: v.string(),
  content: v.string(),
  pinned: v.boolean(),
  icon: v.optional(v.string()),
  cover: v.optional(v.string()),
  parentId: v.optional(v.union(v.string(), v.null())),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/** All notes, tombstones included, so every device can converge. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    return await ctx.db.query("notes").take(5000);
  },
});

/** Last write wins, by the note's own updatedAt. */
export const upsert = mutation({
  args: noteFields,
  handler: async (ctx, note) => {
    await requirePanel(ctx);
    const current = await ctx.db
      .query("notes")
      .withIndex("by_clientId", (q) => q.eq("clientId", note.clientId))
      .unique();
    if (!current) {
      await ctx.db.insert("notes", { ...note, deleted: false });
      return true;
    }
    if (current.updatedAt > note.updatedAt) {
      return false;
    }
    await ctx.db.replace(current._id, { ...note, deleted: false });
    return true;
  },
});

export const remove = mutation({
  args: { clientId: v.string(), updatedAt: v.number() },
  handler: async (ctx, { clientId, updatedAt }) => {
    await requirePanel(ctx);
    const current = await ctx.db
      .query("notes")
      .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
      .unique();
    if (current && current.updatedAt <= updatedAt) {
      await ctx.db.patch(current._id, {
        deleted: true,
        content: "",
        updatedAt,
      });
    }
  },
});

/** Full-text search used by the AI. */
export const search = query({
  args: { text: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { text, limit }) => {
    await requirePanel(ctx);
    return await ctx.db
      .query("notes")
      .withSearchIndex("search_content", (q) =>
        q.search("content", text).eq("deleted", false)
      )
      .take(Math.min(limit ?? 8, 20));
  },
});
