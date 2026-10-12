/**
 * MT5 sends deal times on the broker's server clock, not in UTC. The EA
 * reports the current offset (server − UTC); the panel converts every time
 * once, when it reads the deals, so all charts work in real UTC.
 *
 * Most brokers (IC Markets among them) keep "New York close" time: UTC+2,
 * UTC+3 while the US is on daylight saving time. For them an old deal uses
 * the offset of its own date, not today's.
 */

const HOUR = 3_600_000;

/** UTC ms of the nth Sunday (1-based) of a month, at `hour` UTC. */
function nthSunday(year: number, month: number, n: number, hour: number) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const day = 1 + ((7 - first) % 7) + (n - 1) * 7;
  return Date.UTC(year, month, day, hour);
}

/**
 * Whether US daylight saving time is on at `ms` (UTC): from the second
 * Sunday of March, 2:00 New York (07:00 UTC), to the first Sunday of
 * November, 2:00 New York (06:00 UTC).
 */
export function usDst(ms: number) {
  const year = new Date(ms).getUTCFullYear();
  return ms >= nthSunday(year, 2, 2, 7) && ms < nthSunday(year, 10, 1, 6);
}

/**
 * The broker offset at a moment, from the offset reported now: +3 h during
 * US DST or +2 h outside it is New York close, which switches with the US;
 * any other offset is constant.
 */
export function offsetAt(ms: number, offsetNow: number, now = Date.now()) {
  const nyClose = offsetNow === (usDst(now) ? 3 : 2) * HOUR;
  if (!nyClose) {
    return offsetNow;
  }
  return (usDst(ms) ? 3 : 2) * HOUR;
}

/** A broker-clock time in UTC ms. Unknown offset (null): left as is. */
export function toUtc(
  serverMs: number,
  offsetNow: number | null | undefined,
  now = Date.now()
) {
  if (!offsetNow) {
    return serverMs;
  }
  // The offset of the deal's date is found from its approximate UTC time
  return serverMs - offsetAt(serverMs - offsetNow, offsetNow, now);
}

/** Offset (ms) from the EA's `server_offset_sec`, rounded to 15 minutes. */
export function offsetFromSeconds(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  if (v === undefined || v === null || v === "" || !Number.isFinite(n)) {
    return;
  }
  const ms = Math.round((n * 1000) / (15 * 60_000)) * 15 * 60_000;
  return Math.abs(ms) <= 14 * HOUR ? ms : undefined;
}
