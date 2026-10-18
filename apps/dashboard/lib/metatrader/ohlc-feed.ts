/**
 * OHLC feed of the CasaBrasaOHLCExport EA (public/journal/CasaBrasaOHLCExport.mq5).
 *
 * The EA posts JSON envelopes to POST /ohlc/mt5 (or writes them as JSONL):
 *
 *   { v: 1, type: "snapshot" | "update" | "history" | "ticks" | "heartbeat",
 *     source: "mt5-ohlc", account, server, broker, offset_sec, time_utc,
 *     sent_ms, seq, request_id?, done?, error?, first_ms?, ticks_end_ms?,
 *     series?: [{ symbol, tf, sec, digits, from_ms?, to_ms?, first_ms?,
 *                 bars: [[t_ms, open, high, low, close, tick_volume, real_volume, spread]] }],
 *     ticks?:  [{ symbol, digits, chart: "bid" | "last", from_ms?, to_ms?,
 *                 rows: [[t_ms, bid, ask, last, volume, flags]] }] }
 *
 * Times are UTC ms (time_utc) or broker ms; parseOhlcFeed always returns UTC.
 * Candles are upserted by (account, symbol, tf, time): the forming candle
 * arrives many times. Ticks are only appended (the EA never repeats one);
 * a block with from_ms/to_ms is authoritative for that range.
 */

export const OHLC_TFS = [
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "M6",
  "M10",
  "M12",
  "M15",
  "M20",
  "M30",
  "H1",
  "H2",
  "H3",
  "H4",
  "H6",
  "H8",
  "H12",
  "D1",
  "W1",
  "MN1",
] as const;

export type OhlcTf = (typeof OHLC_TFS)[number];

const MIN = 60;
/** Seconds of each MT5 timeframe (MN1: 30 days, the EA's nominal value). */
export const OHLC_TF_SEC: Record<OhlcTf, number> = {
  M1: MIN,
  M2: 2 * MIN,
  M3: 3 * MIN,
  M4: 4 * MIN,
  M5: 5 * MIN,
  M6: 6 * MIN,
  M10: 10 * MIN,
  M12: 12 * MIN,
  M15: 15 * MIN,
  M20: 20 * MIN,
  M30: 30 * MIN,
  H1: 3600,
  H2: 2 * 3600,
  H3: 3 * 3600,
  H4: 4 * 3600,
  H6: 6 * 3600,
  H8: 8 * 3600,
  H12: 12 * 3600,
  D1: 86_400,
  W1: 7 * 86_400,
  MN1: 30 * 86_400,
};

export const isOhlcTf = (v: unknown): v is OhlcTf =>
  typeof v === "string" && (OHLC_TFS as readonly string[]).includes(v);

export const OHLC_TYPES = [
  "snapshot",
  "update",
  "history",
  "ticks",
  "heartbeat",
] as const;
export type OhlcFeedType = (typeof OHLC_TYPES)[number];

/** MT5 tick flags (TICK_FLAG_*). */
export const TICK_FLAG = { bid: 2, ask: 4, last: 8, volume: 16 } as const;

export interface OhlcCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Tick volume (MT5 tick_volume). */
  volume: number;
  realVolume: number;
  spread: number;
}

export interface OhlcSeries {
  symbol: string;
  tf: OhlcTf;
  sec: number;
  digits: number;
  /** Range covered by a history block (bar open times, UTC ms). */
  fromMs?: number;
  toMs?: number;
  /** Start of the broker's history for this series. */
  firstMs?: number;
  bars: OhlcCandle[];
}

export interface OhlcTick {
  time: number;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  flags: number;
}

export type ChartPrice = "bid" | "last";

export interface OhlcTickBlock {
  symbol: string;
  digits: number;
  /** Price the MT5 chart is built from (SYMBOL_CHART_MODE). */
  chart: ChartPrice;
  fromMs?: number;
  toMs?: number;
  rows: OhlcTick[];
}

export interface OhlcFeed {
  type: OhlcFeedType;
  account: string;
  server: string;
  broker: string;
  /** Broker clock − UTC, in seconds. */
  offsetSec: number;
  sentMs: number;
  seq: number;
  requestId?: string;
  /** End of an on-demand request (with an error when it failed). */
  done?: boolean;
  error?: string;
  /** History start reported when a request reached it. */
  firstMs?: number;
  /** The broker has no ticks before this time. */
  ticksEndMs?: number;
  series: OhlcSeries[];
  ticks: OhlcTickBlock[];
}

const MAX_SERIES = 200;
const MAX_ROWS = 50_000;
const MAX_TEXT = 80;

const text = (v: unknown, max = MAX_TEXT) =>
  typeof v === "string" || typeof v === "number"
    ? String(v).trim().slice(0, max)
    : "";

const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const list = (v: unknown, max: number): unknown[] =>
  Array.isArray(v) ? v.slice(0, max) : [];

/** Bar row → candle, or null when invalid (fewer than 5 numbers, high < low). */
export function candleFromRow(row: unknown, shiftMs = 0): OhlcCandle | null {
  if (!Array.isArray(row) || row.length < 5) {
    return null;
  }
  const n = row.slice(0, 8).map(finite);
  const [time, open, high, low, close] = n;
  if (
    time === undefined ||
    open === undefined ||
    high === undefined ||
    low === undefined ||
    close === undefined ||
    high < low
  ) {
    return null;
  }
  return {
    time: time - shiftMs,
    open,
    high,
    low,
    close,
    volume: n[5] ?? 0,
    realVolume: n[6] ?? 0,
    spread: n[7] ?? 0,
  };
}

/** Tick row → tick, or null without time or price. */
export function tickFromRow(row: unknown, shiftMs = 0): OhlcTick | null {
  if (!Array.isArray(row) || row.length < 2) {
    return null;
  }
  const n = row.slice(0, 6).map(finite);
  const time = n[0];
  const bid = n[1] ?? 0;
  const ask = n[2] ?? 0;
  const last = n[3] ?? 0;
  if (time === undefined || (bid <= 0 && ask <= 0 && last <= 0)) {
    return null;
  }
  return {
    time: time - shiftMs,
    bid,
    ask,
    last,
    volume: n[4] ?? 0,
    flags: n[5] ?? 0,
  };
}

/** Sorted by time, one candle per time (the last copy wins). */
export function dedupeCandles(candles: OhlcCandle[]) {
  const byTime = new Map<number, OhlcCandle>();
  for (const c of candles) {
    byTime.set(c.time, c);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

const rangeOf = (
  b: Record<string, unknown>,
  shiftMs: number
): { fromMs?: number; toMs?: number } => {
  const from = finite(b.from_ms);
  const to = finite(b.to_ms);
  return from === undefined || to === undefined || to < from
    ? {}
    : { fromMs: from - shiftMs, toMs: to - shiftMs };
};

function parseSeries(v: unknown, shiftMs: number): OhlcSeries | null {
  const b = obj(v);
  const symbol = text(b?.symbol, 40);
  if (!(b && symbol && isOhlcTf(b.tf))) {
    return null;
  }
  const bars: OhlcCandle[] = [];
  for (const row of list(b.bars, MAX_ROWS)) {
    const c = candleFromRow(row, shiftMs);
    if (c) {
      bars.push(c);
    }
  }
  const first = finite(b.first_ms);
  return {
    symbol,
    tf: b.tf,
    sec: OHLC_TF_SEC[b.tf],
    digits: Math.max(0, Math.min(10, Math.round(finite(b.digits) ?? 5))),
    ...rangeOf(b, shiftMs),
    ...(first && first > 0 ? { firstMs: first - shiftMs } : {}),
    bars: dedupeCandles(bars),
  };
}

function parseTicks(v: unknown, shiftMs: number): OhlcTickBlock | null {
  const b = obj(v);
  const symbol = text(b?.symbol, 40);
  if (!(b && symbol)) {
    return null;
  }
  const rows: OhlcTick[] = [];
  for (const row of list(b.rows, MAX_ROWS)) {
    const t = tickFromRow(row, shiftMs);
    if (t) {
      rows.push(t);
    }
  }
  // Stable: ticks with the same ms keep the EA's order
  rows.sort((a, c) => a.time - c.time);
  return {
    symbol,
    digits: Math.max(0, Math.min(10, Math.round(finite(b.digits) ?? 5))),
    chart: b.chart === "last" ? "last" : "bid",
    ...rangeOf(b, shiftMs),
    rows,
  };
}

/** Validated envelope (times in UTC ms), or null when it is not an OHLC feed. */
export function parseOhlcFeed(body: unknown): OhlcFeed | null {
  const b = obj(body);
  if (!b || b.v !== 1 || b.source !== "mt5-ohlc") {
    return null;
  }
  const type = OHLC_TYPES.find((t) => t === b.type);
  const account = text(b.account, 40);
  if (!(type && account)) {
    return null;
  }
  const offsetSec = Math.round(finite(b.offset_sec) ?? 0);
  // Broker times → UTC
  const shiftMs = b.time_utc === false ? offsetSec * 1000 : 0;
  const series = list(b.series, MAX_SERIES)
    .map((s) => parseSeries(s, shiftMs))
    .filter((s): s is OhlcSeries => s !== null);
  const ticks = list(b.ticks, MAX_SERIES)
    .map((t) => parseTicks(t, shiftMs))
    .filter((t): t is OhlcTickBlock => t !== null);
  const requestId = text(b.request_id, 64);
  const error = text(b.error, 200);
  const first = finite(b.first_ms);
  const ticksEnd = finite(b.ticks_end_ms);
  return {
    type,
    account,
    server: text(b.server),
    broker: text(b.broker),
    offsetSec,
    sentMs: finite(b.sent_ms) ?? 0,
    seq: finite(b.seq) ?? 0,
    ...(requestId ? { requestId } : {}),
    ...(b.done === true ? { done: true } : {}),
    ...(error ? { error } : {}),
    ...(first && first > 0 ? { firstMs: first - shiftMs } : {}),
    ...(ticksEnd && ticksEnd > 0 ? { ticksEndMs: ticksEnd - shiftMs } : {}),
    series,
    ticks,
  };
}

/**
 * Upsert by time. Fast path when the new candles start at or after the last
 * one (live updates); otherwise a full merge. Keeps the newest `limit`.
 */
export function mergeCandles(
  existing: OhlcCandle[],
  incoming: OhlcCandle[],
  limit = Number.POSITIVE_INFINITY
): OhlcCandle[] {
  if (incoming.length === 0) {
    return existing;
  }
  const last = existing.at(-1);
  const first = incoming[0];
  let out: OhlcCandle[];
  if (!last) {
    out = dedupeCandles(incoming);
  } else if (first && first.time >= last.time && isSorted(incoming)) {
    out = existing.slice();
    for (const c of incoming) {
      const tail = out.at(-1);
      if (tail && tail.time === c.time) {
        out[out.length - 1] = c;
      } else {
        out.push(c);
      }
    }
  } else {
    out = dedupeCandles([...existing, ...incoming]);
  }
  return out.length > limit ? out.slice(out.length - limit) : out;
}

function isSorted(candles: OhlcCandle[]) {
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (prev && cur && cur.time <= prev.time) {
      return false;
    }
  }
  return true;
}

const sameTick = (a: OhlcTick, b: OhlcTick) =>
  a.time === b.time &&
  a.bid === b.bid &&
  a.ask === b.ask &&
  a.last === b.last &&
  a.volume === b.volume &&
  a.flags === b.flags;

/**
 * Appends live ticks. A POST the EA re-sends (its answer was lost) overlaps
 * the stored tail exactly: that overlap is dropped, so nothing repeats.
 */
export function appendTicks(existing: OhlcTick[], incoming: OhlcTick[]) {
  const first = incoming[0];
  if (!first) {
    return existing;
  }
  let tail = 0;
  for (let i = existing.length - 1; i >= 0; i--) {
    const t = existing[i];
    if (!t || t.time < first.time) {
      break;
    }
    tail++;
  }
  for (let k = Math.min(tail, incoming.length); k > 0; k--) {
    let match = true;
    for (let i = 0; i < k; i++) {
      const a = existing[existing.length - k + i];
      const b = incoming[i];
      if (!(a && b && sameTick(a, b))) {
        match = false;
        break;
      }
    }
    if (match) {
      return [...existing, ...incoming.slice(k)];
    }
  }
  return [...existing, ...incoming];
}

/** A block with a range replaces every stored tick inside [fromMs, toMs]. */
export function replaceTicks(
  existing: OhlcTick[],
  incoming: OhlcTick[],
  fromMs: number,
  toMs: number
) {
  const before = existing.filter((t) => t.time < fromMs);
  const after = existing.filter((t) => t.time > toMs);
  return [...before, ...incoming, ...after];
}

/* --------------------------- in-memory store ---------------------------- */

export interface OhlcStore {
  account?: string;
  offsetSec?: number;
  lastSeq?: number;
  lastSentMs?: number;
  /** "SYMBOL|TF" → candles */
  series: Map<string, OhlcCandle[]>;
  ticks: Map<string, OhlcTick[]>;
  chart: Map<string, ChartPrice>;
  /** seq numbers that never arrived (failed POSTs). */
  missedSeq: number;
}

export const seriesKey = (symbol: string, tf: OhlcTf) => `${symbol}|${tf}`;

export const createOhlcStore = (): OhlcStore => ({
  series: new Map(),
  ticks: new Map(),
  chart: new Map(),
  missedSeq: 0,
});

/** Applies an envelope to the store (used by the E2E receiver and tests). */
export function applyOhlcFeed(
  store: OhlcStore,
  feed: OhlcFeed,
  limit?: number
) {
  if (store.lastSeq !== undefined && feed.seq > store.lastSeq + 1) {
    store.missedSeq += feed.seq - store.lastSeq - 1;
  }
  store.account = feed.account;
  store.offsetSec = feed.offsetSec;
  store.lastSeq = Math.max(store.lastSeq ?? 0, feed.seq);
  store.lastSentMs = feed.sentMs;
  for (const s of feed.series) {
    const key = seriesKey(s.symbol, s.tf);
    store.series.set(
      key,
      mergeCandles(store.series.get(key) ?? [], s.bars, limit)
    );
  }
  for (const t of feed.ticks) {
    store.chart.set(t.symbol, t.chart);
    const prev = store.ticks.get(t.symbol) ?? [];
    store.ticks.set(
      t.symbol,
      t.fromMs !== undefined && t.toMs !== undefined
        ? replaceTicks(prev, t.rows, t.fromMs, t.toMs)
        : appendTicks(prev, t.rows)
    );
  }
  return store;
}
