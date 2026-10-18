import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  appendTicks,
  applyOhlcFeed,
  createOhlcStore,
  mergeCandles,
  type OhlcCandle,
  type OhlcTick,
  parseOhlcFeed,
  replaceTicks,
} from "../ohlc-feed";

// Written by mql5/tests/OhlcExportSelfTest.mq5 with the EA's own functions
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "fixtures", `ohlc-${name}.json`),
      "utf8"
    )
  );

// 2026-10-14 12:00 at a UTC+3 broker = 09:00 UTC
const T = Date.UTC(2026, 9, 14, 9, 0, 0);

const candle = (time: number, close: number): OhlcCandle => ({
  time,
  open: 1,
  high: 2,
  low: 0.5,
  close,
  volume: 1,
  realVolume: 0,
  spread: 0,
});

const tick = (time: number, bid: number): OhlcTick => ({
  time,
  bid,
  ask: bid + 0.0001,
  last: 0,
  volume: 0,
  flags: 6,
});

describe("parseOhlcFeed", () => {
  it("reads the EA's snapshot with UTC times", () => {
    const feed = parseOhlcFeed(fixture("snapshot"));
    assert.ok(feed);
    assert.equal(feed.type, "snapshot");
    assert.equal(feed.account, "12345");
    assert.equal(feed.offsetSec, 10_800);
    assert.equal(feed.seq, 1);
    const [m1, h4] = feed.series;
    assert.equal(m1?.symbol, "EURUSD");
    assert.equal(m1?.tf, "M1");
    assert.equal(m1?.sec, 60);
    assert.deepEqual(
      m1?.bars.map((b) => b.time),
      [T, T + 60_000, T + 120_000]
    );
    assert.deepEqual(m1?.bars[0], {
      time: T,
      open: 1.160_01,
      high: 1.1601,
      low: 1.159_95,
      close: 1.160_08,
      volume: 42,
      realVolume: 0,
      spread: 7,
    });
    // H4 of 08:00 at the broker = 05:00 UTC
    assert.equal(h4?.symbol, "XAUUSD");
    assert.equal(h4?.bars[0]?.time, Date.UTC(2026, 9, 14, 5, 0, 0));
    assert.equal(h4?.digits, 2);
  });

  it("reads ticks keeping the order of ticks in the same ms", () => {
    const feed = parseOhlcFeed(fixture("ticks"));
    const block = feed?.ticks[0];
    assert.equal(feed?.type, "ticks");
    assert.equal(block?.chart, "bid");
    assert.equal(block?.rows.length, 5);
    assert.deepEqual(
      block?.rows.slice(0, 2).map((t) => [t.time, t.bid, t.flags]),
      [
        [T + 120, 1.160_01, 6],
        [T + 120, 1.160_02, 6],
      ]
    );
  });

  it("reads history with its range, request and history start", () => {
    const feed = parseOhlcFeed(fixture("history"));
    const s = feed?.series[0];
    assert.equal(feed?.requestId, "req_123");
    assert.equal(s?.fromMs, T);
    assert.equal(s?.toMs, T + 179_000);
    // 2010-01-04 00:00 at the broker = 2010-01-03 21:00 UTC
    assert.equal(s?.firstMs, Date.UTC(2010, 0, 3, 21, 0, 0));
  });

  it("reads a heartbeat", () => {
    const feed = parseOhlcFeed(fixture("heartbeat"));
    assert.equal(feed?.type, "heartbeat");
    assert.deepEqual([feed?.series, feed?.ticks], [[], []]);
  });

  it("rejects other payloads and drops invalid rows", () => {
    const base = fixture("snapshot") as Record<string, unknown>;
    assert.equal(parseOhlcFeed({ ...base, v: 2 }), null);
    assert.equal(parseOhlcFeed({ ...base, source: "x" }), null);
    assert.equal(parseOhlcFeed({ ...base, type: "trade" }), null);
    assert.equal(parseOhlcFeed({ ...base, account: "" }), null);
    assert.equal(parseOhlcFeed("nope"), null);
    const feed = parseOhlcFeed({
      ...base,
      series: [
        { symbol: "EURUSD", tf: "M7", bars: [[T, 1, 2, 0.5, 1]] },
        {
          symbol: "EURUSD",
          tf: "M1",
          bars: [
            [T, 1, 2, 0.5, 1.5],
            [T + 60_000, 1, 0.5, 2, 1],
            [T + 120_000, 1, 2],
            "x",
            [T, 1, 2, 0.5, 1.7],
          ],
        },
      ],
      ticks: [{ symbol: "EURUSD", rows: [[T], [T, 0, 0, 0], [T, 1.1]] }],
    });
    assert.equal(feed?.series.length, 1);
    // Same time twice: deduplicated, the last copy wins
    assert.deepEqual(
      feed?.series[0]?.bars.map((b) => [b.time, b.close]),
      [[T, 1.7]]
    );
    assert.equal(feed?.ticks[0]?.rows.length, 1);
  });

  it("converts broker times to UTC when time_utc is false", () => {
    const feed = parseOhlcFeed({
      ...(fixture("ticks") as Record<string, unknown>),
      time_utc: false,
      ticks: [
        { symbol: "EURUSD", rows: [[T + 10_800_000, 1.1, 1.2, 0, 0, 6]] },
      ],
    });
    assert.equal(feed?.ticks[0]?.rows[0]?.time, T);
  });
});

describe("mergeCandles", () => {
  const base = [candle(0, 1), candle(60, 2), candle(120, 3)];

  it("replaces the forming candle and appends a new one", () => {
    assert.deepEqual(
      mergeCandles(base, [candle(120, 4)]).map((c) => c.close),
      [1, 2, 4]
    );
    assert.deepEqual(
      mergeCandles(base, [candle(120, 4), candle(180, 5)]).map((c) => c.close),
      [1, 2, 4, 5]
    );
  });

  it("upserts re-sent old candles without duplicates", () => {
    const out = mergeCandles(base, [candle(60, 9), candle(-60, 0)]);
    assert.deepEqual(
      out.map((c) => [c.time, c.close]),
      [
        [-60, 0],
        [0, 1],
        [60, 9],
        [120, 3],
      ]
    );
  });

  it("keeps the newest candles within the limit", () => {
    assert.deepEqual(
      mergeCandles(base, [candle(180, 5)], 2).map((c) => c.time),
      [120, 180]
    );
  });
});

describe("ticks", () => {
  it("drops the overlap of a re-sent POST", () => {
    const a = [tick(1, 1), tick(2, 2), tick(2, 3)];
    const resent = [tick(2, 2), tick(2, 3), tick(3, 4)];
    assert.deepEqual(
      appendTicks(a, resent).map((t) => t.bid),
      [1, 2, 3, 4]
    );
    // Two real ticks equal to the stored ones are kept when they do not overlap
    assert.equal(appendTicks(a, [tick(2, 9)]).length, 4);
  });

  it("replaces a range with a history block", () => {
    const a = [tick(1, 1), tick(5, 5), tick(9, 9)];
    assert.deepEqual(
      replaceTicks(a, [tick(4, 4), tick(6, 6)], 3, 7).map((t) => t.time),
      [1, 4, 6, 9]
    );
  });
});

describe("applyOhlcFeed", () => {
  it("builds the store and counts missed sends", () => {
    const store = createOhlcStore();
    const snap = parseOhlcFeed(fixture("snapshot"));
    const ticks = parseOhlcFeed(fixture("ticks"));
    const hb = parseOhlcFeed(fixture("heartbeat"));
    assert.ok(snap && ticks && hb);
    applyOhlcFeed(store, snap);
    applyOhlcFeed(store, ticks);
    applyOhlcFeed(store, ticks);
    applyOhlcFeed(store, hb);
    assert.equal(store.series.get("EURUSD|M1")?.length, 3);
    assert.equal(store.series.get("XAUUSD|H4")?.length, 1);
    // The same ticks twice (a re-send) are stored once
    assert.equal(store.ticks.get("EURUSD")?.length, 5);
    assert.equal(store.chart.get("EURUSD"), "bid");
    // seq 1, 2, (2), 4: seq 3 never arrived
    assert.equal(store.missedSeq, 1);
    assert.equal(store.lastSeq, 4);
  });
});
