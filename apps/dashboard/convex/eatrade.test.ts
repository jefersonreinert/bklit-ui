import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

const SPEC = {
  symbol: "EURUSD",
  digits: 5,
  point: 0.000_01,
  tick_size: 0.000_01,
  tick_value: 1,
  contract_size: 100_000,
  volume_min: 0.01,
  volume_max: 50,
  volume_step: 0.01,
  stops_level: 0,
};

const state = (over: Record<string, unknown> = {}) => ({
  account: "53095644",
  server: "ICMarketsEU-Demo",
  info: {
    balance: 50_000,
    equity: 50_000,
    margin: 0,
    free_margin: 50_000,
    leverage: 30,
    currency: "USD",
    trade_allowed: true,
    demo: true,
  },
  limits: {
    allow_trading: true,
    max_lot: 1,
    max_risk_pct: 2,
    demo_only: true,
    require_sl: true,
  },
  positions: [],
  orders: [],
  quotes: [
    {
      symbol: "EURUSD",
      bid: 1.1159,
      ask: 1.116,
      spread: 10,
      tick_value: 1,
      margin_buy: 3720,
      margin_sell: 3720,
      time_msc: 1,
    },
  ],
  specs: [SPEC],
  symbols: ["EURUSD", "XAUUSD"],
  plans: [],
  results: [],
  ...over,
});

async function setup() {
  const t = convexTest(schema, modules);
  const token = await t
    .withIdentity(panel)
    .mutation(api.journal.ensureToken, {});
  const sync = async (over: Record<string, unknown> = {}) => {
    const res = await t.fetch(`/journal/mt5/sync?token=${token}`, {
      method: "POST",
      body: JSON.stringify(state(over)),
    });
    if (res.status !== 200) {
      throw new Error(`sync ${res.status}`);
    }
    return (await res.text()).split("\n").filter(Boolean);
  };
  return { t, token, sync, p: t.withIdentity(panel) };
}

const order = {
  account: "53095644",
  symbol: "EURUSD",
  side: "buy" as const,
  orderType: "market" as const,
  volume: 0.5,
  sl: 1.114,
  tp: 1.12,
  partials: [{ price: 1.118, volume: 0.25 }],
  breakeven: true,
  comment: "painel",
};

describe("trading from the panel (EA v4.10)", () => {
  it("rejects the sync without the token", async () => {
    const { t } = await setup();
    const res = await t.fetch("/journal/mt5/sync?token=x", {
      method: "POST",
      body: JSON.stringify(state()),
    });
    expect(res.status).toBe(401);
  });

  it("stores the terminal state and polls slowly while nobody watches", async () => {
    const { sync, p } = await setup();
    const lines = await sync();
    expect(lines[0]).toBe("next_ms=15000");
    expect(lines[1]).toBe("watch=");
    const s = await p.query(api.eatrade.session, {});
    expect(s?.info.balance).toBe(50_000);
    expect(s?.symbols).toEqual(["EURUSD", "XAUUSD"]);
    const specs = await p.query(api.eatrade.specs, {
      account: "53095644",
      symbols: ["EURUSD"],
    });
    expect(specs?.[0]?.tickSize).toBe(0.000_01);
  });

  it("hands each order to the EA once and records the result", async () => {
    const { sync, p } = await setup();
    await sync();
    await p.mutation(api.eatrade.watch, {
      account: "53095644",
      symbols: ["EURUSD"],
    });
    const id = await p.mutation(api.eatrade.sendOrder, order);
    const lines = await sync();
    expect(lines[0]).toBe("next_ms=1000");
    expect(lines[1]).toBe("watch=EURUSD");
    const cmd = lines
      .find((l) => l.startsWith("cmd="))
      ?.slice(4)
      .split("\t");
    expect(cmd?.slice(0, 10)).toEqual([
      id,
      "open",
      "EURUSD",
      "buy",
      "market",
      "0.5",
      "0",
      "1.114",
      "1.12",
      "",
    ]);
    expect(cmd?.[11]).toBe("1.118@0.25");
    expect(cmd?.[12]).toBe("1");
    // Never sent twice
    expect((await sync()).some((l) => l.startsWith("cmd="))).toBe(false);
    await sync({
      results: [
        {
          id,
          ok: true,
          retcode: 10_009,
          message: "done",
          ticket: "2003086999",
          price: 1.116,
          volume: 0.5,
        },
      ],
    });
    const [c] = (await p.query(api.eatrade.commands, {
      account: "53095644",
    })) ?? [{}];
    expect(c).toMatchObject({
      status: "done",
      result: { ticket: "2003086999" },
    });
  });

  it("applies the EA limits before queueing", async () => {
    const { sync, p } = await setup();
    await sync();
    await expect(
      p.mutation(api.eatrade.sendOrder, { ...order, volume: 2 })
    ).rejects.toThrow("máximo do EA");
    await expect(
      p.mutation(api.eatrade.sendOrder, { ...order, sl: 0 })
    ).rejects.toThrow("stop loss");
    // 1 lot with a 100-pip stop risks $1,000 = 2 % (allowed); 1.5 % max fails
    await sync({ limits: { ...state().limits, max_risk_pct: 1.5 } });
    await expect(
      p.mutation(api.eatrade.sendOrder, { ...order, volume: 1, sl: 1.106 })
    ).rejects.toThrow("arrisca");
    await sync({ limits: { ...state().limits, allow_trading: false } });
    await expect(p.mutation(api.eatrade.sendOrder, order)).rejects.toThrow(
      "InpAllowTrading"
    );
    await sync({ info: { ...state().info, demo: false } });
    await expect(p.mutation(api.eatrade.sendOrder, order)).rejects.toThrow(
      "só demo"
    );
  });

  it("expires orders that wait too long", async () => {
    vi.useFakeTimers();
    try {
      const { sync, p } = await setup();
      await sync();
      await p.mutation(api.eatrade.sendOrder, order);
      vi.advanceTimersByTime(11_000);
      const lines = await sync();
      expect(lines.some((l) => l.startsWith("cmd="))).toBe(false);
      const [c] = (await p.query(api.eatrade.commands, {
        account: "53095644",
      })) ?? [{}];
      expect(c).toMatchObject({ status: "expired" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes, partially closes, modifies and cancels", async () => {
    const { sync, p } = await setup();
    await sync({
      positions: [
        {
          ticket: "77",
          symbol: "EURUSD",
          type: "buy",
          volume: 1,
          price_open: 1.116,
          price_current: 1.117,
          sl: 1.114,
          tp: 0,
          profit: 100,
          swap: 0,
          time_msc: 1,
        },
      ],
      orders: [
        {
          ticket: "88",
          symbol: "EURUSD",
          type: "buy_limit",
          volume: 0.1,
          price: 1.11,
          sl: 1.108,
          tp: 0,
          time_msc: 1,
        },
      ],
    });
    const acc = { account: "53095644" };
    await p.mutation(api.eatrade.closePosition, {
      ...acc,
      ticket: "77",
      volume: 0.5,
    });
    await p.mutation(api.eatrade.modify, {
      ...acc,
      ticket: "77",
      sl: 1.116,
      tp: 0,
    });
    await p.mutation(api.eatrade.cancelOrder, { ...acc, ticket: "88" });
    await expect(
      p.mutation(api.eatrade.closePosition, { ...acc, ticket: "99" })
    ).rejects.toThrow("não encontrada");
    const kinds = (await sync())
      .filter((l) => l.startsWith("cmd="))
      .map((l) => l.split("\t").at(1));
    expect(kinds.sort()).toEqual(["cancel", "close", "modify"]);
  });

  it("works without the panel's access code", async () => {
    const { t, sync } = await setup();
    await sync();
    expect(await t.query(api.eatrade.session, {})).not.toBeNull();
    await t.mutation(api.eatrade.sendOrder, order);
  });
});
