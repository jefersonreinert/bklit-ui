import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkOrder,
  lotForRisk,
  mt5Symbol,
  offsetPrice,
  partialTargets,
  pipSize,
  roundVolume,
  type SymbolSpec,
  tpForR,
} from "../lot";
import { computeTicket } from "../ticket";

const EURUSD: SymbolSpec = {
  symbol: "EURUSD",
  digits: 5,
  point: 0.000_01,
  tickSize: 0.000_01,
  tickValue: 1,
  contractSize: 100_000,
  volumeMin: 0.01,
  volumeMax: 50,
  volumeStep: 0.01,
  stopsLevel: 0,
};

const XAUUSD: SymbolSpec = {
  ...EURUSD,
  symbol: "XAUUSD",
  digits: 2,
  point: 0.01,
  tickSize: 0.01,
  tickValue: 1,
  contractSize: 100,
};

describe("lot calculator", () => {
  it("1 % of $50,000 with a 20-pip stop on EURUSD is 2.50 lots", () => {
    const r = lotForRisk({
      balance: 50_000,
      riskPct: 1,
      entry: 1.116,
      sl: 1.114,
      spec: EURUSD,
    });
    assert.equal(r.lot, 2.5);
    assert.equal(r.riskTarget, 500);
    assert.ok(Math.abs(r.risk - 500) < 1e-6);
    assert.ok(Math.abs(r.slPips - 20) < 1e-9);
  });

  it("counts the commission and rounds down (never risks more)", () => {
    const r = lotForRisk({
      balance: 50_000,
      riskPct: 1,
      entry: 1.116,
      sl: 1.114,
      spec: EURUSD,
      commissionPerLot: 7,
    });
    assert.equal(r.lot, 2.41);
    assert.ok(r.risk <= 500);
    assert.ok(r.riskPct < 1);
  });

  it("works on gold (2 digits, $1 per 0.01 per lot)", () => {
    const r = lotForRisk({
      balance: 50_000,
      riskPct: 1,
      entry: 2400,
      sl: 2390,
      spec: XAUUSD,
    });
    assert.equal(r.lot, 0.5);
    assert.equal(pipSize(XAUUSD), 0.01);
  });

  it("gives 0 under the minimum volume", () => {
    assert.equal(roundVolume(0.004, EURUSD), 0);
    assert.equal(roundVolume(0.019, EURUSD), 0.01);
    assert.equal(roundVolume(99, EURUSD), 50);
  });

  it("places SL/TP by pips and TP by R", () => {
    assert.equal(offsetPrice("buy", 1.116, 20, EURUSD, "sl"), 1.114);
    assert.equal(offsetPrice("sell", 1.116, 20, EURUSD, "sl"), 1.118);
    assert.equal(offsetPrice("buy", 1.116, 30, EURUSD, "tp"), 1.119);
    assert.equal(tpForR("buy", 1.116, 1.114, 2, EURUSD), 1.12);
    assert.equal(tpForR("sell", 1.116, 1.118, 1.5, EURUSD), 1.113);
  });

  it("splits partial take profits by R and % of the initial lot", () => {
    const t = partialTargets(
      "buy",
      1.116,
      1.114,
      1,
      [
        { r: 2, pct: 25 },
        { r: 1, pct: 50 },
      ],
      EURUSD
    );
    assert.deepEqual(t, [
      { price: 1.118, pct: 50, volume: 0.5 },
      { price: 1.12, pct: 25, volume: 0.25 },
    ]);
  });

  it("drops partials too small for the volume step", () => {
    // 0.01 lot cannot be split: no partials, the final TP closes it all
    const t = partialTargets(
      "sell",
      1.116,
      1.118,
      0.01,
      [{ r: 1, pct: 50 }],
      EURUSD
    );
    assert.deepEqual(t, []);
  });

  it("never closes more than 100 % in partials", () => {
    const t = partialTargets(
      "sell",
      1.116,
      1.118,
      1,
      [
        { r: 1, pct: 60 },
        { r: 2, pct: 60 },
      ],
      EURUSD
    );
    assert.deepEqual(t, [
      { price: 1.114, pct: 60, volume: 0.6 },
      { price: 1.112, pct: 40, volume: 0.4 },
    ]);
  });

  it("checks the order before sending", () => {
    const quote = { bid: 1.1159, ask: 1.116 };
    const base = {
      side: "buy" as const,
      type: "market" as const,
      entry: 1.116,
      sl: 1.114,
      tp: 1.12,
      lot: 1,
      quote,
      spec: EURUSD,
    };
    assert.equal(checkOrder(base).ok, true);
    assert.equal(checkOrder({ ...base, sl: 1.117 }).ok, false);
    assert.equal(checkOrder({ ...base, sl: 0 }).ok, false);
    assert.equal(checkOrder({ ...base, tp: 1.115 }).ok, false);
    assert.equal(checkOrder({ ...base, lot: 0 }).ok, false);
    // Buy limit must be below the ask, buy stop above
    assert.equal(
      checkOrder({ ...base, type: "limit", entry: 1.115, sl: 1.113 }).ok,
      true
    );
    assert.equal(
      checkOrder({ ...base, type: "limit", entry: 1.117, sl: 1.115 }).ok,
      false
    );
    assert.equal(
      checkOrder({ ...base, type: "stop", entry: 1.117, sl: 1.115, tp: 1.12 })
        .ok,
      true
    );
    const near = { ...EURUSD, stopsLevel: 300 };
    assert.equal(checkOrder({ ...base, spec: near }).ok, false);
  });
});

describe("chart symbol → MT5", () => {
  it("maps Yahoo symbols to the terminal names", () => {
    const mt = ["EURUSD", "XAUUSD", "BTCUSD", "US500", "GBPJPY.a"];
    assert.equal(mt5Symbol("EURUSD=X", mt), "EURUSD");
    assert.equal(mt5Symbol("GC=F", mt), "XAUUSD");
    assert.equal(mt5Symbol("BTC-USD", mt), "BTCUSD");
    assert.equal(mt5Symbol("^GSPC", mt), "US500");
    assert.equal(mt5Symbol("GBPJPY=X", mt), "GBPJPY.a");
    assert.equal(mt5Symbol("PETR4.SA", mt), null);
  });
});

describe("order ticket", () => {
  const prefs = {
    riskPct: 1,
    slMode: "pips" as const,
    slPips: 20,
    tpMode: "rr" as const,
    rr: 2,
    commission: 0,
    partialsOn: true,
    levels: [{ r: 1, pct: 50 }],
    breakeven: true,
  };
  const base = {
    prefs,
    side: "buy" as const,
    type: "market" as const,
    pendingPrice: 0,
    slPrice: 0,
    tpPrice: 0,
    spec: EURUSD,
    quote: {
      bid: 1.1159,
      ask: 1.116,
      tickValue: 1,
      marginBuy: 3720,
      marginSell: 3720,
    },
    balance: 50_000,
    limits: { maxLot: 5, maxRiskPct: 2 },
  };

  it("buys at the ask: 1 % with 20 pips, TP 1:2 and a 50 % partial at 1R", () => {
    const t = computeTicket(base);
    assert.ok(t);
    assert.equal(t.entry, 1.116);
    assert.equal(t.sl, 1.114);
    assert.equal(t.tp, 1.12);
    assert.equal(t.lot.lot, 2.5);
    assert.deepEqual(t.targets, [{ price: 1.118, pct: 50, volume: 1.25 }]);
    assert.equal(t.margin, 2.5 * 3720);
    assert.ok(Math.abs(t.reward - 1000) < 1e-6);
    assert.deepEqual(t.errors, []);
  });

  it("flags the EA limits", () => {
    const t = computeTicket({
      ...base,
      prefs: { ...prefs, riskPct: 3 },
      limits: { maxLot: 1, maxRiskPct: 2 },
    });
    assert.equal(t?.errors.length, 2);
  });

  it("waits for a quote and for the price of a pending order", () => {
    assert.equal(
      computeTicket({ ...base, quote: { ...base.quote, bid: 0 } }),
      null
    );
    assert.equal(computeTicket({ ...base, type: "limit" }), null);
  });
});
