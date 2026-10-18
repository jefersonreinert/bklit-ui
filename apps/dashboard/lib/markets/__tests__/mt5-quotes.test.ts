import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchFeedSymbol } from "../mt5-candles";
import { type EaQuote, mergeEaQuotes } from "../mt5-quotes";

// Real IC Markets names
const BROKER = [
  "EURUSD",
  "US500",
  "USTEC",
  "US30",
  "XAUUSD",
  "XTIUSD",
  "DXY_Z6",
  "AAPL.NAS",
  "AAPL.NAS-24",
  "GOOG.NAS",
  "META.NAS-24",
  "US2000",
];

describe("matchFeedSymbol", () => {
  it("links platform labels to the broker's names", () => {
    const cases: [string, string | null][] = [
      ["EURUSD", "EURUSD"],
      ["SPX500", "US500"],
      ["NAS100", "USTEC"],
      ["US30", "US30"],
      ["USOIL", "XTIUSD"],
      ["DXY", "DXY_Z6"],
      ["AAPL", "AAPL.NAS"],
      ["GOOGL", "GOOG.NAS"],
      ["META", "META.NAS-24"],
      ["IBOV", null],
    ];
    for (const [label, want] of cases) {
      assert.equal(matchFeedSymbol(label, BROKER), want, label);
    }
    assert.equal(matchFeedSymbol("EURUSD", ["EURUSDm"]), "EURUSDm");
  });
});

describe("mergeEaQuotes", () => {
  const q = (symbol: string, bid: number, prevClose: number | null) =>
    ({ symbol, digits: 2, bid, ask: bid + 1, tickMs: 1, prevClose }) as EaQuote;

  it("puts MT5 prices on the watchlist and lists the other EA symbols", () => {
    const items = [
      { symbol: "^GSPC", label: "SPX500", name: "S&P 500" },
      { symbol: "^BVSP", label: "IBOV", name: "Ibovespa" },
    ];
    const yahoo = {
      "^BVSP": {
        symbol: "^BVSP",
        price: 1,
        prevClose: 1,
        change: 0,
        changePct: 0,
        currency: "BRL",
        name: "Ibovespa",
        digits: 2,
        marketState: "REGULAR",
      },
    };
    const { quotes, extra } = mergeEaQuotes(items, yahoo, [
      q("US500", 7700, 7600),
      q("US2000", 2500, null),
    ]);
    assert.equal(quotes["^GSPC"]?.price, 7700);
    assert.equal(quotes["^GSPC"]?.changePct.toFixed(4), "1.3158");
    assert.equal(quotes["^BVSP"]?.marketState, "REGULAR");
    assert.deepEqual(
      extra.map((e) => [e.symbol, e.label, e.section]),
      [["mt5:US2000", "US2000", "MT5 (EA)"]]
    );
    assert.equal(quotes["mt5:US2000"]?.change, 0);
  });
});
