import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseYahooChart, periodChange } from "../history";
import {
  DEFAULT_ITEMS,
  groupBySection,
  guessSection,
  normalizeSections,
  splitPips,
} from "../sections";
import { type Bar, ema, ratingOf, rsi, sma, technicals } from "../technicals";

const trend = (n: number, step: number, start = 100): Bar[] =>
  Array.from({ length: n }, (_, i) => {
    const c = start + i * step + Math.sin(i) * 0.3;
    return { high: c + 0.5, low: c - 0.5, close: c };
  });

const UP_RATINGS = new Set(["buy", "strong_buy"]);
const DOWN_RATINGS = new Set(["sell", "strong_sell"]);

describe("technicals", () => {
  it("computes moving averages and RSI", () => {
    assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
    const e = ema([1, 2, 3, 4, 5], 3);
    assert.equal(e[2], 2);
    assert.ok(Math.abs((e[4] ?? 0) - 4) < 1e-9);
    const up = rsi(
      Array.from({ length: 30 }, (_, i) => i),
      14
    );
    assert.equal(up.at(-1), 100);
  });

  it("maps scores to TradingView's five ratings", () => {
    assert.equal(ratingOf(0.6), "strong_buy");
    assert.equal(ratingOf(0.3), "buy");
    assert.equal(ratingOf(0), "neutral");
    assert.equal(ratingOf(-0.3), "sell");
    assert.equal(ratingOf(-0.9), "strong_sell");
  });

  it("reads an uptrend as buy and a downtrend as sell", () => {
    const up = technicals(trend(260, 0.5));
    const down = technicals(trend(260, -0.5, 300));
    assert.ok(up && down);
    assert.ok(UP_RATINGS.has(up.ma.rating), up.ma.rating);
    assert.ok(DOWN_RATINGS.has(down.ma.rating), down.ma.rating);
    assert.ok(up.score > down.score);
    assert.equal(up.ma.signals.length, 12);
    assert.equal(up.osc.signals.length, 7);
    assert.equal(
      up.counts.buy + up.counts.neutral + up.counts.sell,
      [...up.ma.signals, ...up.osc.signals].filter((s) => s.value != null)
        .length
    );
  });

  it("needs enough history", () => {
    assert.equal(technicals(trend(20, 1)), null);
  });
});

describe("watchlist sections", () => {
  it("guesses sections like TradingView's lists", () => {
    assert.equal(guessSection("EURUSD=X"), "Forex");
    assert.equal(guessSection("^TNX"), "Juros");
    assert.equal(guessSection("GC=F"), "Commodities");
    assert.equal(guessSection("^GSPC"), "Índices");
    assert.equal(guessSection("DX-Y.NYB"), "Índices");
    assert.equal(guessSection("BTC-USD"), "Cripto");
    assert.equal(guessSection("PETR4.SA", "EQUITY"), "Ações");
  });

  it("migrates lists saved without sections", () => {
    const { items, sections } = normalizeSections(
      [
        { symbol: "EURUSD=X", label: "EURUSD", name: "Euro" },
        { symbol: "XYZ", label: "XYZ", name: "x", section: "Swing" },
      ],
      undefined
    );
    assert.equal(items[0]?.section, "Forex");
    assert.ok(sections.includes("Swing"));
    const groups = groupBySection(items, sections);
    assert.equal(groups.find((g) => g.name === "Swing")?.items.length, 1);
  });

  it("has a default list with every section filled", () => {
    const groups = groupBySection(
      DEFAULT_ITEMS,
      normalizeSections(DEFAULT_ITEMS, undefined).sections
    );
    for (const g of groups) {
      assert.ok(g.items.length > 0, g.name);
    }
  });

  it("splits fractional pips", () => {
    assert.deepEqual(splitPips("1.12005", 5), { main: "1.1200", pip: "5" });
    assert.deepEqual(splitPips("151.234", 3), { main: "151.23", pip: "4" });
    assert.deepEqual(splitPips("7,817.30", 2), { main: "7,817.30", pip: "" });
  });
});

describe("history", () => {
  const yahoo = {
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: 102.232,
            chartPreviousClose: 102.114,
            regularMarketDayHigh: 102.335,
            regularMarketDayLow: 101.92,
            currency: "USD",
            fullExchangeName: "ICE Futures",
            longName: "US Dollar Index",
            priceHint: 3,
          },
          timestamp: [1, 2, 3],
          indicators: {
            quote: [
              {
                open: [102.128, 102.2, null],
                high: [102.3, 102.3, null],
                low: [101.9, 102.1, null],
                close: [102.1, 102.232, null],
              },
            ],
          },
        },
      ],
    },
  };

  it("parses Yahoo's chart and skips empty bars", () => {
    const h = parseYahooChart(yahoo);
    assert.ok(h);
    assert.equal(h.points.length, 2);
    assert.equal(h.meta.open, 102.128);
    assert.equal(h.meta.previousClose, 102.114);
    assert.equal(h.meta.exchange, "ICE Futures");
    assert.equal(parseYahooChart({}), null);
  });

  it("measures change from the previous close (1D) or the period start", () => {
    const h = parseYahooChart(yahoo);
    assert.ok(h);
    const day = periodChange(h, "1D");
    assert.ok(day && Math.abs(day.abs - 0.118) < 1e-9);
    const range = periodChange(h, "5Y");
    assert.ok(range && Math.abs(range.abs - 0.132) < 1e-9);
  });
});
