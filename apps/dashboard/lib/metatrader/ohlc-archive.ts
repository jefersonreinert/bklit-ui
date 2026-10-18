import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

/**
 * Deep history of the OHLC feed, outside the database: one gzip file per
 * (account, symbol, timeframe, UTC month) for candles and per (account,
 * symbol, UTC day) for ticks, in Convex File Storage. The index row of each
 * file (ohlcArchive) keeps the ranges it covers, so the chart knows what to
 * load and what to ask the EA for without downloading anything.
 *
 * Rows are the EA's arrays: candles [t, o, h, l, c, tick_volume,
 * real_volume, spread], ticks [t, bid, ask, last, volume, flags].
 */

export type Row = number[];
/** [from, to] inclusive, UTC ms. */
export type Interval = [number, number];

export const DAY_MS = 86_400_000;

export function monthStart(t: number) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function nextMonth(period: number) {
  const d = new Date(period);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export const dayStart = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;

export type ArchiveKind = "bars" | "ticks";

export const periodOf = (kind: ArchiveKind, t: number) =>
  kind === "bars" ? monthStart(t) : dayStart(t);

export const periodEnd = (kind: ArchiveKind, period: number) =>
  (kind === "bars" ? nextMonth(period) : period + DAY_MS) - 1;

/** Sorted, merged intervals (touching ones too: [1,5] + [6,9] = [1,9]). */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out.at(-1);
    if (last && a <= last[1] + 1) {
      last[1] = Math.max(last[1], b);
    } else {
      out.push([a, b]);
    }
  }
  return out;
}

/** Parts of [from, to] not covered by the intervals (sorted, merged). */
export function missingRanges(
  covered: Interval[],
  from: number,
  to: number
): Interval[] {
  const out: Interval[] = [];
  let cursor = from;
  for (const [a, b] of mergeIntervals(covered)) {
    if (b < cursor) {
      continue;
    }
    if (a > to) {
      break;
    }
    if (a > cursor) {
      out.push([cursor, Math.min(a - 1, to)]);
    }
    cursor = Math.max(cursor, b + 1);
    if (cursor > to) {
      break;
    }
  }
  if (cursor <= to) {
    out.push([cursor, to]);
  }
  return out;
}

/** Splits a block (rows + covered range) by file period. */
export function splitByPeriod(
  kind: ArchiveKind,
  rows: Row[],
  from: number,
  to: number
) {
  const parts = new Map<number, { rows: Row[]; from: number; to: number }>();
  for (let p = periodOf(kind, from); p <= to; p = periodEnd(kind, p) + 1) {
    parts.set(p, {
      rows: [],
      from: Math.max(from, p),
      to: Math.min(to, periodEnd(kind, p)),
    });
  }
  for (const r of rows) {
    const t = r[0] ?? 0;
    const p = periodOf(kind, t);
    let part = parts.get(p);
    if (!part) {
      // A row outside the declared range still lands in its own file
      part = { rows: [], from: t, to: t };
      parts.set(p, part);
    }
    part.rows.push(r);
  }
  return parts;
}

/** Candles: upsert by time (the new copy wins), sorted. */
export function upsertRows(existing: Row[], rows: Row[]): Row[] {
  const byTime = new Map<number, Row>();
  for (const r of existing) {
    byTime.set(r[0] ?? 0, r);
  }
  for (const r of rows) {
    byTime.set(r[0] ?? 0, r);
  }
  return [...byTime.values()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
}

/** Ticks: the block is authoritative for [from, to] (no duplicates, no gaps). */
export function replaceRows(
  existing: Row[],
  rows: Row[],
  from: number,
  to: number
): Row[] {
  const before = existing.filter((r) => (r[0] ?? 0) < from);
  const after = existing.filter((r) => (r[0] ?? 0) > to);
  const inside = rows
    .filter((r) => (r[0] ?? 0) >= from && (r[0] ?? 0) <= to)
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  return [...before, ...inside, ...after];
}

const sameRow = (a: Row, b: Row) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Live ticks: appends, dropping the exact overlap of a POST the EA re-sent
 * (its answer was lost). Ticks that are only equal by chance are kept.
 */
export function appendRows(existing: Row[], incoming: Row[]): Row[] {
  const first = incoming[0]?.[0];
  if (first === undefined) {
    return existing;
  }
  let tail = 0;
  for (let i = existing.length - 1; i >= 0; i--) {
    if ((existing[i]?.[0] ?? 0) < first) {
      break;
    }
    tail++;
  }
  for (let k = Math.min(tail, incoming.length); k > 0; k--) {
    const offset = existing.length - k;
    let match = true;
    for (let i = 0; i < k; i++) {
      const a = existing[offset + i];
      const b = incoming[i];
      if (!(a && b && sameRow(a, b))) {
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

export function encodeArchive(rows: Row[]): Uint8Array {
  return gzipSync(strToU8(JSON.stringify({ v: 1, rows })), { level: 6 });
}

export function decodeArchive(data: Uint8Array | ArrayBuffer): Row[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const parsed = JSON.parse(strFromU8(gunzipSync(bytes))) as { rows?: Row[] };
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}
