import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { addToCalendar, type MediaCalendar } from "../lib/telegram/media";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * Telegram media gallery: files saved by mtproto.saveMedia, browsable by
 * year → month → day, kind and chat. The bytes live in Convex storage;
 * queries return short-lived download URLs.
 */

const CALENDAR_SCAN = 20_000;

async function withUrl(ctx: QueryCtx, m: Doc<"tgMedia">) {
  return {
    id: m._id,
    chatId: m.chatId,
    chatName: m.chatName,
    messageId: m.messageId,
    kind: m.kind,
    mime: m.mime,
    fileName: m.fileName,
    size: m.size,
    date: m.date,
    day: m.day,
    sender: m.sender ?? null,
    caption: m.caption ?? null,
    url: await ctx.storage.getUrl(m.storageId),
  };
}

/** The narrowest index for the chosen period (then kind/chat filters). */
function baseQuery(
  ctx: QueryCtx,
  a: { year?: string; month?: string; day?: string; chatId?: string }
) {
  const t = ctx.db.query("tgMedia");
  if (a.day) {
    const day = a.day;
    return t.withIndex("by_day", (i) => i.eq("day", day));
  }
  if (a.month) {
    const month = a.month;
    return t.withIndex("by_month", (i) => i.eq("month", month));
  }
  if (a.year) {
    const year = a.year;
    return t.withIndex("by_year", (i) => i.eq("year", year));
  }
  if (a.chatId) {
    const chatId = a.chatId;
    return t.withIndex("by_chat", (i) => i.eq("chatId", chatId));
  }
  return t.withIndex("by_date");
}

export type GalleryItem = Awaited<ReturnType<typeof withUrl>>;

/** One page of the gallery, newest first, for the chosen period. */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    year: v.optional(v.string()),
    month: v.optional(v.string()),
    day: v.optional(v.string()),
    kinds: v.optional(v.array(v.string())),
    chatId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const q = baseQuery(ctx, a);
    const kinds = a.kinds?.length ? a.kinds : null;
    const chatId = a.chatId;
    const filtered = q.filter((f) => {
      const byKind = kinds
        ? f.or(...kinds.map((k) => f.eq(f.field("kind"), k)))
        : true;
      const byChat = chatId ? f.eq(f.field("chatId"), chatId) : true;
      return f.and(byKind, byChat);
    });
    const page = await filtered.order("desc").paginate(a.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map((m) => withUrl(ctx, m))),
    };
  },
});

/** Counts per year/month/day, per kind and per chat, plus total size. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const all = await ctx.db
      .query("tgMedia")
      .withIndex("by_date")
      .order("desc")
      .take(CALENDAR_SCAN);
    const calendar: MediaCalendar = {};
    const kinds: Record<string, number> = {};
    const chats: Record<string, { name: string; count: number }> = {};
    let bytes = 0;
    for (const m of all) {
      addToCalendar(calendar, m);
      kinds[m.kind] = (kinds[m.kind] ?? 0) + 1;
      const c = chats[m.chatId] ?? { name: m.chatName, count: 0 };
      c.count += 1;
      chats[m.chatId] = c;
      bytes += m.size;
    }
    return {
      total: all.length,
      truncated: all.length >= CALENDAR_SCAN,
      bytes,
      calendar,
      kinds,
      chats: Object.entries(chats)
        .map(([id, c]) => ({ id, ...c }))
        .sort((x, y) => y.count - x.count),
    };
  },
});

/** Download URLs for a set of saved files (zip / "baixar todas"). */
export const urls = query({
  args: { ids: v.array(v.id("tgMedia")) },
  handler: async (ctx, { ids }) => {
    await requirePanel(ctx);
    const out: GalleryItem[] = [];
    for (const id of ids.slice(0, 500)) {
      const m = await ctx.db.get(id);
      if (m) {
        out.push(await withUrl(ctx, m));
      }
    }
    return out;
  },
});

/** Every file of a period/filter (ids only), for "baixar tudo". */
export const allIds = query({
  args: {
    year: v.optional(v.string()),
    month: v.optional(v.string()),
    day: v.optional(v.string()),
    kinds: v.optional(v.array(v.string())),
    chatId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const all = await ctx.db
      .query("tgMedia")
      .withIndex("by_date")
      .order("desc")
      .take(CALENDAR_SCAN);
    return all
      .filter(
        (m) =>
          (!a.day || m.day === a.day) &&
          (!a.month || m.month === a.month) &&
          (!a.year || m.year === a.year) &&
          (!a.chatId || m.chatId === a.chatId) &&
          (!a.kinds?.length || a.kinds.includes(m.kind))
      )
      .map((m) => ({ id: m._id, size: m.size }));
  },
});

export const remove = mutation({
  args: { ids: v.array(v.id("tgMedia")) },
  handler: async (ctx, { ids }) => {
    await requirePanel(ctx);
    for (const id of ids) {
      const m = await ctx.db.get(id);
      if (m) {
        await ctx.storage.delete(m.storageId);
        await ctx.db.delete(id);
      }
    }
  },
});

// ─── Internal: used by mtproto.saveMedia ───────────────────────────────

export const existing = internalQuery({
  args: { chatId: v.string(), messageIds: v.array(v.number()) },
  handler: async (ctx, { chatId, messageIds }) => {
    const found: { messageId: number; id: string; url: string | null }[] = [];
    for (const messageId of messageIds) {
      const m = await ctx.db
        .query("tgMedia")
        .withIndex("by_message", (i) =>
          i.eq("chatId", chatId).eq("messageId", messageId)
        )
        .first();
      if (m) {
        found.push({
          messageId,
          id: m._id,
          url: await ctx.storage.getUrl(m.storageId),
        });
      }
    }
    return found;
  },
});

export const add = internalMutation({
  args: {
    chatId: v.string(),
    chatName: v.string(),
    messageId: v.number(),
    kind: v.string(),
    mime: v.string(),
    fileName: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
    date: v.number(),
    day: v.string(),
    month: v.string(),
    year: v.string(),
    sender: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const dup = await ctx.db
      .query("tgMedia")
      .withIndex("by_message", (i) =>
        i.eq("chatId", a.chatId).eq("messageId", a.messageId)
      )
      .first();
    if (dup) {
      // Saved meanwhile by another call: keep one copy
      await ctx.storage.delete(a.storageId);
      return { id: dup._id, url: await ctx.storage.getUrl(dup.storageId) };
    }
    const id = await ctx.db.insert("tgMedia", { ...a, savedAt: Date.now() });
    return { id, url: await ctx.storage.getUrl(a.storageId) };
  },
});
