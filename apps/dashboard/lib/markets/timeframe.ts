import { OHLC_TF_SEC, OHLC_TFS, type OhlcTf } from "../metatrader/ohlc-feed";

/**
 * Custom chart timeframes: any number of seconds, minutes, hours, days,
 * weeks, months or ticks ("2s", "90s", "7m", "3h", "2D", "1W", "1M", "100T").
 * `sourceFor` picks what to build them from: the MT5 candle itself, the
 * largest MT5 candle that divides it, or the ticks (below one minute, not a
 * whole minute, or tick candles).
 */

export type TfUnit = "s" | "m" | "h" | "D" | "W" | "M" | "T";

export interface CustomTf {
  /** Canonical id ("7m", "1D", "100T"). */
  id: string;
  unit: TfUnit;
  n: number;
  /** Nominal duration (months: 30 days; ticks: 0). */
  ms: number;
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;
export const MAX_TICKS = 100_000;

const UNIT_MS: Record<TfUnit, number> = {
  s: SECOND,
  m: MINUTE,
  h: HOUR,
  D: DAY,
  W: WEEK,
  M: MONTH,
  T: 0,
};

/** Letters accepted for each unit ("m" is minutes, "M" months). */
const UNIT_ALIAS: Record<string, TfUnit> = {
  s: "s",
  S: "s",
  m: "m",
  h: "h",
  H: "h",
  d: "D",
  D: "D",
  w: "W",
  W: "W",
  M: "M",
  t: "T",
  T: "T",
};

/** MT5 names ("M1", "H4", "D1", "W1", "MN1") → custom timeframe text. */
const MT5_NAME = /^(M|H|D|W|MN)(\d{1,2})$/;
const CUSTOM = /^(\d{1,6})\s*([a-zA-Z])$/;

/** Parses "2s", "7m", "4H", "1D", "M15", "MN1", "100T"… null when invalid. */
export function parseTimeframe(input: string): CustomTf | null {
  const text = input.trim();
  const upper = text.toUpperCase();
  if (MT5_NAME.test(upper) && (OHLC_TFS as readonly string[]).includes(upper)) {
    return fromMt5(upper as OhlcTf);
  }
  // "D", "W", "M" alone: the platform's 1D / 1W / 1M
  const bare = text.length === 1 && "DWM".includes(text) ? `1${text}` : text;
  const m = CUSTOM.exec(bare);
  const unit = m?.[2] ? UNIT_ALIAS[m[2]] : undefined;
  if (!(m && unit)) {
    return null;
  }
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1) {
    return null;
  }
  if (unit === "T") {
    return n <= MAX_TICKS ? { id: `${n}T`, unit, n, ms: 0 } : null;
  }
  const ms = n * UNIT_MS[unit];
  if (ms > YEAR + DAY) {
    return null;
  }
  return { id: `${n}${unit}`, unit, n, ms };
}

function fromMt5(tf: OhlcTf): CustomTf {
  const sec = OHLC_TF_SEC[tf];
  if (tf === "MN1") {
    return { id: "1M", unit: "M", n: 1, ms: MONTH };
  }
  if (tf === "W1") {
    return { id: "1W", unit: "W", n: 1, ms: WEEK };
  }
  if (tf === "D1") {
    return { id: "1D", unit: "D", n: 1, ms: DAY };
  }
  if (sec % 3600 === 0) {
    return { id: `${sec / 3600}h`, unit: "h", n: sec / 3600, ms: sec * 1000 };
  }
  return { id: `${sec / 60}m`, unit: "m", n: sec / 60, ms: sec * 1000 };
}

/** Readable label: "2s", "7m", "4H", "1D", "1S" (semana), "1M", "100T". */
export function tfLabel(tf: CustomTf) {
  switch (tf.unit) {
    case "h":
      return `${tf.n}H`;
    case "W":
      return `${tf.n}S`;
    default:
      return tf.id;
  }
}

/** Portuguese name for menus ("7 minutos", "100 ticks"). */
export function tfName(tf: CustomTf) {
  const words: Record<TfUnit, [string, string]> = {
    s: ["segundo", "segundos"],
    m: ["minuto", "minutos"],
    h: ["hora", "horas"],
    D: ["dia", "dias"],
    W: ["semana", "semanas"],
    M: ["mês", "meses"],
    T: ["tick", "ticks"],
  };
  const [one, many] = words[tf.unit];
  return `${tf.n} ${tf.n === 1 ? one : many}`;
}

export type TfSource =
  | { kind: "ticks" }
  /** MT5 candles of `tf`, `factor` of them per custom candle (1 = direct). */
  | { kind: "bars"; tf: OhlcTf; factor: number };

const INTRADAY: OhlcTf[] = OHLC_TFS.filter(
  (t) => OHLC_TF_SEC[t] < 86_400
).reverse();

/** What a timeframe is built from (see the module comment). */
export function sourceFor(tf: CustomTf): TfSource {
  if (tf.unit === "T" || tf.ms < MINUTE || tf.ms % MINUTE !== 0) {
    return { kind: "ticks" };
  }
  if (tf.unit === "M") {
    return { kind: "bars", tf: "MN1", factor: tf.n };
  }
  if (tf.unit === "W") {
    return { kind: "bars", tf: "W1", factor: tf.n };
  }
  if (tf.unit === "D" || tf.ms % DAY === 0) {
    return { kind: "bars", tf: "D1", factor: tf.ms / DAY };
  }
  const sec = tf.ms / 1000;
  const best = INTRADAY.find((t) => sec % OHLC_TF_SEC[t] === 0) ?? "M1";
  return { kind: "bars", tf: best, factor: sec / OHLC_TF_SEC[best] };
}

/** The MT5 timeframe that is exactly this one, if any. */
export function mt5Equivalent(tf: CustomTf): OhlcTf | null {
  const src = sourceFor(tf);
  return src.kind === "bars" && src.factor === 1 ? src.tf : null;
}
