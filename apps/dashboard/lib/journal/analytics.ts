import { dayKey, type Trade } from "./metrics";

/**
 * Deeper journal analytics: any grouping (period, asset, model, session,
 * kill zone, hour, minute, weekday, duration, size), risk-adjusted ratios,
 * drawdown periods, distributions and a 0-100 trader score.
 */

export type TimeZoneId = "local" | "America/New_York" | "UTC";

export interface GroupRow {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  net: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  best: number;
  worst: number;
  avgR: number | null;
  avgHoldMs: number;
  volume: number;
}

const closedOnly = (trades: Trade[]) =>
  trades
    .filter((t) => t.closeTime !== null)
    .sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0));

const endOf = (t: Trade) => t.closeTime ?? t.openTime;

export function summarize(key: string, label: string, list: Trade[]): GroupRow {
  const wins = list.filter((t) => t.net > 0);
  const losses = list.filter((t) => t.net < 0);
  const grossProfit = wins.reduce((a, t) => a + t.net, 0);
  const grossLoss = losses.reduce((a, t) => a + t.net, 0);
  const n = list.length;
  const rs = list.map((t) => t.r).filter((r): r is number => r !== null);
  return {
    key,
    label,
    trades: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n ? wins.length / n : 0,
    net: grossProfit + grossLoss,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    expectancy: n ? (grossProfit + grossLoss) / n : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    best: list.reduce((a, t) => Math.max(a, t.net), 0),
    worst: list.reduce((a, t) => Math.min(a, t.net), 0),
    avgR: rs.length ? rs.reduce((a, r) => a + r, 0) / rs.length : null,
    avgHoldMs: n
      ? list.reduce((a, t) => a + (endOf(t) - t.openTime), 0) / n
      : 0,
    volume: list.reduce((a, t) => a + t.volume, 0),
  };
}

/** Groups closed trades; `order` keeps buckets in a fixed order (hours…). */
export function groupBy(
  trades: Trade[],
  keyOf: (t: Trade) => string | null,
  opts: { labelOf?: (key: string) => string; order?: string[] } = {}
): GroupRow[] {
  const map = new Map<string, Trade[]>();
  for (const t of closedOnly(trades)) {
    const k = keyOf(t);
    if (k === null) {
      continue;
    }
    const list = map.get(k) ?? [];
    list.push(t);
    map.set(k, list);
  }
  const label = opts.labelOf ?? ((k: string) => k);
  if (opts.order) {
    return opts.order.map((k) => summarize(k, label(k), map.get(k) ?? []));
  }
  return [...map.entries()]
    .map(([k, list]) => summarize(k, label(k), list))
    .sort((a, b) => b.net - a.net);
}

/* ------------------------------ time zones ------------------------------- */

interface Parts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

const WD: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar parts of `ms` in the chosen zone. */
export function partsIn(ms: number, tz: TimeZoneId): Parts {
  if (tz === "local") {
    const d = new Date(ms);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      weekday: d.getDay(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  }
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) {
    p[x.type] = x.value;
  }
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: WD[p.weekday ?? "Sun"] ?? 0,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/* ------------------------------- buckets --------------------------------- */

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));
/** 5-minute slices of the hour: ":00", ":05" … ":55". */
export const MINUTES = Array.from({ length: 12 }, (_, i) => `:${pad(i * 5)}`);

/**
 * Forex sessions by the New York clock (DST-proof): Ásia 19-03, Londres
 * 03-08, Londres+NY 08-12, Nova York 12-17, fora 17-19.
 */
export function sessionOf(ms: number): string {
  const { hour } = partsIn(ms, "America/New_York");
  if (hour >= 19 || hour < 3) {
    return "Ásia";
  }
  if (hour < 8) {
    return "Londres";
  }
  if (hour < 12) {
    return "Londres + NY";
  }
  if (hour < 17) {
    return "Nova York";
  }
  return "Fora de sessão";
}

export const SESSIONS = [
  "Ásia",
  "Londres",
  "Londres + NY",
  "Nova York",
  "Fora de sessão",
];

/** ICT kill zones (New York time). */
export function killZoneOf(ms: number): string {
  const { hour, minute } = partsIn(ms, "America/New_York");
  const m = hour * 60 + minute;
  if (m >= 20 * 60) {
    return "Asian KZ (20-00)";
  }
  if (m >= 2 * 60 && m < 5 * 60) {
    return "London KZ (02-05)";
  }
  if (m >= 7 * 60 && m < 10 * 60) {
    return "NY AM KZ (07-10)";
  }
  if (m >= 10 * 60 && m < 11 * 60) {
    return "Silver Bullet (10-11)";
  }
  if (m >= 13 * 60 + 30 && m < 16 * 60) {
    return "NY PM KZ (13:30-16)";
  }
  return "Fora de kill zone";
}

export const KILL_ZONES = [
  "Asian KZ (20-00)",
  "London KZ (02-05)",
  "NY AM KZ (07-10)",
  "Silver Bullet (10-11)",
  "NY PM KZ (13:30-16)",
  "Fora de kill zone",
];

const MIN = 60_000;
export const DURATIONS: { key: string; max: number }[] = [
  { key: "< 1 min", max: MIN },
  { key: "1-5 min", max: 5 * MIN },
  { key: "5-15 min", max: 15 * MIN },
  { key: "15-60 min", max: 60 * MIN },
  { key: "1-4 h", max: 240 * MIN },
  { key: "4-24 h", max: 1440 * MIN },
  { key: "> 1 dia", max: Number.POSITIVE_INFINITY },
];

export const durationOf = (t: Trade) =>
  DURATIONS.find((d) => endOf(t) - t.openTime < d.max)?.key ?? "> 1 dia";

export function periodKey(
  ms: number,
  period: "day" | "week" | "month" | "year",
  tz: TimeZoneId
) {
  const p = partsIn(ms, tz);
  if (period === "year") {
    return String(p.year);
  }
  if (period === "month") {
    return `${p.year}-${pad(p.month)}`;
  }
  if (period === "day") {
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  }
  // ISO-like week: Monday of the week
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const back = (p.weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

/** Every grouping the analytics tabs show, for one time zone. */
export function groupings(
  trades: Trade[],
  tz: TimeZoneId,
  modelOf: (t: Trade) => string
) {
  const at = (t: Trade) => partsIn(t.openTime, tz);
  return {
    day: groupBy(trades, (t) => periodKey(endOf(t), "day", tz)),
    week: groupBy(trades, (t) => periodKey(endOf(t), "week", tz)),
    month: groupBy(trades, (t) => periodKey(endOf(t), "month", tz)),
    year: groupBy(trades, (t) => periodKey(endOf(t), "year", tz)),
    symbol: groupBy(trades, (t) => t.symbol),
    model: groupBy(trades, modelOf),
    side: groupBy(trades, (t) => (t.side === "buy" ? "Compra" : "Venda"), {
      order: ["Compra", "Venda"],
    }),
    session: groupBy(trades, (t) => sessionOf(t.openTime), { order: SESSIONS }),
    killZone: groupBy(trades, (t) => killZoneOf(t.openTime), {
      order: KILL_ZONES,
    }),
    weekday: groupBy(trades, (t) => WEEKDAYS[at(t).weekday] ?? "", {
      order: WEEKDAYS,
    }),
    hour: groupBy(trades, (t) => pad(at(t).hour), { order: HOURS }),
    minute: groupBy(
      trades,
      (t) => `:${pad(Math.floor(at(t).minute / 5) * 5)}`,
      {
        order: MINUTES,
      }
    ),
    duration: groupBy(trades, durationOf, {
      order: DURATIONS.map((d) => d.key),
    }),
    account: groupBy(trades, (t) => t.account),
  };
}

/** Net by weekday × hour (rows = weekdays, columns = 0-23). */
export function weekHourMatrix(trades: Trade[], tz: TimeZoneId) {
  const grid = WEEKDAYS.map(() =>
    HOURS.map(() => ({ net: 0, trades: 0, wins: 0 }))
  );
  for (const t of closedOnly(trades)) {
    const p = partsIn(t.openTime, tz);
    const cell = grid[p.weekday]?.[p.hour];
    if (cell) {
      cell.net += t.net;
      cell.trades += 1;
      cell.wins += t.net > 0 ? 1 : 0;
    }
  }
  return grid;
}

/* ------------------------------ advanced --------------------------------- */

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0;

const stdDev = (xs: number[]) => {
  if (xs.length < 2) {
    return 0;
  }
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export interface Advanced {
  /** Daily-net Sharpe, annualized with √252 (risk-free 0). */
  sharpe: number | null;
  sortino: number | null;
  /** Van Tharp's System Quality Number (on R when known, else on net). */
  sqn: number | null;
  /** Net profit ÷ max drawdown. */
  recoveryFactor: number | null;
  /** Kelly fraction W − (1−W)/payoff. */
  kelly: number | null;
  stdDev: number;
  tradingDays: number;
  greenDays: number;
  redDays: number;
  bestDay: { key: string; net: number } | null;
  worstDay: { key: string; net: number } | null;
  maxGreenDayStreak: number;
  maxRedDayStreak: number;
  avgTradesPerDay: number;
  avgWinHoldMs: number;
  avgLossHoldMs: number;
  expectancyR: number | null;
  /** Longest time from an equity peak until it was regained (ms). */
  maxDrawdownMs: number;
  /** Current distance below the equity peak. */
  currentDrawdown: number;
  /** Share of net made by the single best trade. */
  bestTradeShare: number | null;
  /** Commission paid per lot traded. */
  commissionsPerLot: number | null;
}

function dayStreaks(days: GroupRow[]) {
  let streakG = 0;
  let streakR = 0;
  let maxG = 0;
  let maxR = 0;
  for (const d of days) {
    streakG = d.net > 0 ? streakG + 1 : 0;
    streakR = d.net < 0 ? streakR + 1 : 0;
    maxG = Math.max(maxG, streakG);
    maxR = Math.max(maxR, streakR);
  }
  return { maxG, maxR };
}

/** Max drawdown (money and time under water) of the cumulative net. */
function drawdownOf(closed: Trade[]) {
  let cum = 0;
  let peak = 0;
  let peakAt = closed[0]?.openTime ?? 0;
  let maxDd = 0;
  let maxDdMs = 0;
  let under = false;
  for (const t of closed) {
    cum += t.net;
    if (cum >= peak) {
      if (under) {
        maxDdMs = Math.max(maxDdMs, endOf(t) - peakAt);
      }
      peak = cum;
      peakAt = endOf(t);
      under = false;
    } else {
      under = true;
    }
    maxDd = Math.max(maxDd, peak - cum);
  }
  const last = closed.at(-1);
  if (last && cum < peak) {
    maxDdMs = Math.max(maxDdMs, endOf(last) - peakAt);
  }
  return { maxDd, maxDdMs, peak, cum };
}

export function advanced(trades: Trade[], tz: TimeZoneId): Advanced {
  const closed = closedOnly(trades);
  const days = groupBy(closed, (t) => periodKey(endOf(t), "day", tz)).sort(
    (a, b) => a.key.localeCompare(b.key)
  );
  const dailyNet = days.map((d) => d.net);
  const sd = stdDev(dailyNet);
  const downside = Math.sqrt(mean(dailyNet.map((x) => (x < 0 ? x * x : 0))));
  const rs = closed.map((t) => t.r).filter((r): r is number => r !== null);
  const sqnBase =
    rs.length >= closed.length * 0.8 && rs.length > 1
      ? rs
      : closed.map((t) => t.net);
  const sqnSd = stdDev(sqnBase);
  const all = summarize("all", "Tudo", closed);

  const { maxG, maxR } = dayStreaks(days);
  const { maxDd, maxDdMs, peak, cum } = drawdownOf(closed);
  const wins = closed.filter((t) => t.net > 0);
  const losses = closed.filter((t) => t.net < 0);
  const payoff = all.avgLoss < 0 ? all.avgWin / -all.avgLoss : null;
  const lots = closed.reduce((a, t) => a + t.volume, 0);
  const commissions = closed.reduce((a, t) => a + t.commission, 0);
  const byNet = [...days].sort((a, b) => b.net - a.net);
  const best = byNet[0];
  const worst = byNet.at(-1);
  return {
    sharpe: sd > 0 ? (mean(dailyNet) / sd) * Math.sqrt(252) : null,
    sortino: downside > 0 ? (mean(dailyNet) / downside) * Math.sqrt(252) : null,
    sqn:
      sqnSd > 0
        ? (Math.sqrt(Math.min(sqnBase.length, 100)) * mean(sqnBase)) / sqnSd
        : null,
    recoveryFactor: maxDd > 0 ? all.net / maxDd : null,
    kelly: payoff ? all.winRate - (1 - all.winRate) / payoff : null,
    stdDev: stdDev(closed.map((t) => t.net)),
    tradingDays: days.length,
    greenDays: days.filter((d) => d.net > 0).length,
    redDays: days.filter((d) => d.net < 0).length,
    bestDay: best ? { key: best.key, net: best.net } : null,
    worstDay: worst ? { key: worst.key, net: worst.net } : null,
    maxGreenDayStreak: maxG,
    maxRedDayStreak: maxR,
    avgTradesPerDay: days.length ? closed.length / days.length : 0,
    avgWinHoldMs: mean(wins.map((t) => endOf(t) - t.openTime)),
    avgLossHoldMs: mean(losses.map((t) => endOf(t) - t.openTime)),
    expectancyR: rs.length ? mean(rs) : null,
    maxDrawdownMs: maxDdMs,
    currentDrawdown: peak - cum,
    bestTradeShare: all.net > 0 && all.best > 0 ? all.best / all.net : null,
    commissionsPerLot: lots > 0 ? commissions / lots : null,
  };
}

/* ---------------------------- distributions ------------------------------ */

/** Equity and underwater (drawdown) series, one point per closed trade. */
export function equitySeries(trades: Trade[]) {
  let cum = 0;
  let peak = 0;
  return closedOnly(trades).map((t) => {
    cum += t.net;
    peak = Math.max(peak, cum);
    return { date: new Date(endOf(t)), pnl: cum, dd: cum - peak };
  });
}

/** Daily net (not cumulative), for the daily P&L line. */
export function dailySeries(trades: Trade[], tz: TimeZoneId) {
  return groupBy(trades, (t) => periodKey(endOf(t), "day", tz))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((d) => ({
      date: new Date(`${d.key}T12:00:00`),
      pnl: d.net,
      trades: d.trades,
    }));
}

/** Histogram of R multiples in 0.5R bins from −3R to +5R (ends clamp). */
export function rHistogram(trades: Trade[]) {
  const bins = Array.from({ length: 17 }, (_, i) => -3 + i * 0.5);
  const counts = bins.map((b) => ({
    key: `${b > 0 ? "+" : ""}${b}R`,
    wins: 0,
    losses: 0,
  }));
  for (const t of closedOnly(trades)) {
    if (t.r === null) {
      continue;
    }
    const i = Math.max(
      0,
      Math.min(bins.length - 1, Math.round((t.r + 3) / 0.5))
    );
    const c = counts[i];
    if (c) {
      if (t.r >= 0) {
        c.wins += 1;
      } else {
        c.losses += 1;
      }
    }
  }
  return counts;
}

/** Histogram of trade results in `size` money bins. */
export function pnlHistogram(trades: Trade[], bins = 12) {
  const closed = closedOnly(trades);
  if (closed.length === 0) {
    return [];
  }
  const lo = Math.min(...closed.map((t) => t.net));
  const hi = Math.max(...closed.map((t) => t.net));
  const step = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({
    key: Math.round(lo + step * (i + 0.5)).toLocaleString("pt-BR"),
    wins: 0,
    losses: 0,
  }));
  for (const t of closed) {
    const i = Math.min(bins - 1, Math.floor((t.net - lo) / step));
    const c = out[i];
    if (c) {
      if (t.net >= 0) {
        c.wins += 1;
      } else {
        c.losses += 1;
      }
    }
  }
  return out;
}

/* ------------------------------ trader score ----------------------------- */

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface ScorePart {
  key: string;
  label: string;
  /** 0-100 */
  value: number;
  raw: string;
}

/**
 * Six 0-100 pillars (like trading-journal "scores"): win rate, profit
 * factor, payoff, recovery factor, consistency (green days) and drawdown
 * control. The total is their average.
 */
export function traderScore(trades: Trade[], tz: TimeZoneId) {
  const closed = closedOnly(trades);
  const all = summarize("all", "Tudo", closed);
  const adv = advanced(closed, tz);
  let peak = 0;
  let cum = 0;
  let maxDd = 0;
  for (const t of closed) {
    cum += t.net;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
  }
  const payoff = all.avgLoss < 0 ? all.avgWin / -all.avgLoss : 0;
  const pf = all.profitFactor ?? (all.grossProfit > 0 ? 3 : 0);
  const rf = adv.recoveryFactor ?? (all.net > 0 ? 6 : 0);
  const green = adv.tradingDays ? adv.greenDays / adv.tradingDays : 0;
  const ddShare = all.grossProfit > 0 ? maxDd / all.grossProfit : 1;
  const parts: ScorePart[] = [
    {
      key: "winRate",
      label: "Acerto",
      value: clamp01(all.winRate / 0.65) * 100,
      raw: `${(all.winRate * 100).toFixed(0)}%`,
    },
    {
      key: "profitFactor",
      label: "Profit factor",
      value: clamp01((pf - 0.5) / 2) * 100,
      raw: pf.toFixed(2),
    },
    {
      key: "payoff",
      label: "Payoff",
      value: clamp01(payoff / 2.5) * 100,
      raw: payoff.toFixed(2),
    },
    {
      key: "recovery",
      label: "Recuperação",
      value: clamp01(rf / 6) * 100,
      raw: rf.toFixed(2),
    },
    {
      key: "consistency",
      label: "Consistência",
      value: clamp01(green / 0.7) * 100,
      raw: `${(green * 100).toFixed(0)}% dias +`,
    },
    {
      key: "drawdown",
      label: "Controle de DD",
      value: clamp01(1 - ddShare) * 100,
      raw: `${(ddShare * 100).toFixed(0)}% do lucro`,
    },
  ];
  const total = closed.length ? mean(parts.map((p) => p.value)) : 0;
  return { total, parts };
}

export const MONTH_NAMES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "2026-03" → "mar/26", "2026-03-14" → "14/03", "2026-W…" stays. */
export function periodLabel(key: string) {
  const [y, m, d] = key.split("-");
  if (d) {
    return `${d}/${m}`;
  }
  if (m) {
    return `${MONTH_NAMES[Number(m) - 1] ?? m}/${(y ?? "").slice(2)}`;
  }
  return key;
}

/* ------------------------------- models ---------------------------------- */

const CLOSE_COMMENT = /^\[(?:sl|tp|so)\b/i;

/**
 * The trading model ("setup") of a trade: the setup written in its note,
 * else the EA/order comment, else the EA magic number, else "Manual".
 */
export function modelResolver(setups: Map<string, string>) {
  return (t: Trade) => {
    const setup = setups.get(t.key)?.trim();
    if (setup) {
      return setup;
    }
    const comment = t.comment.trim();
    if (comment && !CLOSE_COMMENT.test(comment)) {
      return comment.slice(0, 40);
    }
    return t.magic ? `EA ${t.magic}` : "Manual";
  };
}

/** Closed trades grouped by note tag (a trade counts in each of its tags). */
export function groupByTag(trades: Trade[], tags: Map<string, string[]>) {
  const map = new Map<string, Trade[]>();
  for (const t of closedOnly(trades)) {
    for (const tag of tags.get(t.key) ?? []) {
      const list = map.get(tag) ?? [];
      list.push(t);
      map.set(tag, list);
    }
  }
  return [...map.entries()]
    .map(([k, list]) => summarize(k, k, list))
    .sort((a, b) => b.net - a.net);
}

/* ---------------------------- calendar views ----------------------------- */

/** Net per month: one row per year, 12 cells (null = no trades) + total. */
export function monthlyReturns(trades: Trade[], tz: TimeZoneId) {
  const years = new Map<number, (number | null)[]>();
  for (const t of closedOnly(trades)) {
    const p = partsIn(endOf(t), tz);
    const row = years.get(p.year) ?? Array.from({ length: 12 }, () => null);
    row[p.month - 1] = (row[p.month - 1] ?? 0) + t.net;
    years.set(p.year, row);
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months,
      total: months.reduce<number>((a, m) => a + (m ?? 0), 0),
    }));
}

/** Trades per day as GitHub-style week columns (levels 0-4) for the heatmap. */
export function activityColumns(trades: Trade[], weeks: number, now: number) {
  const perDay = new Map<string, number>();
  for (const t of closedOnly(trades)) {
    const k = dayKey(endOf(t));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const max = Math.max(1, ...perDay.values());
  const today = new Date(now);
  const cursor = new Date(today);
  cursor.setHours(12, 0, 0, 0);
  cursor.setDate(cursor.getDate() - cursor.getDay() - (weeks - 1) * 7);
  const columns: {
    bin: number;
    bins: { bin: number; count: number; date: Date; trades: number }[];
  }[] = [];
  for (let w = 0; w < weeks; w++) {
    const bins = Array.from({ length: 7 }, (_, d) => {
      const date = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
      const n = date > today ? 0 : (perDay.get(dayKey(date.getTime())) ?? 0);
      return {
        bin: d,
        count: n ? Math.ceil((n / max) * 4) : 0,
        date,
        trades: n,
      };
    });
    columns.push({ bin: w, bins });
  }
  return columns;
}

/** One point per closed trade, for the trade map scatter. */
export const tradePoints = (trades: Trade[]) =>
  closedOnly(trades).map((t) => ({
    date: new Date(endOf(t)),
    net: t.net,
    symbol: t.symbol,
  }));
