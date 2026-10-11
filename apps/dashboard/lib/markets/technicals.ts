/**
 * Technical rating like TradingView's "Technicals" gauge: moving averages
 * and oscillators each vote buy (+1), neutral (0) or sell (-1) on daily
 * closes; the summary is the mean of both groups.
 *
 * Thresholds (TradingView): > 0.5 strong buy, > 0.1 buy, ≥ -0.1 neutral,
 * ≥ -0.5 sell, otherwise strong sell.
 */

export interface Bar {
  high: number;
  low: number;
  close: number;
}

export type Vote = -1 | 0 | 1;
export type Rating = "strong_sell" | "sell" | "neutral" | "buy" | "strong_buy";

export const RATING_LABEL: Record<Rating, string> = {
  strong_sell: "Venda forte",
  sell: "Venda",
  neutral: "Neutro",
  buy: "Compra",
  strong_buy: "Compra forte",
};

export interface Signal {
  name: string;
  value: number | null;
  vote: Vote;
}

export interface Technicals {
  /** -1 … 1 */
  score: number;
  rating: Rating;
  ma: { score: number; rating: Rating; signals: Signal[] };
  osc: { score: number; rating: Rating; signals: Signal[] };
  counts: { buy: number; neutral: number; sell: number };
}

export function ratingOf(score: number): Rating {
  if (score > 0.5) {
    return "strong_buy";
  }
  if (score > 0.1) {
    return "buy";
  }
  if (score >= -0.1) {
    return "neutral";
  }
  return score >= -0.5 ? "sell" : "strong_sell";
}

const last = <T>(a: T[]) => a.at(-1);

export function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  values.forEach((v, i) => {
    sum += v;
    if (i >= n) {
      sum -= values[i - n] ?? 0;
    }
    out.push(i >= n - 1 ? sum / n : null);
  });
  return out;
}

export function ema(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (n + 1);
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i < n - 1) {
      out.push(null);
      return;
    }
    if (prev === null) {
      const seed = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
      prev = seed;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  });
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = (values[i] ?? 0) - (values[i - 1] ?? 0);
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    if (i <= n) {
      gain += g / n;
      loss += l / n;
    } else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
    }
    if (i < n) {
      out.push(null);
    } else {
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
  }
  return out;
}

function highest(bars: Bar[], end: number, n: number) {
  let h = Number.NEGATIVE_INFINITY;
  for (let i = Math.max(0, end - n + 1); i <= end; i++) {
    h = Math.max(h, bars[i]?.high ?? h);
  }
  return h;
}

function lowest(bars: Bar[], end: number, n: number) {
  let l = Number.POSITIVE_INFINITY;
  for (let i = Math.max(0, end - n + 1); i <= end; i++) {
    l = Math.min(l, bars[i]?.low ?? l);
  }
  return l;
}

/** Stochastic %K(n) smoothed by 3, and %D (3). */
export function stochastic(bars: Bar[], n = 14) {
  const raw = bars.map((b, i) => {
    if (i < n - 1) {
      return null;
    }
    const h = highest(bars, i, n);
    const l = lowest(bars, i, n);
    return h === l ? 50 : ((b.close - l) / (h - l)) * 100;
  });
  const valid = raw.map((v) => v ?? 0);
  const k = sma(valid, 3).map((v, i) => (i < n + 1 ? null : v));
  const d = sma(
    k.map((v) => v ?? 0),
    3
  ).map((v, i) => (i < n + 3 ? null : v));
  return { k, d };
}

export function cci(bars: Bar[], n = 20): (number | null)[] {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const mean = sma(tp, n);
  return tp.map((v, i) => {
    const m = mean[i];
    if (m == null) {
      return null;
    }
    let dev = 0;
    for (let j = i - n + 1; j <= i; j++) {
      dev += Math.abs((tp[j] ?? 0) - m);
    }
    dev /= n;
    return dev === 0 ? 0 : (v - m) / (0.015 * dev);
  });
}

export function williamsR(bars: Bar[], n = 14): (number | null)[] {
  return bars.map((b, i) => {
    if (i < n - 1) {
      return null;
    }
    const h = highest(bars, i, n);
    const l = lowest(bars, i, n);
    return h === l ? -50 : ((h - b.close) / (h - l)) * -100;
  });
}

export function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = values.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f == null || s == null ? null : f - s;
  });
  const start = line.findIndex((v) => v != null);
  const signalPart = start < 0 ? [] : ema(line.slice(start) as number[], 9);
  const signal = line.map((_, i) =>
    start < 0 || i < start ? null : (signalPart[i - start] ?? null)
  );
  return { line, signal };
}

/** Awesome Oscillator: SMA5 − SMA34 of the bar midpoints. */
export function awesome(bars: Bar[]): (number | null)[] {
  const mid = bars.map((b) => (b.high + b.low) / 2);
  const a = sma(mid, 5);
  const b = sma(mid, 34);
  return mid.map((_, i) => {
    const x = a[i];
    const y = b[i];
    return x == null || y == null ? null : x - y;
  });
}

const MA_LENGTHS = [10, 20, 30, 50, 100, 200];

function maSignals(closes: number[]): Signal[] {
  const price = last(closes) ?? 0;
  const out: Signal[] = [];
  for (const n of MA_LENGTHS) {
    for (const [kind, fn] of [
      ["EMA", ema],
      ["SMA", sma],
    ] as const) {
      const v = last(fn(closes, n)) ?? null;
      let vote: Vote = 0;
      if (v != null) {
        vote = price > v ? 1 : -1;
        if (price === v) {
          vote = 0;
        }
      }
      out.push({ name: `${kind} (${n})`, value: v, vote });
    }
  }
  return out;
}

const tail = (a: (number | null)[]) => [a.at(-2) ?? null, a.at(-1) ?? null];

function rising(a: (number | null)[]) {
  const [p, c] = tail(a);
  return p != null && c != null && c > p;
}

function falling(a: (number | null)[]) {
  const [p, c] = tail(a);
  return p != null && c != null && c < p;
}

function bandVote(series: (number | null)[], low: number, high: number): Vote {
  const v = series.at(-1);
  if (v == null) {
    return 0;
  }
  if (v < low && rising(series)) {
    return 1;
  }
  if (v > high && falling(series)) {
    return -1;
  }
  return 0;
}

function stochVote(k: (number | null)[], d: (number | null)[]): Vote {
  const kv = k.at(-1);
  const dv = d.at(-1);
  if (kv == null || dv == null) {
    return 0;
  }
  if (kv < 20 && dv < 20 && kv > dv) {
    return 1;
  }
  if (kv > 80 && dv > 80 && kv < dv) {
    return -1;
  }
  return 0;
}

function directionVote(series: (number | null)[]): Vote {
  if (rising(series)) {
    return 1;
  }
  return falling(series) ? -1 : 0;
}

function aoVote(ao: (number | null)[]): Vote {
  const [p, c] = tail(ao);
  if (p == null || c == null) {
    return 0;
  }
  if ((p < 0 && c > 0) || (c > 0 && c > p)) {
    return 1;
  }
  if ((p > 0 && c < 0) || (c < 0 && c < p)) {
    return -1;
  }
  return 0;
}

function oscSignals(bars: Bar[]): Signal[] {
  const closes = bars.map((b) => b.close);
  const r = rsi(closes);
  const st = stochastic(bars);
  const c = cci(bars);
  const w = williamsR(bars);
  const m = macd(closes);
  const ao = awesome(bars);
  const mom = closes.map((v, i) =>
    i >= 10 ? v - (closes[i - 10] ?? v) : null
  );
  const macdVote = (): Vote => {
    const l = m.line.at(-1);
    const s = m.signal.at(-1);
    if (l == null || s == null) {
      return 0;
    }
    return l > s ? 1 : -1;
  };
  return [
    { name: "RSI (14)", value: r.at(-1) ?? null, vote: bandVote(r, 30, 70) },
    {
      name: "Estocástico %K (14, 3, 3)",
      value: st.k.at(-1) ?? null,
      vote: stochVote(st.k, st.d),
    },
    { name: "CCI (20)", value: c.at(-1) ?? null, vote: bandVote(c, -100, 100) },
    {
      name: "Momentum (10)",
      value: mom.at(-1) ?? null,
      vote: directionVote(mom),
    },
    {
      name: "MACD (12, 26)",
      value: m.line.at(-1) ?? null,
      vote: macdVote(),
    },
    {
      name: "Williams %R (14)",
      value: w.at(-1) ?? null,
      vote: bandVote(w, -80, -20),
    },
    { name: "Awesome Oscillator", value: ao.at(-1) ?? null, vote: aoVote(ao) },
  ];
}

const avg = (signals: Signal[]) => {
  const voted = signals.filter((s) => s.value != null);
  return voted.length
    ? voted.reduce((a, s) => a + s.vote, 0) / voted.length
    : 0;
};

/** null when there are too few bars for a meaningful rating. */
export function technicals(bars: Bar[]): Technicals | null {
  if (bars.length < 35) {
    return null;
  }
  const closes = bars.map((b) => b.close);
  const ma = maSignals(closes);
  const osc = oscSignals(bars);
  const maScore = avg(ma);
  const oscScore = avg(osc);
  const score = (maScore + oscScore) / 2;
  const all = [...ma, ...osc].filter((s) => s.value != null);
  return {
    score,
    rating: ratingOf(score),
    ma: { score: maScore, rating: ratingOf(maScore), signals: ma },
    osc: { score: oscScore, rating: ratingOf(oscScore), signals: osc },
    counts: {
      buy: all.filter((s) => s.vote === 1).length,
      neutral: all.filter((s) => s.vote === 0).length,
      sell: all.filter((s) => s.vote === -1).length,
    },
  };
}
