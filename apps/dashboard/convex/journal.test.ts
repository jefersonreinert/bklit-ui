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
    // Seeding twice replaces the demo instead of duplicating it
    await p.mutation(api.journal.seedDemo, {});
    expect((await p.query(api.journal.deals, {}))?.length).toBe(n + 1);

    expect(await p.mutation(api.journal.clearJournal, { scope: "demo" })).toEqual(
      { done: true }
    );
    expect(await p.query(api.journal.hasDemo, {})).toBe(false);
    const left = await p.query(api.journal.deals, {});
    expect(left?.map((d) => d.account)).toEqual(["5001"]);
    expect(await p.query(api.journal.signals, {})).toEqual([]);

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
