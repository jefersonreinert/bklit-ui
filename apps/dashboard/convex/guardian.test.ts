import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

const GUARDIAN = JSON.parse(
  readFileSync(
    new URL(
      "../lib/journal/__tests__/fixtures/sync_guardian.json",
      import.meta.url
    ),
    "utf8"
  )
);

const state = (over: Record<string, unknown> = {}) => ({
  account: "53095644",
  server: "ICMarketsEU-Demo",
  info: {
    balance: 99_000,
    equity: 96_100,
    margin: 0,
    free_margin: 96_000,
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
  quotes: [],
  specs: [],
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
  return { t, sync, p: t.withIdentity(panel) };
}

describe("FTMO Risk Guardian (EA v4.20)", () => {
  it("leaves the EA v4.10 sync as it was", async () => {
    const { sync, p } = await setup();
    const lines = await sync();
    expect(lines[0]).toBe("next_ms=15000");
    expect(await p.query(api.guardian.status, {})).toBeNull();
    const s = await p.query(api.eatrade.session, {});
    expect(s?.info.balance).toBe(99_000);
  });

  it("stores the protection state, the FTMO day and the events", async () => {
    const { sync, p } = await setup();
    const lines = await sync({ guardian: GUARDIAN });
    expect(lines[0]).toBe("next_ms=15000");
    const g = await p.query(api.guardian.status, {});
    expect(g?.account).toBe("53095644");
    expect(g?.state).toBe(2);
    expect(g?.dailyLimit).toBe(5000);
    expect(g?.dailyUsePct).toBe(80);
    expect(g?.pragueDay).toBe("2026-10-16");
    const days = await p.query(api.guardian.days, { account: "53095644" });
    expect(days).toHaveLength(1);
    expect(days[0]?.maxDailyUsePct).toBe(80);
    expect(days[0]?.blocks).toBe(1);
    const ev = await p.query(api.guardian.events, { account: "53095644" });
    expect(ev.map((e) => e.kind)).toEqual(["ESTADO_BLOQUEADO"]);
    // The trading session is still stored as before
    const s = await p.query(api.eatrade.session, {});
    expect(s?.info.equity).toBe(96_100);
  });

  it("does not repeat events resent by the EA and keeps the worst of the day", async () => {
    const { sync, p } = await setup();
    await sync({ guardian: GUARDIAN });
    await sync({
      guardian: {
        ...GUARDIAN,
        state: 1,
        daily_use_pct: 65,
        est_equity: 96_750,
      },
    });
    const ev = await p.query(api.guardian.events, { account: "53095644" });
    expect(ev).toHaveLength(1);
    const days = await p.query(api.guardian.days, { account: "53095644" });
    expect(days[0]?.blocks).toBe(1);
    expect(days[0]?.maxDailyUsePct).toBe(80);
    expect(days[0]?.maxState).toBe(2);
    expect(days[0]?.minEstEquity).toBe(96_000);
    const g = await p.query(api.guardian.status, {});
    expect(g?.state).toBe(1);
  });
});
