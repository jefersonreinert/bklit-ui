import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
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
  origin: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/** A page of changes stays well under Convex's result size limit. */
const PAGE_BYTES = 3_000_000;
const PAGE_DOCS = 300;

/**
 * Strictly increasing write stamp. Reading the newest stamp makes
 * concurrent writes conflict and retry, so stamps commit in order and a
 * device that has seen stamp N has seen everything before it.
 */
async function nextStamp(ctx: MutationCtx) {
  const last = await ctx.db
    .query("notes")
    .withIndex("by_synced")
    .order("desc")
    .first();
  return Math.max(Date.now(), (last?.syncedAt ?? 0) + 1);
}

/** All notes, tombstones included (older clients). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    return await ctx.db.query("notes").take(5000);
  },
});

/**
 * Notes written after `after` (tombstones included), oldest first. Devices
 * page through this once, then stay subscribed to it: a save sends only
 * that note instead of every note again.
 */
export const since = query({
  args: { after: v.number() },
  handler: async (ctx, { after }) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const docs: Doc<"notes">[] = [];
    let bytes = 0;
    const rows = ctx.db
      .query("notes")
      .withIndex("by_synced", (q) => q.gt("syncedAt", after));
    for await (const d of rows) {
      docs.push(d);
      bytes += d.content.length + d.title.length + 300;
      if (bytes > PAGE_BYTES || docs.length >= PAGE_DOCS) {
        return { docs, more: true };
      }
    }
    return { docs, more: false };
  },
});

/** Last write wins, by the note's own updatedAt (same version: no-op). */
export const upsert = mutation({
  args: noteFields,
  handler: async (ctx, note) => {
    await requirePanel(ctx);
    const current = await ctx.db
      .query("notes")
      .withIndex("by_clientId", (q) => q.eq("clientId", note.clientId))
      .unique();
    if (current && current.updatedAt >= note.updatedAt) {
      return false;
    }
    const doc = { ...note, deleted: false, syncedAt: await nextStamp(ctx) };
    if (current) {
      await ctx.db.replace(current._id, doc);
    } else {
      await ctx.db.insert("notes", doc);
    }
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
        syncedAt: await nextStamp(ctx),
      });
    }
  },
});

/** One-off: stamps notes saved before syncedAt existed. */
export const backfillSynced = internalMutation({
  args: {},
  handler: async (ctx) => {
    const missing = await ctx.db
      .query("notes")
      .withIndex("by_synced", (q) => q.eq("syncedAt", undefined))
      .take(1000);
    let stamp = await nextStamp(ctx);
    for (const d of missing) {
      await ctx.db.patch(d._id, { syncedAt: stamp });
      stamp += 1;
    }
    return missing.length;
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
