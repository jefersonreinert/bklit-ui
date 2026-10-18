import {
  type ChartPrice,
  type OhlcCandle,
  type OhlcTick,
  TICK_FLAG,
} from "../metatrader/ohlc-feed";
import { type CustomTf, DAY } from "./timeframe";

/**
 * Builds custom-timeframe candles from MT5 candles or ticks.
 *
 * - open = first, high = max, low = min, close = last; volume = sum (from
 *   ticks: the tick count, like MT5's tick_volume; realVolume = the sum of
 *   the ticks' real volume).
 * - No trades, no candle: empty periods are never invented.
 * - Intraday candles start at the day's midnight of the alignment clock
 *   (`offsetMs`: the broker's by default, like MT5, or 0 for UTC): 2s
 *   candles start at :00, :02…; 7m candles every 7 minutes from midnight.
 * - Days, weeks (starting on Monday) and months follow the broker's
 *   midnight (`brokerOffsetMs`), like MT5.
 * - Tick candles (100T) restart the count every day.
 */

export interface AlignOptions {
  /** Intraday alignment clock − UTC (ms). */
  offsetMs: number;
  /** Broker clock − UTC (ms), for days, weeks and months. */
  brokerOffsetMs: number;
}

/** Monday 00:00 is day 4 of the epoch (1970-01-01 was a Thursday). */
const MONDAY = 4;

/** Start (UTC ms) of the candle that contains `time`. */
export function bucketStart(time: number, tf: CustomTf, o: AlignOptions) {
  switch (tf.unit) {
    case "D": {
      const day = Math.floor((time + o.brokerOffsetMs) / DAY);
      return Math.floor(day / tf.n) * tf.n * DAY - o.brokerOffsetMs;
    }
    case "W": {
      const day = Math.floor((time + o.brokerOffsetMs) / DAY);
      const week = Math.floor((day - MONDAY) / 7);
      const start = Math.floor(week / tf.n) * tf.n * 7 + MONDAY;
      return start * DAY - o.brokerOffsetMs;
    }
    case "M": {
      const d = new Date(time + o.brokerOffsetMs);
      const index = d.getUTCFullYear() * 12 + d.getUTCMonth();
      const start = Math.floor(index / tf.n) * tf.n;
      return Date.UTC(Math.floor(start / 12), start % 12, 1) - o.brokerOffsetMs;
    }
    default: {
      const local = time + o.offsetMs;
      if (tf.ms <= 0) {
        return time;
      }
      if (tf.ms > DAY) {
        return Math.floor(local / tf.ms) * tf.ms - o.offsetMs;
      }
      const day = Math.floor(local / DAY) * DAY;
      return day + Math.floor((local - day) / tf.ms) * tf.ms - o.offsetMs;
    }
  }
}

/** Day (alignment clock) of a time, where tick candles restart counting. */
const dayOf = (time: number, o: AlignOptions) =>
  Math.floor((time + o.offsetMs) / DAY);

/**
 * W1 candles are stamped on Sunday (the broker's week): bucket them by the
 * Monday that follows so they land in their own week.
 */
const probeTime = (c: OhlcCandle, tf: CustomTf) =>
  tf.unit === "W" ? c.time + DAY : c.time;

function startCandle(time: number, src: OhlcCandle): OhlcCandle {
  return { ...src, time };
}

function extend(out: OhlcCandle, c: OhlcCandle) {
  out.high = Math.max(out.high, c.high);
  out.low = Math.min(out.low, c.low);
  out.close = c.close;
  out.volume += c.volume;
  out.realVolume += c.realVolume;
  out.spread = Math.min(out.spread, c.spread);
}

/** Source candles (sorted, one per time) → custom-timeframe candles. */
export function aggregateCandles(
  source: OhlcCandle[],
  tf: CustomTf,
  o: AlignOptions
): OhlcCandle[] {
  const out: OhlcCandle[] = [];
  let bucket = Number.NaN;
  for (const c of source) {
    const b = bucketStart(probeTime(c, tf), tf, o);
    const last = out.at(-1);
    if (last && b === bucket) {
      extend(last, c);
    } else {
      bucket = b;
      out.push(startCandle(b, c));
    }
  }
  return out;
}

/** Is a TICK_FLAG_* bit (a power of two) set? */
const hasFlag = (flags: number, bit: number) =>
  Math.floor(flags / bit) % 2 === 1;

/** Does this tick move the chart price (bid charts: bid changes; exchange: trades)? */
export function tickCounts(t: OhlcTick, price: ChartPrice) {
  if (price === "last") {
    return t.flags ? hasFlag(t.flags, TICK_FLAG.last) : t.last > 0;
  }
  return t.flags ? hasFlag(t.flags, TICK_FLAG.bid) : t.bid > 0;
}

const tickPrice = (t: OhlcTick, price: ChartPrice) =>
  price === "last" ? t.last : t.bid;

function tickCandle(time: number, t: OhlcTick, price: ChartPrice): OhlcCandle {
  const p = tickPrice(t, price);
  return {
    time,
    open: p,
    high: p,
    low: p,
    close: p,
    volume: 1,
    realVolume: t.volume,
    spread: 0,
  };
}

function growWithTick(c: OhlcCandle, t: OhlcTick, price: ChartPrice) {
  const p = tickPrice(t, price);
  c.high = Math.max(c.high, p);
  c.low = Math.min(c.low, p);
  c.close = p;
  c.volume += 1;
  c.realVolume += t.volume;
}

/** Ticks (sorted) → candles of a time or tick-count timeframe. */
export function aggregateTicks(
  ticks: OhlcTick[],
  tf: CustomTf,
  price: ChartPrice,
  o: AlignOptions
): OhlcCandle[] {
  const agg = createAggregator(tf, o, price);
  agg.addTicks(ticks);
  return agg.candles;
}

export interface Aggregator {
  /** The candles so far (mutated in place; copy before handing to React). */
  readonly candles: OhlcCandle[];
  /**
   * Live ticks in time order. Returns false when a tick is older than the
   * last candle (history arrived): rebuild with aggregateTicks.
   */
  addTicks(ticks: OhlcTick[]): boolean;
  /** Source candles, upserted by time (the forming one many times). */
  addCandles(source: OhlcCandle[]): boolean;
}

/**
 * Incremental aggregation for live data: only the last candle changes or
 * a new one opens, nothing is recomputed. Seed it with the history.
 */
export function createAggregator(
  tf: CustomTf,
  o: AlignOptions,
  price: ChartPrice = "bid",
  seed: { candles?: OhlcCandle[]; ticks?: OhlcTick[] } = {}
): Aggregator {
  const candles: OhlcCandle[] = [];
  // Source candles of the last bucket (time → candle), to apply upserts
  let current = new Map<number, OhlcCandle>();
  let bucket = Number.NaN;
  // Tick candles: day and count of the last candle
  let tickDay = Number.NaN;
  let tickCount = 0;
  let lastTick = Number.NEGATIVE_INFINITY;

  const rebuildLast = () => {
    const rows = [...current.values()].sort((a, b) => a.time - b.time);
    const first = rows[0];
    if (!first) {
      return;
    }
    const c = startCandle(bucket, first);
    for (const r of rows.slice(1)) {
      extend(c, r);
    }
    candles[candles.length - 1] = c;
  };

  const addCandle = (src: OhlcCandle) => {
    const b = bucketStart(probeTime(src, tf), tf, o);
    if (b === bucket) {
      current.set(src.time, src);
      rebuildLast();
      return true;
    }
    if (!Number.isNaN(bucket) && b < bucket) {
      return false;
    }
    bucket = b;
    current = new Map([[src.time, src]]);
    candles.push(startCandle(b, src));
    return true;
  };

  const addTick = (t: OhlcTick) => {
    if (t.time < lastTick) {
      return false;
    }
    lastTick = t.time;
    if (!tickCounts(t, price)) {
      return true;
    }
    const last = candles.at(-1);
    if (tf.unit === "T") {
      const day = dayOf(t.time, o);
      if (last && day === tickDay && tickCount < tf.n) {
        growWithTick(last, t, price);
        tickCount++;
      } else {
        tickDay = day;
        tickCount = 1;
        candles.push(tickCandle(t.time, t, price));
      }
      return true;
    }
    const b = bucketStart(t.time, tf, o);
    if (last && b === bucket) {
      growWithTick(last, t, price);
    } else {
      bucket = b;
      candles.push(tickCandle(b, t, price));
    }
    return true;
  };

  const agg: Aggregator = {
    candles,
    addTicks(ticks) {
      for (const t of ticks) {
        if (!addTick(t)) {
          return false;
        }
      }
      return true;
    },
    addCandles(source) {
      for (const c of source) {
        if (!addCandle(c)) {
          return false;
        }
      }
      return true;
    },
  };
  if (seed.candles) {
    agg.addCandles(seed.candles);
  }
  if (seed.ticks) {
    agg.addTicks(seed.ticks);
  }
  return agg;
}
