import type { Row } from "./ohlc-archive";
import { OHLC_TF_SEC, type OhlcTf } from "./ohlc-feed";

/**
 * Forming candles of every timeframe from a once-a-minute sample plus the
 * live M1, the way MT5 builds the timeframes above M1 from M1 data.
 *
 * The EA sends the 21 forming candles when a new M1 opens (`sample`, taken
 * with `sampleM1`) and only the M1 on every tick. The forming candle of a
 * timeframe is then the sample extended by the live M1:
 * high/low/close follow the M1, and the volume swaps the M1 volume of the
 * sample moment for the current one.
 */

const DAY = 86_400_000;
/** 1970-01-04 (epoch day 3) was a Sunday: MT5 weeks start on Sunday. */
const SUNDAY = 3;

/** Start (UTC ms) of the MT5 candle of `tf` containing `t` (broker clock). */
export function mt5BarStart(t: number, tf: OhlcTf, offsetMs: number) {
  const local = t + offsetMs;
  if (tf === "MN1") {
    const d = new Date(local);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - offsetMs;
  }
  if (tf === "W1") {
    const day = Math.floor(local / DAY);
    return (Math.floor((day - SUNDAY) / 7) * 7 + SUNDAY) * DAY - offsetMs;
  }
  const ms = OHLC_TF_SEC[tf] * 1000;
  return Math.floor(local / ms) * ms - offsetMs;
}

const at = (r: Row, i: number) => r[i] ?? 0;

/** Forming candle of `tf` now, from its sample and the live M1. */
export function composeForming(
  tf: OhlcTf,
  sample: Row | undefined,
  sampleM1: Row | undefined,
  m1: Row | undefined,
  offsetMs: number
): Row | undefined {
  if (tf === "M1") {
    return m1 ?? sample;
  }
  if (!m1) {
    return sample;
  }
  const start = mt5BarStart(at(m1, 0), tf, offsetMs);
  if (!sample || at(sample, 0) < start) {
    // A new candle of this timeframe opened with this M1
    return [
      start,
      at(m1, 1),
      at(m1, 2),
      at(m1, 3),
      at(m1, 4),
      at(m1, 5),
      at(m1, 6),
      at(m1, 7),
    ];
  }
  if (at(sample, 0) > start) {
    return sample;
  }
  // The sample already counts the M1 volume it saw; count the M1 once, now
  const sameM1 = sampleM1 !== undefined && at(sampleM1, 0) === at(m1, 0);
  const seen = sameM1 ? at(sampleM1, 5) : 0;
  const seenReal = sameM1 ? at(sampleM1, 6) : 0;
  return [
    at(sample, 0),
    at(sample, 1),
    Math.max(at(sample, 2), at(m1, 2)),
    Math.min(at(sample, 3), at(m1, 3)),
    at(m1, 4),
    at(sample, 5) - seen + at(m1, 5),
    at(sample, 6) - seenReal + at(m1, 6),
    Math.min(at(sample, 7), at(m1, 7)),
  ];
}
