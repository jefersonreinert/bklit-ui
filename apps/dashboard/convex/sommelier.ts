import { ConvexError, v } from "convex/values";
import {
  buildCatalog,
  type CellarWineIn,
  catalogText,
  foodOf,
  type PosProductIn,
  publicWine,
  type WmPositionIn,
  type WmWineIn,
} from "../lib/sommelier/catalog";
import { DEFAULT_MODEL } from "../lib/sommelier/prompt";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { audit, canReadPos, meta, newToken, requireStaff } from "./access";
import { requireRouter } from "./ai";

/**
 * AI sommelier of a wine bar: guests open a public link (QR code on the
 * tables, /sommelier/?t=<token>) and talk by voice with Claude about the
 * wines of the business. The POS manages it (Vinhos businesses only);
 * the app's server (subject "ai-router") reads the wine list and logs
 * every question, with limits per guest, per network and per day.
 */

const DAY = 24 * 60 * 60_000;
/** Questions per guest (browser) and per network address in 24 h. */
const PER_GUEST = 40;
const PER_IP = 120;
/** Voice clips per guest in 24 h (a few per answer). */
const SPEECH_PER_GUEST = 400;
const SPEECH_PER_IP = 1200;
const CELLAR_KEY = "cb:cellar:v1";

const VOICES = v.union(v.literal("browser"), v.literal("openai"));

async function settingsOf(ctx: QueryCtx, company: string) {
  return await ctx.db
    .query("sommelierSettings")
    .withIndex("by_company", (q) => q.eq("company", company))
    .unique();
}

async function byToken(ctx: QueryCtx, token: string) {
  if (token.length < 20 || token.length > 80) {
    return null;
  }
  const s = await ctx.db
    .query("sommelierSettings")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  return s?.enabled ? s : null;
}

async function venueName(ctx: QueryCtx, company: string) {
  const m = await meta(ctx, company);
  const p = (m?.profile ?? {}) as { name?: string };
  const r = (m?.receipt ?? {}) as { businessName?: string };
  return p.name || r.businessName || company;
}

async function catalogOf(ctx: QueryCtx, company: string) {
  const [wm, products, cellarDoc] = await Promise.all([
    ctx.db
      .query("wmState")
      .withIndex("by_company", (q) => q.eq("company", company))
      .unique(),
    ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", company))
      .take(3000),
    ctx.db
      .query("stores")
      .withIndex("by_key", (q) => q.eq("key", CELLAR_KEY))
      .unique(),
  ]);
  let cellar: CellarWineIn[] = [];
  try {
    cellar = cellarDoc
      ? ((JSON.parse(cellarDoc.value) as { wines?: CellarWineIn[] }).wines ?? [])
      : [];
  } catch {
    cellar = [];
  }
  const items: PosProductIn[] = products.map((p: Doc<"posProducts">) => ({
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    price: p.price,
    available: p.available,
    description: p.description,
    wine: p.wine as PosProductIn["wine"],
  }));
  const wines = buildCatalog({
    positions: (Array.isArray(wm?.positions) ? wm.positions : []) as WmPositionIn[],
    wmWines: (Array.isArray(wm?.wines) ? wm.wines : []) as WmWineIn[],
    products: items,
    cellar,
  });
  return { wines, food: foodOf(items) };
}

const since = () => Date.now() - DAY;

/* ------------------------------------ POS ---------------------------------- */

/** Settings, link and recent questions, for the POS screen. */
export const settings = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    if (!(await canReadPos(ctx, session, company))) {
      return null;
    }
    const s = await settingsOf(ctx, company);
    const recent = await ctx.db
      .query("sommelierChats")
      .withIndex("by_company_at", (q) => q.eq("company", company))
      .order("desc")
      .take(300);
    const chats = recent;
    const today = chats.filter((c) => c.at > since());
    const { wines, food } = await catalogOf(ctx, company);
    return {
      enabled: s?.enabled ?? false,
      token: s?.token ?? null,
      greeting: s?.greeting ?? "",
      notes: s?.notes ?? "",
      voice: s?.voice ?? "browser",
      openaiVoice: s?.openaiVoice ?? "marin",
      model: s?.model || DEFAULT_MODEL,
      dailyLimit: s?.dailyLimit ?? 300,
      usage: {
        today: today.length,
        guests: new Set(today.map((c) => c.sid)).size,
        failed: today.filter((c) => c.ok === false).length,
        inTokens: today.reduce((a, c) => a + (c.inTokens ?? 0), 0),
        outTokens: today.reduce((a, c) => a + (c.outTokens ?? 0), 0),
        cacheRead: today.reduce((a, c) => a + (c.cacheRead ?? 0), 0),
      },
      wines: wines.length,
      onTap: wines.filter((w) => w.onTap).length,
      withNotes: wines.filter((w) => w.notes || w.story).length,
      food: food.length,
      recent: chats.slice(0, 40).map((c) => ({
        at: c.at,
        lang: c.lang,
        question: c.question,
        answer: c.answer ?? "",
        ok: c.ok,
      })),
    };
  },
});

export const save = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    enabled: v.boolean(),
    greeting: v.string(),
    notes: v.string(),
    voice: VOICES,
    openaiVoice: v.string(),
    model: v.string(),
    dailyLimit: v.number(),
  },
  handler: async (ctx, { session, company, ...input }) => {
    const user = await requireStaff(ctx, session, "settings", company);
    const model = input.model.trim() || DEFAULT_MODEL;
    if (!/^claude-[\w.-]{2,60}$/.test(model)) {
      throw new ConvexError("Modelo inválido (use um modelo Claude).");
    }
    const doc = {
      company,
      enabled: input.enabled,
      greeting: input.greeting.trim().slice(0, 300),
      notes: input.notes.trim().slice(0, 3000),
      voice: input.voice,
      openaiVoice: input.openaiVoice.trim().slice(0, 30) || "marin",
      model,
      dailyLimit: Math.min(Math.max(Math.round(input.dailyLimit), 10), 5000),
      updatedAt: Date.now(),
    };
    const current = await settingsOf(ctx, company);
    if (current) {
      await ctx.db.patch(current._id, doc);
    } else {
      await ctx.db.insert("sommelierSettings", { ...doc, token: newToken() });
    }
    await audit(ctx, user, "Sommelier IA", input.enabled ? "ligado" : "desligado", company);
    return true;
  },
});

/** A new link: the old QR codes stop working. */
export const rotate = mutation({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const user = await requireStaff(ctx, session, "settings", company);
    const current = await settingsOf(ctx, company);
    if (!current) {
      throw new ConvexError("Salve as configurações primeiro.");
    }
    await ctx.db.patch(current._id, { token: newToken(), updatedAt: Date.now() });
    await audit(ctx, user, "Sommelier IA", "novo link", company);
    return true;
  },
});

/* ---------------------------------- guests --------------------------------- */

/** The public page: venue, greeting and wine list (no costs, no stock). */
export const venue = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await byToken(ctx, token);
    if (!s) {
      return null;
    }
    const { wines } = await catalogOf(ctx, s.company);
    return {
      company: s.company,
      name: await venueName(ctx, s.company),
      greeting: s.greeting ?? "",
      voice: s.voice,
      wines: wines.map(publicWine),
    };
  },
});

/* ------------------------------ app server only ---------------------------- */

const guest = {
  token: v.string(),
  sid: v.string(),
  ip: v.string(),
};

async function overLimit(
  ctx: QueryCtx,
  s: Doc<"sommelierSettings">,
  sid: string,
  ip: string
) {
  const from = since();
  const mine = await ctx.db
    .query("sommelierChats")
    .withIndex("by_sid", (q) => q.eq("sid", sid).gt("at", from))
    .take(PER_GUEST);
  if (mine.length >= PER_GUEST) {
    return "guest";
  }
  const net = await ctx.db
    .query("sommelierChats")
    .withIndex("by_ip", (q) => q.eq("ip", ip).gt("at", from))
    .take(PER_IP);
  if (net.length >= PER_IP) {
    return "network";
  }
  const all = await ctx.db
    .query("sommelierChats")
    .withIndex("by_company_at", (q) => q.eq("company", s.company).gt("at", from))
    .take(s.dailyLimit);
  return all.length >= s.dailyLimit ? "venue" : null;
}

/**
 * A guest asked something: checks the limits, logs the question and
 * returns what the AI needs (instructions, wine list, model).
 */
export const begin = mutation({
  args: { ...guest, lang: v.string(), question: v.string() },
  handler: async (ctx, { token, sid, ip, lang, question }) => {
    await requireRouter(ctx);
    const s = await byToken(ctx, token);
    if (!s) {
      return { ok: false as const, reason: "closed" };
    }
    const limit = await overLimit(ctx, s, sid, ip);
    if (limit) {
      return { ok: false as const, reason: limit };
    }
    const { wines, food } = await catalogOf(ctx, s.company);
    const currency = "€";
    const id = await ctx.db.insert("sommelierChats", {
      company: s.company,
      sid,
      ip,
      at: Date.now(),
      lang: lang.slice(0, 8),
      question: question.slice(0, 600),
    });
    return {
      ok: true as const,
      id,
      venue: await venueName(ctx, s.company),
      notes: s.notes ?? "",
      model: s.model || DEFAULT_MODEL,
      catalog: catalogText(wines, food, currency),
    };
  },
});

export const finish = mutation({
  args: {
    id: v.id("sommelierChats"),
    ok: v.boolean(),
    answer: v.string(),
    ms: v.number(),
    model: v.optional(v.string()),
    inTokens: v.optional(v.number()),
    outTokens: v.optional(v.number()),
    cacheRead: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    await requireRouter(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.answer !== undefined) {
      return false;
    }
    await ctx.db.patch(id, {
      ...rest,
      answer: rest.answer.slice(0, 4000),
      error: rest.error?.slice(0, 300),
    });
    return true;
  },
});

/** A voice clip of an answer (OpenAI voice): limited per guest. */
export const speech = mutation({
  args: { token: v.string(), sid: v.string(), ip: v.string() },
  handler: async (ctx, { token, sid, ip }) => {
    await requireRouter(ctx);
    const s = await byToken(ctx, token);
    if (!(s && s.voice === "openai")) {
      return { ok: false as const, reason: "browser" };
    }
    const used = await ctx.db
      .query("sommelierSpeech")
      .withIndex("by_sid", (q) => q.eq("sid", sid).gt("at", since()))
      .take(SPEECH_PER_GUEST);
    const net = await ctx.db
      .query("sommelierSpeech")
      .withIndex("by_ip", (q) => q.eq("ip", ip).gt("at", since()))
      .take(SPEECH_PER_IP);
    if (used.length >= SPEECH_PER_GUEST || net.length >= SPEECH_PER_IP) {
      return { ok: false as const, reason: "guest" };
    }
    await ctx.db.insert("sommelierSpeech", { company: s.company, sid, ip, at: Date.now() });
    return { ok: true as const, voice: s.openaiVoice ?? "marin" };
  },
});
