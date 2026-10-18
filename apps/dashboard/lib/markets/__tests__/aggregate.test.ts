import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OhlcCandle, OhlcTick } from "../../metatrader/ohlc-feed";
import {
  aggregateCandles,
  aggregateTicks,
  bucketStart,
  createAggregator,
} from "../aggregate";
import { parseTimeframe } from "../timeframe";

const tf = (text: string) => {
  const parsed = parseTimeframe(text);
  if (!parsed) {
    throw new Error(`invalid timeframe ${text}`);
  }
  return parsed;
};

const UTC = { offsetMs: 0, brokerOffsetMs: 0 };
const T = Date.UTC(2026, 9, 14, 9, 0, 0);

const tick = (dt: number, bid: number, flags = 2, last = 0, volume = 0) => ({
  time: T + dt,
  bid,
  ask: bid + 0.0002,
  last,
  volume,
  flags,
});

// Checked by hand: bid chart, the ask-only tick (flags 4) does not count
const TICKS: OhlcTick[] = [
  tick(120, 1.1, 6),
  tick(800, 1.1003),
  tick(1500, 1.0998, 6),
  tick(1600, 1.0998, 4),
  tick(2100, 1.1001),
  tick(5900, 1.1005),
  tick(9000, 1.099),
];

const ohlcv = (c: OhlcCandle) => [
  c.time - T,
  c.open,
  c.high,
  c.low,
  c.close,
  c.volume,
];

const m1 = (minute: number, base = T): OhlcCandle => ({
  time: base + minute * 60_000,
  open: 1 + minute,
  high: 1.5 + minute,
  low: 0.5 + minute,
  close: 1.2 + minute,
  volume: 10,
  realVolume: 1,
  spread: 5 + (minute % 3),
});

describe("aggregateTicks", () => {
  it("builds 2s candles from known ticks", () => {
    assert.deepEqual(aggregateTicks(TICKS, tf("2s"), "bid", UTC).map(ohlcv), [
      [0, 1.1, 1.1003, 1.0998, 1.0998, 3],
      [2000, 1.1001, 1.1001, 1.1001, 1.1001, 1],
      [4000, 1.1005, 1.1005, 1.1005, 1.1005, 1],
      // 6–8 s had no ticks: no candle
      [8000, 1.099, 1.099, 1.099, 1.099, 1],
    ]);
  });

  it("builds 3s candles from the same ticks", () => {
    assert.deepEqual(aggregateTicks(TICKS, tf("3s"), "bid", UTC).map(ohlcv), [
      [0, 1.1, 1.1003, 1.0998, 1.1001, 4],
      [3000, 1.1005, 1.1005, 1.1005, 1.1005, 1],
      [9000, 1.099, 1.099, 1.099, 1.099, 1],
    ]);
  });

  it("uses the last price and real volume on exchange charts", () => {
    const trades = [
      tick(100, 1, 8, 50, 2),
      tick(200, 1, 2, 0, 0),
      tick(1200, 1, 24, 51, 3),
    ];
    const [c] = aggregateTicks(trades, tf("2s"), "last", UTC);
    assert.deepEqual(
      c && [c.open, c.close, c.volume, c.realVolume],
      [50, 51, 2, 5]
    );
  });

  it("builds tick candles that restart every day", () => {
    const out = aggregateTicks(TICKS, tf("2T"), "bid", UTC);
    assert.deepEqual(
      out.map((c) => c.volume),
      [2, 2, 2]
    );
    assert.equal(out[1]?.time, T + 1500);
  });
});

describe("aggregateCandles", () => {
  it("builds 7m from M1, aligned to midnight", () => {
    const day = Date.UTC(2026, 9, 14);
    const src = Array.from({ length: 16 }, (_, i) => m1(i, day));
    const out = aggregateCandles(src, tf("7m"), UTC);
    assert.deepEqual(
      out.map((c) => [(c.time - day) / 60_000, c.volume]),
      [
        [0, 70],
        [7, 70],
        [14, 20],
      ]
    );
    const first = out[0];
    assert.deepEqual(
      first && [first.open, first.high, first.low, first.close],
      [1, 7.5, 0.5, 7.2]
    );
  });

  it("restarts the 7m count at midnight (1440 is not a multiple of 7)", () => {
    const day = Date.UTC(2026, 9, 15);
    const src = [-6, -5, -1, 0, 6, 7].map((m) => m1(m, day));
    assert.deepEqual(
      aggregateCandles(src, tf("7m"), UTC).map((c) => (c.time - day) / 60_000),
      [-12, -5, 0, 7]
    );
  });

  it("follows the broker's day for D, W and M", () => {
    const broker = { offsetMs: 3 * 3_600_000, brokerOffsetMs: 3 * 3_600_000 };
    // 1 Oct 00:00 at a UTC+3 broker
    const oct = Date.UTC(2026, 8, 30, 21);
    assert.equal(bucketStart(oct, tf("1M"), broker), oct);
    assert.equal(bucketStart(oct + 5 * 86_400_000, tf("1M"), broker), oct);
    // W1 candles are stamped on Sunday: 2W groups each pair of weeks
    const sunday = Date.UTC(2026, 9, 10, 21); // Sun 11 Oct at the broker
    const weeks = [0, 1, 2, 3].map((w) => ({
      ...m1(0, sunday + w * 7 * 86_400_000),
      time: sunday + w * 7 * 86_400_000,
    }));
    const out = aggregateCandles(weeks, tf("2W"), broker);
    assert.equal(out.length, 2);
    // Monday 12 Oct 00:00 at the broker
    assert.equal(out[0]?.time, Date.UTC(2026, 9, 11, 21));
  });

  it("can align intraday candles to UTC instead of the broker", () => {
    const t = Date.UTC(2026, 9, 14, 0, 10);
    assert.equal(
      bucketStart(t, tf("7m"), { offsetMs: 0, brokerOffsetMs: 10_800_000 }),
      Date.UTC(2026, 9, 14, 0, 7)
    );
    // Broker midnight is 21:00 UTC: 03:10 local → 03:09 local = 00:09 UTC
    assert.equal(
      bucketStart(t, tf("7m"), {
        offsetMs: 10_800_000,
        brokerOffsetMs: 10_800_000,
      }),
      Date.UTC(2026, 9, 14, 0, 9)
    );
  });
});

describe("createAggregator", () => {
  it("matches the full computation for live ticks", () => {
    const ticks: OhlcTick[] = [];
    let price = 1.1;
    for (let i = 0; i < 400; i++) {
      price += Math.sin(i * 1.7) * 0.0003;
      ticks.push(tick(i * 137 + (i % 3), price, i % 5 === 0 ? 4 : 2));
    }
    for (const id of ["2s", "3s", "15s", "1m", "10T"]) {
      const agg = createAggregator(tf(id), UTC, "bid", {
        ticks: ticks.slice(0, 50),
      });
      for (let i = 50; i < ticks.length; i += 7) {
        assert.ok(agg.addTicks(ticks.slice(i, i + 7)));
      }
      assert.deepEqual(
        agg.candles,
        aggregateTicks(ticks, tf(id), "bid", UTC),
        id
      );
    }
  });

  it("applies forming-candle updates like the full computation", () => {
    const final = Array.from({ length: 30 }, (_, i) => m1(i));
    const agg = createAggregator(tf("7m"), UTC, "bid", {
      candles: final.slice(0, 10),
    });
    for (const c of final.slice(10)) {
      // The forming M1 arrives three times with new values
      agg.addCandles([{ ...c, close: 0, high: c.high - 0.1 }]);
      agg.addCandles([{ ...c, low: c.low - 9 }]);
      agg.addCandles([c]);
    }
    assert.deepEqual(agg.candles, aggregateCandles(final, tf("7m"), UTC));
  });

  it("asks for a rebuild when older data arrives", () => {
    const agg = createAggregator(tf("2s"), UTC, "bid", { ticks: TICKS });
    assert.equal(agg.addTicks([tick(0, 1)]), false);
    const bars = createAggregator(tf("7m"), UTC, "bid", { candles: [m1(20)] });
    assert.equal(bars.addCandles([m1(1)]), false);
  });
});
