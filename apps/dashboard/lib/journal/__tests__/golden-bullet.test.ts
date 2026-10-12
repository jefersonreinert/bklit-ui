import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  cashFlows,
  divergences,
  eaOffline,
  eaTotals,
  type HistoryPoint,
  marketOpen,
} from "../account";
import { groupBy, macroOf, summarize } from "../analytics";
import {
  cashFromBody,
  dealsFromBody,
  normalizeDeal,
  offsetFromBody,
  statsFromBody,
} from "../ingest";
import { buildTrades, type Deal, marketOf } from "../metrics";
import { serverOffset, suggestImpact, symbolCurrencies } from "../news";
import { cleanOptions, noteOptionsOf } from "../note-fields";

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")
  ) as unknown;

const H = 3_600_000;

describe("TradingJournal Complete deals", () => {
  it("reads the EA example: R:R 2, 1 % / $100, 400 points, 2 h", () => {
    const deals = dealsFromBody(fixture("POST_journal_mt5.json"));
    assert.equal(deals.length, 2);
    const [open, close] = deals;
    assert.equal(open?.rr, undefined);
    assert.equal(close?.riskUsd, 100);
    const [t] = buildTrades(deals);
    assert.ok(t);
    assert.equal(t.rrPlanned, 2);
    assert.equal(t.riskPct, 0.01);
    assert.equal(t.riskUsd, 100);
    assert.equal(t.profitPoints, 400);
    assert.equal(t.outcome, "win");
    assert.equal(t.market, "Forex");
    assert.equal(t.accountType, "Personal");
    assert.equal((t.closeTime ?? 0) - t.openTime, 2 * H);
    assert.equal(t.net, 196.5);
  });

  it("keeps old deals valid and leaves absent extras out", () => {
    const d = normalizeDeal({
      ticket: 1,
      symbol: "XAUUSD",
      type: "buy",
      entry: "in",
      rr: "abc",
      outcome: "maybe",
      market: "",
    });
    assert.ok(d);
    for (const k of ["rr", "outcome", "market", "riskPct", "equityAt"]) {
      assert.equal(k in d, false, k);
    }
    const [t] = buildTrades([d]);
    assert.equal(t?.rrPlanned, null);
    assert.equal(t?.market, "Commodities");
  });

  it("adds risk and points of partial closes and keeps the last outcome", () => {
    const base = {
      account: "1",
      position: "9",
      symbol: "EURUSD",
      volume: 1,
      price: 1,
      sl: 0,
      tp: 0,
      profit: 0,
      commission: 0,
      swap: 0,
      fee: 0,
      magic: 0,
      comment: "",
    };
    const deals: Deal[] = [
      { ...base, ticket: "1", side: "buy", entry: "in", time: 0 },
      {
        ...base,
        ticket: "2",
        side: "sell",
        entry: "out",
        volume: 0.5,
        time: H,
        riskUsd: 50,
        profitPoints: 100,
        outcome: "win",
      },
      {
        ...base,
        ticket: "3",
        side: "sell",
        entry: "out",
        volume: 0.5,
        time: 2 * H,
        riskUsd: 50,
        profitPoints: -20,
        outcome: "loss",
      },
    ];
    const [t] = buildTrades(deals);
    assert.equal(t?.riskUsd, 100);
    assert.equal(t?.profitPoints, 80);
    assert.equal(t?.outcome, "loss");
    assert.equal(t?.riskPct, null);
  });

  it("deduces the market like the EA", () => {
    assert.equal(marketOf("BTCUSD"), "Cryptocurrencies");
    assert.equal(marketOf("US500.cash"), "Equities");
    assert.equal(marketOf("GBPJPY"), "Forex");
  });

  it("averages EA risk in the group rows", () => {
    const trades = buildTrades(dealsFromBody(fixture("POST_journal_mt5.json")));
    const row = summarize("x", "x", trades);
    assert.equal(row.avgRiskPct, 0.01);
    assert.equal(row.avgRR, 2);
    assert.equal(row.points, 400);
    const byMarket = groupBy(trades, (t) => t.market);
    assert.deepEqual(
      byMarket.map((r) => r.key),
      ["Forex"]
    );
  });
});

describe("account statistics", () => {
  it("parses the EA example (week 77 %, month 19 %)", () => {
    const p = statsFromBody(fixture("POST_journal_mt5_stats.json"));
    assert.ok(p);
    assert.equal(p.account, "52784901");
    assert.equal(p.currency, "USD");
    assert.equal(p.accountType, "Personal");
    assert.equal(p.serverTime, 1_760_283_000_000);
    assert.equal(Math.round(p.stats.weeklyTargetProgress * 100), 77);
    assert.equal(Math.round(p.stats.monthlyTargetProgress * 100), 19);
    assert.equal(p.stats.totalTrades, 5);
  });

  it("drops unknown fields, zeroes bad numbers, needs an account", () => {
    const p = statsFromBody({
      account: 7,
      stats: { balance: "1e999", equity: "12,5", hacker: 1 },
    });
    assert.equal(p?.stats.balance, 0);
    assert.equal(p?.stats.equity, 12.5);
    assert.equal("hacker" in (p?.stats ?? {}), false);
    assert.equal(statsFromBody({ stats: {} }), null);
    assert.equal(statsFromBody([1]), null);
  });

  it("flags EA totals that differ from the stored deals", () => {
    const deals = dealsFromBody(fixture("POST_journal_mt5.json"));
    const panel = eaTotals(deals);
    // One closed position: 200 − 1.75 (entry) − 1.75 (exit)
    assert.deepEqual(panel, { trades: 1, net: 196.5 });
    assert.deepEqual(
      divergences({ totalTrades: 1, netProfit: 196.5 }, panel),
      []
    );
    const issues = divergences({ totalTrades: 5, netProfit: 296.5 }, panel);
    assert.deepEqual(
      issues.map((i) => i.field),
      ["trades", "net"]
    );
  });

  it("finds deposits and withdrawals between snapshots", () => {
    const p = (time: number, balance: number, netProfit: number) =>
      ({
        time,
        balance,
        equity: balance,
        netProfit,
        dailyProfit: 0,
        winRate: 0,
        profitFactor: 0,
        initialDeposit: 1000,
        withdrawal: 0,
      }) satisfies HistoryPoint;
    const flows = cashFlows([
      p(1, 1000, 0),
      p(2, 1050, 50),
      p(3, 1550, 50),
      p(4, 1300, 100),
    ]);
    assert.deepEqual(flows, [
      { time: 3, amount: 500 },
      { time: 4, amount: -300 },
    ]);
  });

  it("is offline only after 15 min while the market is open", () => {
    const wed = Date.UTC(2026, 9, 14, 12);
    assert.equal(eaOffline(wed - 10 * 60_000, wed), false);
    assert.equal(eaOffline(wed - 20 * 60_000, wed), true);
    const sat = Date.UTC(2026, 9, 17, 12);
    assert.equal(marketOpen(sat), false);
    assert.equal(eaOffline(sat - 5 * H, sat), false);
  });
});

describe("EA v4.01: balance operations and broker clock", () => {
  it("reads deposits apart from the trades", () => {
    const body = {
      account: "53095644",
      server_offset_sec: 10_800,
      deals: [
        {
          account: "53095644",
          ticket: "9",
          type: "balance",
          kind: "deposit",
          amount: 50_000,
          comment: "Deposit",
          time_msc: 1_760_270_000_000,
        },
        {
          account: "53095644",
          ticket: "10",
          type: "balance",
          amount: -100,
          time_msc: 1_760_280_000_000,
        },
      ],
    };
    assert.deepEqual(dealsFromBody(body), []);
    const cash = cashFromBody(body);
    assert.equal(cash.length, 2);
    assert.equal(cash[0]?.kind, "deposit");
    assert.equal(cash[0]?.amount, 50_000);
    assert.equal(cash[1]?.kind, "withdrawal");
    assert.equal(offsetFromBody(body), 3 * H);
  });

  it("takes the offset of the statistics", () => {
    const p = statsFromBody({ account: "1", server_offset_sec: 7200 });
    assert.equal(p?.offsetMs, 2 * H);
    assert.equal(statsFromBody({ account: "1" })?.offsetMs, undefined);
  });

  it("counts a partially closed position once, like the EA", () => {
    const base = {
      account: "a",
      position: "p",
      symbol: "EURUSD",
      volume: 1,
      price: 1,
      sl: 0,
      tp: 0,
      swap: 0,
      fee: 0,
      magic: 0,
      comment: "",
    };
    const deals: Deal[] = [
      {
        ...base,
        ticket: "1",
        side: "buy",
        entry: "in",
        profit: 0,
        commission: -2,
        time: 0,
      },
      {
        ...base,
        ticket: "2",
        side: "sell",
        entry: "out",
        volume: 0.5,
        profit: 30,
        commission: -1,
        time: H,
      },
      {
        ...base,
        ticket: "3",
        side: "sell",
        entry: "out",
        volume: 0.5,
        profit: -10,
        commission: -1,
        time: 2 * H,
      },
    ];
    assert.deepEqual(eaTotals(deals), { trades: 1, net: 16 });
  });
});

describe("Notion fields", () => {
  it("finds the entry macro on the New York clock", () => {
    // October: New York = UTC-4
    assert.equal(macroOf(Date.UTC(2026, 9, 5, 13, 55)), "09:50–10:10");
    assert.equal(macroOf(Date.UTC(2026, 9, 5, 6, 33)), "02:33–03:00");
    assert.equal(macroOf(Date.UTC(2026, 9, 5, 14, 10)), "Fora de macro");
  });

  it("merges edited options over the defaults", () => {
    const o = noteOptionsOf({ bias: ["Long", "Short"], tradeType: [] });
    assert.deepEqual(o.bias, ["Long", "Short"]);
    assert.ok(o.tradeType.includes("Scalp"));
    assert.deepEqual(cleanOptions([" A ", "A", "", "B"]), ["A", "B"]);
  });

  it("suggests News Impact from the calendar", () => {
    assert.deepEqual(symbolCurrencies("EURUSD.r"), ["EUR", "USD"]);
    assert.deepEqual(symbolCurrencies("XAUUSD"), ["USD"]);
    assert.deepEqual(symbolCurrencies("GER40"), ["EUR"]);
    const nfp = Date.UTC(2026, 9, 2, 12, 30);
    const offset = 3 * H;
    const events = [
      {
        time: new Date(nfp).toISOString(),
        currency: "USD",
        impact: "high",
        title: "Non-Farm Payrolls",
      },
      {
        time: new Date(nfp).toISOString(),
        currency: "JPY",
        impact: "high",
        title: "Other",
      },
    ];
    // Entry 10 min after NFP, on a UTC+3 broker clock
    const entry = nfp + 10 * 60_000 + offset;
    assert.equal(
      suggestImpact("EURUSD", entry, events, offset)?.impact,
      "High"
    );
    assert.equal(suggestImpact("EURUSD", entry, events, 0), null);
    assert.equal(suggestImpact("EURGBP", entry, events, offset), null);
    assert.equal(serverOffset(nfp + offset + 4000, nfp), offset);
  });
});
