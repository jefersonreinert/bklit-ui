import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanced,
  groupBy,
  groupings,
  killZoneOf,
  modelResolver,
  monthlyReturns,
  periodKey,
  rHistogram,
  sessionOf,
  traderScore,
} from "../analytics";
import type { Trade } from "../metrics";

const H = 3_600_000;
// 2026-10-05 is a Monday; New York is UTC-4 in October
const MON = Date.UTC(2026, 9, 5, 13, 30); // 09:30 NY

function trade(p: Partial<Trade>): Trade {
  const openTime = p.openTime ?? MON;
  return {
    key: `1:${openTime}`,
    account: "1",
    position: String(openTime),
    symbol: "EURUSD",
    side: "buy",
    openTime,
    closeTime: openTime + H,
    openPrice: 1,
    closePrice: 1,
    volume: 1,
    openVolume: 0,
    sl: 0,
    tp: 0,
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    net: 0,
    r: null,
    magic: 0,
    comment: "",
    rrPlanned: null,
    riskPct: null,
    riskUsd: null,
    profitPoints: null,
    outcome: null,
    accountType: null,
    market: "Forex",
    deals: [],
    ...p,
  };
}

const TRADES = [
  trade({ net: 100, r: 2 }),
  trade({ openTime: MON + 24 * H, net: -50, r: -1, symbol: "XAUUSD" }),
  trade({ openTime: MON + 48 * H, net: 80, r: 1.6, side: "sell" }),
  trade({ openTime: MON + 49 * H, closeTime: null, net: 999 }),
];

describe("journal analytics", () => {
  it("classifies sessions and kill zones on the New York clock", () => {
    assert.equal(sessionOf(MON), "Londres + NY");
    assert.equal(killZoneOf(MON), "NY AM KZ (07-10)");
    assert.equal(
      killZoneOf(Date.UTC(2026, 9, 5, 14, 15)),
      "Silver Bullet (10-11)"
    );
    assert.equal(sessionOf(Date.UTC(2026, 9, 5, 2)), "Ásia");
    // January: New York is UTC-5
    assert.equal(killZoneOf(Date.UTC(2026, 0, 6, 8)), "London KZ (02-05)");
  });

  it("buckets periods and keeps fixed orders", () => {
    assert.equal(
      periodKey(Date.UTC(2026, 9, 8, 12), "week", "UTC"),
      "2026-10-05"
    );
    assert.equal(periodKey(MON, "month", "UTC"), "2026-10");
    const g = groupings(TRADES, "UTC", () => "Modelo");
    assert.equal(g.hour.length, 24);
    assert.equal(g.hour[13]?.trades, 3);
    assert.equal(g.minute[6]?.trades, 3);
    assert.equal(g.side[1]?.net, 80);
    assert.equal(g.symbol[0]?.key, "EURUSD");
    assert.equal(g.model[0]?.trades, 3);
    const days = groupBy(TRADES, (t) => periodKey(t.openTime, "day", "UTC"));
    assert.equal(days.length, 3);
  });

  it("computes risk ratios and drawdown periods", () => {
    const a = advanced(TRADES, "UTC");
    assert.equal(a.tradingDays, 3);
    assert.equal(a.greenDays, 2);
    assert.equal(a.redDays, 1);
    assert.equal(a.bestDay?.net, 100);
    assert.equal(a.worstDay?.net, -50);
    assert.equal(a.recoveryFactor, 130 / 50);
    assert.equal(a.maxDrawdownMs, 48 * H);
    assert.equal(a.currentDrawdown, 0);
    assert.ok(Math.abs((a.expectancyR ?? 0) - 2.6 / 3) < 1e-9);
    assert.ok((a.sharpe ?? 0) > 0);
  });

  it("builds histograms, monthly returns and the trader score", () => {
    const h = rHistogram(TRADES);
    assert.equal(h.find((b) => b.key === "+2R")?.wins, 1);
    assert.equal(h.find((b) => b.key === "-1R")?.losses, 1);
    const m = monthlyReturns(TRADES, "UTC");
    assert.equal(m[0]?.months[9], 130);
    assert.equal(m[0]?.total, 130);
    const s = traderScore(TRADES, "UTC");
    assert.equal(s.parts.length, 6);
    assert.ok(s.total > 0 && s.total <= 100);
  });

  it("resolves the trading model", () => {
    const of = modelResolver(new Map([["1:1", "Breaker"]]));
    assert.equal(of(trade({ key: "1:1", comment: "x" })), "Breaker");
    assert.equal(of(trade({ comment: "FVG London" })), "FVG London");
    assert.equal(of(trade({ comment: "[sl 1.1]", magic: 7 })), "EA 7");
    assert.equal(of(trade({})), "Manual");
  });
});
