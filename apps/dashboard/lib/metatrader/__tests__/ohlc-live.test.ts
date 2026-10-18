import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeForming, mt5BarStart } from "../ohlc-live";

const OFF = 3 * 3_600_000; // broker UTC+3
const H = 3_600_000;
// 2026-10-14 12:00 at the broker
const T = Date.UTC(2026, 9, 14, 9, 0, 0);

describe("mt5BarStart", () => {
  it("aligns to the broker clock like MT5", () => {
    assert.equal(mt5BarStart(T + 25 * 60_000, "M15", OFF), T + 15 * 60_000);
    assert.equal(mt5BarStart(T + 3 * H, "H4", OFF), T);
    // D1 starts at the broker's midnight (21:00 UTC)
    assert.equal(mt5BarStart(T, "D1", OFF), Date.UTC(2026, 9, 13, 21));
    // W1 on Sunday, MN1 on the 1st (broker midnight)
    assert.equal(mt5BarStart(T, "W1", OFF), Date.UTC(2026, 9, 10, 21));
    assert.equal(mt5BarStart(T, "MN1", OFF), Date.UTC(2026, 8, 30, 21));
  });
});

describe("composeForming", () => {
  // H1 sample taken at 12:05 with that M1 (2 ticks so far)
  const sample = [T, 1.1, 1.2, 1.05, 1.15, 40, 0, 5];
  const sampleM1 = [T + 5 * 60_000, 1.15, 1.16, 1.14, 1.15, 2, 0, 5];

  it("extends the sample with the live M1 of the same minute", () => {
    const m1 = [T + 5 * 60_000, 1.15, 1.25, 1.14, 1.22, 9, 0, 4];
    assert.deepEqual(composeForming("H1", sample, sampleM1, m1, OFF), [
      T,
      1.1,
      1.25,
      1.05,
      1.22,
      47,
      0,
      4,
    ]);
  });

  it("opens a new candle when the M1 is past the sample's period", () => {
    const m1 = [T + H, 1.3, 1.31, 1.29, 1.3, 3, 0, 5];
    assert.deepEqual(composeForming("H1", sample, sampleM1, m1, OFF), [
      T + H,
      1.3,
      1.31,
      1.29,
      1.3,
      3,
      0,
      5,
    ]);
  });

  it("uses the M1 itself for M1 and the sample without an M1", () => {
    const m1 = [T, 1, 2, 0.5, 1.5, 1, 0, 1];
    assert.equal(composeForming("M1", sample, sampleM1, m1, OFF), m1);
    assert.equal(
      composeForming("H1", sample, sampleM1, undefined, OFF),
      sample
    );
  });
});
