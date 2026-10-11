import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dealsFromBody,
  normalizeDeal,
  parseSignal,
  parseTime,
  sameToken,
} from "../ingest";
import {
  buildTrades,
  computeStats,
  type Deal,
  formatDuration,
} from "../metrics";

const T0 = Date.UTC(2026, 9, 5, 9, 0);
const H = 3_600_000;

function deal(p: Partial<Deal>): Deal {
  return {
    account: "123",
    ticket: "1",
    position: "1",
    symbol: "EURUSD",
    side: "buy",
    entry: "in",
    volume: 1,
    price: 1.1,
    sl: 0,
    tp: 0,
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    magic: 0,
    comment: "",
    time: T0,
    ...p,
  };
}

const DEALS: Deal[] = [
  // Win: buy 1.1000 → 1.1050, SL 1.0950 (1R = 50 pips) → +1R
  deal({ ticket: "1", position: "A", sl: 1.095, commission: -3 }),
  deal({
    ticket: "2",
    position: "A",
    side: "sell",
    entry: "out",
    price: 1.105,
    profit: 500,
    time: T0 + 2 * H,
  }),
  // Loss: sell, closed in two parts
  deal({
    ticket: "3",
    position: "B",
    side: "sell",
    price: 1.2,
    volume: 2,
    time: T0 + 3 * H,
  }),
  deal({
    ticket: "4",
    position: "B",
    side: "buy",
    entry: "out",
    price: 1.21,
    volume: 1,
    profit: -100,
    time: T0 + 4 * H,
  }),
  deal({
    ticket: "5",
    position: "B",
    side: "buy",
    entry: "out",
    price: 1.21,
    volume: 1,
    profit: -100,
    swap: -2,
    time: T0 + 5 * H,
  }),
  // Still open
  deal({ ticket: "6", position: "C", symbol: "XAUUSD", time: T0 + 6 * H }),
];

describe("trades", () => {
  it("groups deals by position, nets costs and computes R", () => {
    const trades = buildTrades(DEALS);
    const a = trades.find((t) => t.position === "A");
    const b = trades.find((t) => t.position === "B");
    const c = trades.find((t) => t.position === "C");
    assert.equal(a?.net, 497);
    assert.ok(Math.abs((a?.r ?? 0) - 1) < 1e-9);
    assert.equal(b?.side, "sell");
    assert.equal(b?.net, -202);
    assert.equal(b?.closeTime, T0 + 5 * H);
    assert.equal(c?.closeTime, null);
    assert.equal(c?.openVolume, 1);
  });

  it("computes the journal statistics", () => {
    const s = computeStats(buildTrades(DEALS));
    assert.equal(s.trades, 2);
    assert.equal(s.winRate, 0.5);
    assert.equal(s.net, 295);
    assert.ok(Math.abs((s.profitFactor ?? 0) - 497 / 202) < 1e-9);
    assert.equal(s.maxDrawdown, 202);
    assert.equal(s.long.net, 497);
    assert.equal(s.short.trades, 1);
    assert.equal(s.equity.at(-1)?.value, 295);
    assert.equal(s.costs, -5);
    assert.equal(formatDuration(2 * H), "2h 0m");
  });
});

describe("webhook payloads", () => {
  it("accepts EA deals in several shapes and drops non-trades", () => {
    const ok = normalizeDeal({
      account: 5001,
      ticket: 77,
      position: 70,
      symbol: "EURUSD",
      type: "DEAL_TYPE_SELL",
      entry: "DEAL_ENTRY_OUT",
      volume: "0.10",
      price: 1.0851,
      profit: 12.5,
      time: 1_760_000_000,
    });
    assert.equal(ok?.side, "sell");
    assert.equal(ok?.entry, "out");
    assert.equal(ok?.time, 1_760_000_000_000);
    assert.equal(
      normalizeDeal({ type: "balance", ticket: 1, symbol: "" }),
      null
    );
    assert.equal(dealsFromBody({ deals: [ok, { nope: 1 }] }).length, 1);
    assert.equal(parseTime("2026.10.05 09:30"), Date.parse("2026-10-05T09:30"));
  });

  it("parses the exact JSON the CasaBrasaJournal EA sends", () => {
    const body = JSON.parse(
      '{"account":"5001","server":"Demo","name":"Broker","deals":[{"account":"5001","ticket":"77","position":"70","symbol":"XAUUSD","type":"sell","entry":"out","volume":0.1000,"price":2350.12000000,"sl":0.00000000,"tp":0.00000000,"profit":-12.50,"commission":-0.70,"swap":0.00,"fee":0.00,"magic":0,"comment":"[sl 2350.12]","time_msc":1760000000123}]}'
    );
    const [d] = dealsFromBody(body);
    assert.equal(d?.time, 1_760_000_000_123);
    assert.equal(d?.entry, "out");
    assert.equal(d?.commission, -0.7);
  });

  it("reads TradingView JSON alerts and plain text", () => {
    const j = parseSignal(
      '{"ticker":"OANDA:EURUSD","action":"buy","contracts":"1","price":"1.0850","position":"long","time":"2026-10-05T09:00:00Z"}'
    );
    assert.equal(j.ticker, "OANDA:EURUSD");
    assert.equal(j.action, "buy");
    assert.equal(j.price, 1.085);
    assert.equal(j.time, Date.parse("2026-10-05T09:00:00Z"));
    const t = parseSignal("SELL XAUUSD @ 2350.5 breakout", 5);
    assert.equal(t.action, "sell");
    assert.equal(t.ticker, "XAUUSD");
    assert.equal(t.price, 2350.5);
    assert.equal(t.time, 5);
  });

  it("compares tokens strictly", () => {
    assert.equal(sameToken("abc", "abc"), true);
    assert.equal(sameToken("abc", "abd"), false);
    assert.equal(sameToken("", ""), false);
  });
});
