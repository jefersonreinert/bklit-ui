import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

const DEAL = {
  ticket: 1001,
  position: 900,
  symbol: "EURUSD",
  type: "DEAL_TYPE_BUY",
  entry: "DEAL_ENTRY_IN",
  volume: 0.1,
  price: 1.085,
  sl: 1.08,
  time: 1_760_000_000,
};

async function setup() {
  const t = convexTest(schema, modules);
  const token = await t
    .withIdentity(panel)
    .mutation(api.journal.ensureToken, {});
  return { t, token };
}

describe("journal webhooks", () => {
  it("rejects requests without the token", async () => {
    const { t } = await setup();
    const res = await t.fetch("/journal/mt5?token=wrong", {
      method: "POST",
      body: JSON.stringify(DEAL),
    });
    expect(res.status).toBe(401);
    expect(await t.withIdentity(panel).query(api.journal.deals, {})).toEqual(
      []
    );
  });

  it("stores EA deals once per ticket and remembers the account", async () => {
    const { t, token } = await setup();
    const send = () =>
      t.fetch(`/journal/mt5?token=${token}`, {
        method: "POST",
        body: JSON.stringify({
          account: 5001,
          server: "Demo-Server",
          name: "Broker",
          deals: [{ ...DEAL, account: 5001 }],
        }),
      });
    const first = await (await send()).json();
    expect(first).toEqual({ ok: true, received: 1, added: 1 });
    const again = await (await send()).json();
    expect(again.added).toBe(0);
    const p = t.withIdentity(panel);
    const deals = await p.query(api.journal.deals, {});
    expect(deals).toHaveLength(1);
    expect(deals?.[0]?.side).toBe("buy");
    expect((await p.query(api.journal.settings, {}))?.accounts[0]?.login).toBe(
      "5001"
    );
  });

  it("stores TradingView alerts, with the token in the URL", async () => {
    const { t, token } = await setup();
    const res = await t.fetch(`/journal/tradingview?token=${token}`, {
      method: "POST",
      body: '{"ticker":"EURUSD","action":"sell","price":"1.09"}',
    });
    expect(res.status).toBe(200);
    const signals = await t.withIdentity(panel).query(api.journal.signals, {});
    expect(signals?.[0]?.action).toBe("sell");
    expect(signals?.[0]?.price).toBe(1.09);
  });

  it("rotating the token cuts the old one off", async () => {
    const { t, token } = await setup();
    await t.withIdentity(panel).mutation(api.journal.rotateToken, {});
    const res = await t.fetch(`/journal/ping?token=${token}`);
    expect(res.status).toBe(401);
  });
});

const fixture = (name: string) =>
  readFileSync(
    new URL(`../lib/journal/__tests__/fixtures/${name}`, import.meta.url),
    "utf8"
  );
const STATS = fixture("POST_journal_mt5_stats.json");
const DEALS = fixture("POST_journal_mt5.json");

describe("TradingJournal Complete EA (Golden Bullet)", () => {
  it("stores the example deals with the EA extras", async () => {
    const { t, token } = await setup();
    const res = await t.fetch(`/journal/mt5?token=${token}`, {
      method: "POST",
      body: DEALS,
    });
    expect(await res.json()).toEqual({ ok: true, received: 2, added: 2 });
    const deals = await t.withIdentity(panel).query(api.journal.deals, {});
    const exit = deals?.find((d) => d.entry === "out");
    expect(exit).toMatchObject({
      rr: 2,
      riskPct: 0.01,
      riskUsd: 100,
      profitPoints: 400,
      durationSec: 7200,
      outcome: "win",
      equityAt: 10_196.5,
      accountType: "Personal",
      market: "Forex",
    });
  });

  it("fills the extras of a deal already stored, never erases them", async () => {
    const { t, token } = await setup();
    const body = JSON.parse(DEALS) as { deals: Record<string, unknown>[] };
    const bare = body.deals.map((d) => {
      const { rr: _rr, risk_usd: _r, market: _m, ...rest } = d;
      return rest;
    });
    const send = (deals: unknown[]) =>
      t.fetch(`/journal/mt5?token=${token}`, {
        method: "POST",
        body: JSON.stringify({ ...body, deals }),
      });
    await send(bare);
    const p = t.withIdentity(panel);
    let exit = (await p.query(api.journal.deals, {}))?.find(
      (d) => d.entry === "out"
    );
    expect(exit?.rr).toBeUndefined();
    expect(exit?.riskPct).toBe(0.01);
    expect(await (await send(body.deals)).json()).toMatchObject({ added: 0 });
    exit = (await p.query(api.journal.deals, {}))?.find(
      (d) => d.entry === "out"
    );
    expect(exit?.rr).toBe(2);
    expect(exit?.market).toBe("Forex");
    // Re-sending without extras keeps them
    await send(bare);
    const deals = await p.query(api.journal.deals, {});
    expect(deals).toHaveLength(2);
    expect(deals?.find((d) => d.entry === "out")?.riskUsd).toBe(100);
  });

  it("upserts account statistics, one snapshot per server day", async () => {
    const { t, token } = await setup();
    const post = (body: string, tk = token) =>
      t.fetch(`/journal/mt5/stats?token=${tk}`, { method: "POST", body });
    expect((await post(STATS, "wrong")).status).toBe(401);
    expect((await post("{nope")).status).toBe(400);
    expect((await post('{"stats":{}}')).status).toBe(400);
    const big = JSON.stringify({ pad: "x".repeat(300_000) });
    expect((await post(big)).status).toBe(413);
    expect((await post(big, "wrong")).status).toBe(401);

    const res = await post(STATS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const later = JSON.parse(STATS) as {
      time: number;
      stats: Record<string, number>;
    };
    later.time += 600;
    later.stats.balance = 10_300;
    await post(JSON.stringify(later));
    later.time += 86_400;
    later.stats.balance = 10_400;
    await post(JSON.stringify(later));

    const p = t.withIdentity(panel);
    const rows = await p.query(api.journal.accountStats, {});
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      account: "52784901",
      holder: "Jeferson Reinert",
      currency: "USD",
      accountType: "Personal",
    });
    expect(rows?.[0]?.stats.balance).toBe(10_400);
    expect(Math.round((rows?.[0]?.stats.weeklyTargetProgress ?? 0) * 100)).toBe(
      77
    );
    const history = await p.query(api.journal.statsHistory, {
      account: "52784901",
    });
    expect(history?.map((h) => h.balance)).toEqual([10_300, 10_400]);
    const settings = await p.query(api.journal.settings, {});
    expect(settings?.lastStatsAt).toBeTypeOf("number");
    expect(settings?.accounts[0]?.login).toBe("52784901");
  });

  it("checks the EA totals against the stored deals", async () => {
    const { t, token } = await setup();
    await t.fetch(`/journal/mt5?token=${token}`, {
      method: "POST",
      body: DEALS,
    });
    await t.fetch(`/journal/mt5/stats?token=${token}`, {
      method: "POST",
      body: STATS,
    });
    const check = await t
      .withIdentity(panel)
      .query(api.journal.accountCheck, { account: "52784901" });
    // The example stats count 5 trades; only one exit was sent
    expect(check?.panel).toEqual({ trades: 1, net: 198.25 });
    expect(check?.issues.map((i) => i.field)).toEqual(["trades", "net"]);
  });

  it("saves the Notion note fields and their options", async () => {
    const { t } = await setup();
    const p = t.withIdentity(panel);
    await p.mutation(api.journal.saveNote, {
      key: "1:2",
      bias: "Bullish",
      psychology: "FOMO",
    });
    const [note] = (await p.query(api.journal.notes, {})) ?? [];
    expect(note).toMatchObject({ bias: "Bullish", psychology: "FOMO" });
    await p.mutation(api.journal.saveNoteOptions, {
      field: "bias",
      options: ["Long", " Long", "Short"],
    });
    const settings = await p.query(api.journal.settings, {});
    expect(settings?.noteOptions.bias).toEqual(["Long", "Short"]);
    expect(settings?.noteOptions.psychology).toContain("Revenge");
  });
});

describe("journal demo data and reset", () => {
  it("loads fictitious trades, removes only them, then clears everything", async () => {
    const { t, token } = await setup();
    const p = t.withIdentity(panel);
    // A real deal that must survive removing the demo
    await t.fetch(`/journal/mt5?token=${token}`, {
      method: "POST",
      body: JSON.stringify({ account: 5001, ...DEAL }),
    });
    const n = await p.mutation(api.journal.seedDemo, {});
    expect(n).toBeGreaterThan(400);
    expect(await p.query(api.journal.hasDemo, {})).toBe(true);
    expect((await p.query(api.journal.deals, {}))?.length).toBe(n + 1);
    expect((await p.query(api.journal.notes, {}))?.length).toBeGreaterThan(0);
    expect(await p.query(api.journal.accountStats, {})).toHaveLength(1);
    // Seeding twice replaces the demo instead of duplicating it
    await p.mutation(api.journal.seedDemo, {});
    expect((await p.query(api.journal.deals, {}))?.length).toBe(n + 1);

    expect(
      await p.mutation(api.journal.clearJournal, { scope: "demo" })
    ).toEqual({ done: true });
    expect(await p.query(api.journal.hasDemo, {})).toBe(false);
    const left = await p.query(api.journal.deals, {});
    expect(left?.map((d) => d.account)).toEqual(["5001"]);
    expect(await p.query(api.journal.signals, {})).toEqual([]);
    expect(await p.query(api.journal.accountStats, {})).toEqual([]);

    await p.mutation(api.journal.clearJournal, { scope: "all" });
    expect(await p.query(api.journal.deals, {})).toEqual([]);
    const settings = await p.query(api.journal.settings, {});
    expect(settings?.token).toBe(token);
    expect(settings?.accounts).toEqual([]);
  });

  it("requires the panel", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.journal.seedDemo, {})).rejects.toThrow();
    await expect(
      t.mutation(api.journal.clearJournal, { scope: "all" })
    ).rejects.toThrow();
  });
});
