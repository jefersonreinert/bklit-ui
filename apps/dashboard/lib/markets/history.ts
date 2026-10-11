/**
 * Price history for the symbol overview (TradingView-like ranges 1D … All)
 * from Yahoo Finance's chart API, plus the day's key data from its meta.
 */

export const RANGES = [
  "1D",
  "5D",
  "1M",
  "3M",
  "YTD",
  "1Y",
  "5Y",
  "ALL",
] as const;
export type RangeId = (typeof RANGES)[number];

export const RANGE_LABEL: Record<RangeId, string> = {
  "1D": "1D",
  "5D": "5D",
  "1M": "1M",
  "3M": "3M",
  YTD: "YTD",
  "1Y": "1A",
  "5Y": "5A",
  ALL: "Tudo",
};

/** "past 5 years" for the change line under the price. */
export const RANGE_PAST: Record<RangeId, string> = {
  "1D": "hoje",
  "5D": "nos últimos 5 dias",
  "1M": "no último mês",
  "3M": "nos últimos 3 meses",
  YTD: "no ano",
  "1Y": "no último ano",
  "5Y": "nos últimos 5 anos",
  ALL: "desde o início",
};

export const YAHOO_RANGE: Record<RangeId, { range: string; interval: string }> =
  {
    "1D": { range: "1d", interval: "5m" },
    "5D": { range: "5d", interval: "15m" },
    "1M": { range: "1mo", interval: "60m" },
    "3M": { range: "3mo", interval: "1d" },
    YTD: { range: "ytd", interval: "1d" },
    "1Y": { range: "1y", interval: "1d" },
    "5Y": { range: "5y", interval: "1wk" },
    ALL: { range: "max", interval: "1mo" },
  };

export const isRange = (r: string): r is RangeId =>
  (RANGES as readonly string[]).includes(r);

export interface HistoryPoint {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface SymbolMeta {
  price: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  open: number | null;
  high52: number | null;
  low52: number | null;
  currency: string;
  exchange: string;
  type: string;
  name: string;
  digits: number;
}

export interface History {
  points: HistoryPoint[];
  meta: SymbolMeta;
}

interface YahooResult {
  meta?: Record<string, unknown>;
  timestamp?: number[];
  indicators?: {
    quote?: {
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
    }[];
  };
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseYahooChart(json: unknown): History | null {
  const r = (json as { chart?: { result?: YahooResult[] } })?.chart
    ?.result?.[0];
  if (!r) {
    return null;
  }
  const q = r.indicators?.quote?.[0];
  const points: HistoryPoint[] = [];
  (r.timestamp ?? []).forEach((ts, i) => {
    const c = q?.close?.[i];
    if (c == null) {
      return;
    }
    points.push({
      t: ts * 1000,
      o: q?.open?.[i] ?? c,
      h: q?.high?.[i] ?? c,
      l: q?.low?.[i] ?? c,
      c,
    });
  });
  const m = r.meta ?? {};
  return {
    points,
    meta: {
      price: num(m.regularMarketPrice) ?? points.at(-1)?.c ?? null,
      previousClose: num(m.chartPreviousClose) ?? num(m.previousClose),
      dayHigh: num(m.regularMarketDayHigh),
      dayLow: num(m.regularMarketDayLow),
      volume: num(m.regularMarketVolume),
      open: points[0]?.o ?? null,
      high52: num(m.fiftyTwoWeekHigh),
      low52: num(m.fiftyTwoWeekLow),
      currency: str(m.currency),
      exchange: str(m.fullExchangeName) || str(m.exchangeName),
      type: str(m.instrumentType),
      name: str(m.longName) || str(m.shortName),
      digits: num(m.priceHint) ?? 2,
    },
  };
}

/** Change over the shown period (first point, or previous close for 1D). */
export function periodChange(h: History, range: RangeId) {
  const last = h.points.at(-1)?.c ?? h.meta.price;
  const base =
    range === "1D" ? (h.meta.previousClose ?? h.points[0]?.c) : h.points[0]?.c;
  if (last == null || base == null || base === 0) {
    return null;
  }
  return { abs: last - base, pct: ((last - base) / base) * 100, base };
}
