import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requirePanel } from "./lib";

/**
 * Interface translations made by AI (app/api/i18n), kept once for every
 * device. Anyone may read them; only the panel server writes.
 */

export const CHUNKS = 32;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const MAX_TEXT = 2000;

/** Stable chunk of a key (FNV-1a). */
export function chunkOf(key: string) {
  let h = 0x81_1c_9d_c5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01_00_01_93);
  }
  return (h >>> 0) % CHUNKS;
}

/** Every translation of a language as [Portuguese text, translation]. */
export const dict = query({
  args: { locale: v.string() },
  handler: async (ctx, { locale }) => {
    const chunks = await ctx.db
      .query("i18nChunks")
      .withIndex("by_locale_chunk", (q) => q.eq("locale", locale))
      .take(CHUNKS);
    return chunks.flatMap((c) => c.pairs);
  },
});

export const save = mutation({
  args: { locale: v.string(), pairs: v.array(v.array(v.string())) },
  handler: async (ctx, { locale, pairs }) => {
    await requirePanel(ctx);
    if (!LOCALE.test(locale)) {
      throw new Error("invalid locale");
    }
    const groups = new Map<number, Map<string, string>>();
    for (const [key, text] of pairs) {
      if (
        !(key && text?.trim()) ||
        key.length > MAX_TEXT ||
        text.length > MAX_TEXT
      ) {
        continue;
      }
      const n = chunkOf(key);
      const group = groups.get(n) ?? new Map<string, string>();
      group.set(key, text);
      groups.set(n, group);
    }
    for (const [chunk, add] of groups) {
      const doc = await ctx.db
        .query("i18nChunks")
        .withIndex("by_locale_chunk", (q) =>
          q.eq("locale", locale).eq("chunk", chunk)
        )
        .unique();
      const merged = new Map(
        (doc?.pairs ?? []).map(([k, t]) => [k ?? "", t ?? ""] as const)
      );
      for (const [k, t] of add) {
        merged.set(k, t);
      }
      const next = [...merged].map(([k, t]) => [k, t]);
      if (doc) {
        await ctx.db.patch(doc._id, { pairs: next, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("i18nChunks", {
          locale,
          chunk,
          pairs: next,
          updatedAt: Date.now(),
        });
      }
    }
    return groups.size;
  },
});
