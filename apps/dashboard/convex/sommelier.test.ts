import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { parseProfile } from "../lib/sommelier/profile";
import { liveVoiceOf } from "../lib/sommelier/prompt";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };
const router = { subject: "ai-router", issuer: "https://panel.test" };

const wine = (name: string, extra: object = {}) => ({
  id: name,
  name,
  category: "Red Wine",
  price: 40,
  color: "#7b1e2b",
  available: true,
  wine: {
    color: "red",
    country: "Spain",
    bottleMl: 750,
    takeaway: 22,
    pours: [{ ml: 125, price: 7 }],
  },
  ...extra,
});

async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(internal.pos.importMenu, {
    company: "vinomad",
    currency: "EUR",
    profile: { name: "Vinomad", color: "#000", wine: true },
    products: [
      wine("Tinto Pesquera Crianza"),
      wine("Hidden Wine", { available: false }),
      {
        id: "board",
        name: "Charcuterie board",
        category: "Food",
        price: 18,
        color: "#000",
        available: true,
      },
    ],
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("wmState", {
      company: "vinomad",
      takenAt: 0,
      syncedAt: 0,
      ms: 0,
      node: null,
      dispensers: [],
      positions: [
        {
          sku: "6",
          wine: "COLLE VECCHIO",
          doses: [25, 125, 175],
          prices: [1.4, 6.5, 9],
          residueMl: 400,
        },
        { sku: "7", wine: "EMPTY ONE", doses: [25], prices: [2], residueMl: 5 },
      ],
      wines: [
        {
          sku: "6",
          name: "COLLE VECCHIO",
          title2: "MONTEPULCIANO",
          origin: "ITALY",
        },
      ],
    });
  });
  return { t, token };
}

const turnOn = (
  t: Awaited<ReturnType<typeof setup>>["t"],
  token: string,
  dailyLimit = 300
) =>
  t.mutation(api.sommelier.save, {
    session: token,
    company: "vinomad",
    enabled: true,
    greeting: "",
    notes: "Push Maltese wines",
    voice: "browser",
    openaiVoice: "sage",
    model: "claude-opus-5-5",
    dailyLimit,
  });

async function linkOf(
  t: Awaited<ReturnType<typeof setup>>["t"],
  token: string
) {
  const s = await t.query(api.sommelier.settings, {
    session: token,
    company: "vinomad",
  });
  return s?.token as string;
}

describe("AI sommelier", () => {
  it("shows guests the venue and the pourable wines, without costs", async () => {
    const { t, token } = await setup();
    await turnOn(t, token);
    const venue = await t.query(api.sommelier.venue, {
      token: await linkOf(t, token),
    });
    expect(venue?.name).toBe("Vinomad");
    const names = venue?.wines.map((w) => w.name);
    expect(names).toEqual(["Colle Vecchio", "Tinto Pesquera Crianza"]);
    expect(venue?.wines[0]).toMatchObject({
      onTap: true,
      grape: "Montepulciano",
    });
    expect(JSON.stringify(venue)).not.toContain("cost");
    expect(
      await t.query(api.sommelier.venue, { token: "f".repeat(48) })
    ).toBeNull();
  });

  it("closes the link when turned off or rotated", async () => {
    const { t, token } = await setup();
    await turnOn(t, token);
    const first = await linkOf(t, token);
    await t.mutation(api.sommelier.rotate, {
      session: token,
      company: "vinomad",
    });
    expect(await t.query(api.sommelier.venue, { token: first })).toBeNull();
    const second = await linkOf(t, token);
    expect(
      await t.query(api.sommelier.venue, { token: second })
    ).not.toBeNull();
    await t.mutation(api.sommelier.save, {
      session: token,
      company: "vinomad",
      enabled: false,
      greeting: "",
      notes: "",
      voice: "browser",
      openaiVoice: "sage",
      model: "claude-opus-5-5",
      dailyLimit: 300,
    });
    expect(await t.query(api.sommelier.venue, { token: second })).toBeNull();
  });

  it("only the app server starts a turn; it gets the wine list and food", async () => {
    const { t, token } = await setup();
    await turnOn(t, token);
    const link = await linkOf(t, token);
    const args = {
      token: link,
      sid: "guest-0001",
      ip: "ip1",
      lang: "en",
      question: "A red?",
    };
    await expect(t.mutation(api.sommelier.begin, args)).rejects.toThrow();
    const r = await t.withIdentity(router).mutation(api.sommelier.begin, args);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.catalog).toContain("Colle Vecchio");
    expect(r.catalog).toContain("ON TAP now: 25 ml");
    // Guests never hear prices: the AI does not get them
    expect(r.catalog).not.toContain("€");
    expect(r.catalog).toContain("Charcuterie board");
    expect(r.catalog).not.toContain("Hidden Wine");
    expect(r.notes).toBe("Push Maltese wines");
    await t.withIdentity(router).mutation(api.sommelier.finish, {
      id: r.id,
      ok: true,
      answer: "Try the Colle Vecchio.",
      ms: 900,
      inTokens: 5000,
      outTokens: 80,
      cacheRead: 4800,
    });
    const s = await t.query(api.sommelier.settings, {
      session: token,
      company: "vinomad",
    });
    expect(s?.usage.today).toBe(1);
    expect(s?.recent[0]).toMatchObject({
      question: "A red?",
      answer: "Try the Colle Vecchio.",
    });
  });

  it("stops at the daily limit of the venue", async () => {
    const { t, token } = await setup();
    await turnOn(t, token, 10);
    const link = await linkOf(t, token);
    const ask = (i: number) =>
      t.withIdentity(router).mutation(api.sommelier.begin, {
        token: link,
        sid: `guest-${String(i).padStart(4, "0")}`,
        ip: `ip${i}`,
        lang: "en",
        question: "Hi",
      });
    for (let i = 0; i < 10; i++) {
      expect((await ask(i)).ok).toBe(true);
    }
    expect(await ask(99)).toEqual({ ok: false, reason: "venue" });
  });

  it("limits each guest", async () => {
    const { t, token } = await setup();
    await turnOn(t, token);
    const link = await linkOf(t, token);
    const ask = () =>
      t.withIdentity(router).mutation(api.sommelier.begin, {
        token: link,
        sid: "guest-same",
        ip: "ip-same",
        lang: "pt",
        question: "Oi",
      });
    for (let i = 0; i < 40; i++) {
      await ask();
    }
    expect(await ask()).toEqual({ ok: false, reason: "guest" });
  });

  it("the natural voice only when the venue chose it", async () => {
    const { t, token } = await setup();
    await turnOn(t, token);
    const link = await linkOf(t, token);
    const args = { token: link, sid: "guest-0001", ip: "ip1" };
    expect(
      await t.withIdentity(router).mutation(api.sommelier.speech, args)
    ).toEqual({
      ok: false,
      reason: "browser",
    });
  });

  it("keeps one AI wine sheet per wine and language", async () => {
    const { t, token } = await setup();
    await turnOn(t, token);
    const link = await linkOf(t, token);
    const venue = await t.query(api.sommelier.venue, { token: link });
    const w = venue?.wines[0];
    expect(w).toBeDefined();
    if (!w) {
      return;
    }
    // Guests get the house facts but never prices
    expect(JSON.stringify(venue)).not.toContain("price");
    const r = t.withIdentity(router);
    const args = { token: link, wineId: w.id, lang: "pt" };
    await expect(t.mutation(api.sommelier.profileJob, args)).rejects.toThrow();
    const job = await r.mutation(api.sommelier.profileJob, args);
    expect(job.ok && "wine" in job && job.wine?.name).toBe(w.name);
    const profile = parseProfile(
      'Here: ```json {"summary":"Tinto macio","short":{"taste":"Ameixa e pimenta","pairing":"Carnes grelhadas"},"body":4,"tannin":9,"vegan":"maybe","tasting":{"nose":"Ameixa"},"styles":["Encorpado"]} ```'
    );
    expect(profile).toMatchObject({
      summary: "Tinto macio",
      body: 4,
      tannin: 0,
      vegan: "",
    });
    await r.mutation(api.sommelier.saveProfile, {
      company: "vinomad",
      wineId: w.id,
      lang: "pt",
      profile,
    });
    const again = await r.mutation(api.sommelier.profileJob, args);
    expect(again.ok && "profile" in again && again.profile?.summary).toBe(
      "Tinto macio"
    );
    // Another language is written separately
    const en = await r.mutation(api.sommelier.profileJob, {
      ...args,
      lang: "en",
    });
    expect(en.ok && "wine" in en).toBe(true);
  });

  it("picks the best female live voice for each language", async () => {
    expect(liveVoiceOf("pt", {})).toBe("bossa");
    expect(liveVoiceOf("de", undefined)).toBe("nuri");
    expect(liveVoiceOf("fr", {})).toBe("brise");
    expect(liveVoiceOf("en", {})).toBe("gleam");
    expect(liveVoiceOf("it", {})).toBe("marin");
    expect(liveVoiceOf("en", { en: "willow" })).toBe("willow");
    expect(liveVoiceOf("en", { en: "nope" })).toBe("gleam");
    const { t, token } = await setup();
    await t.mutation(api.sommelier.save, {
      session: token,
      company: "vinomad",
      enabled: true,
      greeting: "",
      notes: "",
      voice: "live",
      openaiVoice: "marin",
      liveVoices: { en: "willow", pt: "bad-voice", xx: "marin" },
      model: "claude-opus-5-5",
      dailyLimit: 300,
    });
    const s = await t.query(api.sommelier.settings, {
      session: token,
      company: "vinomad",
    });
    expect(s?.liveVoices).toEqual({ en: "willow" });
  });
});
