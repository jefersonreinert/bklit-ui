/**
 * Trading journal: MT5 deals → trades (one per position) → statistics.
 * Pure functions, shared by the UI and the tests.
 */

export type DealEntry = "in" | "out" | "inout" | "out_by";
export type Side = "buy" | "sell";
export type Outcome = "win" | "loss" | "breakeven";

/**
 * Extra fields the TradingJournal Complete EA (Golden Bullet) sends on the
 * closing deal. All optional: older deals and the simple EA lack them.
 */
export interface DealExtras {
  /** Planned R:R = |TP − entry| / |entry − SL|. */
  rr?: number;
  /** Risk as a fraction of the balance (0.01 = 1 %). */
  riskPct?: number;
  /** Money at risk up to the stop loss. */
  riskUsd?: number;
  profitPoints?: number;
  durationSec?: number;
  outcome?: Outcome;
  /** Account equity and balance when the deal was SENT (not at the trade). */
  equityAt?: number;
  balanceAt?: number;
  accountType?: string;
  market?: string;
}

export const DEAL_EXTRAS = [
  "rr",
  "riskPct",
  "riskUsd",
  "profitPoints",
  "durationSec",
  "outcome",
  "equityAt",
  "balanceAt",
  "accountType",
  "market",
] as const satisfies readonly (keyof DealExtras)[];

export interface Deal extends DealExtras {
  account: string;
  ticket: string;
  position: string;
  symbol: string;
  side: Side;
  entry: DealEntry;
  volume: number;
  price: number;
  sl: number;
  tp: number;
  profit: number;
  commission: number;
  swap: number;
  fee: number;
  magic: number;
  comment: string;
  /** Unix ms. */
  time: number;
}

export interface Trade {
  /** account:position */
  key: string;
  account: string;
  position: string;
  symbol: string;
  /** Direction of the opening deal. */
  side: Side;
  openTime: number;
  closeTime: number | null;
  openPrice: number;
  closePrice: number | null;
  /** Volume opened. */
  volume: number;
  /** Volume still open. */
  openVolume: number;
  sl: number;
  tp: number;
  profit: number;
  commission: number;
  swap: number;
  fee: number;
  /** profit + commission + swap + fee. */
  net: number;
  /** Net result in R (risk to the first stop loss), when known. */
  r: number | null;
  magic: number;
  comment: string;
  /** From the EA's closing deals (null when the EA did not send them). */
  rrPlanned: number | null;
  /** Summed over partial closes. */
  riskPct: number | null;
  riskUsd: number | null;
  profitPoints: number | null;
  outcome: Outcome | null;
  accountType: string | null;
  /** The EA's market, else deduced from the symbol. */
  market: string;
  deals: Deal[];
}

const EPS = 1e-9;

const weighted = (deals: Deal[]) => {
  const vol = deals.reduce((a, d) => a + d.volume, 0);
  return vol > 0 ? deals.reduce((a, d) => a + d.price * d.volume, 0) / vol : 0;
};

const opposite = (side: Side): Side => (side === "buy" ? "sell" : "buy");

/** Result in R: price move over the distance to the first stop. */
function rMultiple(
  side: Side,
  openPrice: number,
  closePrice: number | null,
  sl: number
) {
  if (closePrice === null || sl <= 0) {
    return null;
  }
  const risk = Math.abs(openPrice - sl);
  const move = side === "buy" ? closePrice - openPrice : openPrice - closePrice;
  return risk > 0 ? move / risk : null;
}

const CRYPTO = /BTC|ETH|XRP|LTC/;
const COMMODITY = /XAU|XAG|OIL|GOLD/;
const EQUITY = /NAS|NDX|SPX|US5|US30|DJ|DAX|GER|100|500/;

/** Same rule as the EA's DetermineMarketName. */
export function marketOf(symbol: string) {
  const s = symbol.toUpperCase();
  if (CRYPTO.test(s)) {
    return "Cryptocurrencies";
  }
  if (COMMODITY.test(s)) {
    return "Commodities";
  }
  return EQUITY.test(s) ? "Equities" : "Forex";
}

/** Sum of a field over the deals that carry it; null when none does. */
function sumOf(deals: Deal[], k: "riskPct" | "riskUsd" | "profitPoints") {
  const has = deals.filter((d) => typeof d[k] === "number");
  return has.length ? has.reduce((a, d) => a + (d[k] ?? 0), 0) : null;
}

/** EA fields of the closing deals (partial closes add up). */
function extrasOf(outs: Deal[], all: Deal[]) {
  const last = <K extends keyof DealExtras>(k: K): DealExtras[K] => {
    for (const list of [outs, all]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const value = list[i]?.[k];
        if (value !== undefined) {
          return value;
        }
      }
    }
  };
  return {
    rrPlanned: last("rr") ?? null,
    riskPct: sumOf(outs, "riskPct"),
    riskUsd: sumOf(outs, "riskUsd"),
    profitPoints: sumOf(outs, "profitPoints"),
    outcome: last("outcome") ?? null,
    accountType: last("accountType") ?? null,
  };
}

function tradeOf(key: string, list: Deal[]): Trade | null {
  list.sort((a, b) => a.time - b.time);
  const ins = list.filter((d) => d.entry === "in" || d.entry === "inout");
  const outs = list.filter((d) => d.entry === "out" || d.entry === "out_by");
  const first = ins[0] ?? list[0];
  if (!first) {
    return null;
  }
  // An "out" deal has the opposite side of the position it closes
  const side = ins.length > 0 ? first.side : opposite(first.side);
  const inVol = ins.reduce((a, d) => a + d.volume, 0);
  const outVol = outs.reduce((a, d) => a + d.volume, 0);
  const sum = (k: "profit" | "commission" | "swap" | "fee") =>
    list.reduce((a, d) => a + d[k], 0);
  const profit = sum("profit");
  const commission = sum("commission");
  const swap = sum("swap");
  const fee = sum("fee");
  const openPrice = ins.length ? weighted(ins) : first.price;
  const openVolume = Math.max(0, inVol - outVol);
  const closed = outs.length > 0 && (inVol === 0 || openVolume < EPS);
  const sl = ins.find((d) => d.sl > 0)?.sl ?? 0;
  const closePrice = outs.length ? weighted(outs) : null;
  return {
    key,
    account: first.account,
    position: first.position || first.ticket,
    symbol: first.symbol,
    side,
    openTime: first.time,
    closeTime: closed ? (list.at(-1) ?? first).time : null,
    openPrice,
    closePrice,
    volume: inVol || outVol,
    openVolume: closed ? 0 : openVolume,
    sl,
    tp: ins.find((d) => d.tp > 0)?.tp ?? 0,
    profit,
    commission,
    swap,
    fee,
    net: profit + commission + swap + fee,
    r: closed ? rMultiple(side, openPrice, closePrice, sl) : null,
    magic: first.magic,
    comment: first.comment,
    ...extrasOf(outs, list),
    market: list.find((d) => d.market)?.market ?? marketOf(first.symbol),
    deals: list,
  };
}

/** Groups deals by position; positions without an opening deal are kept. */
export function buildTrades(deals: Deal[]): Trade[] {
  const groups = new Map<string, Deal[]>();
  for (const d of deals) {
    const key = `${d.account}:${d.position || d.ticket}`;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }
  const trades: Trade[] = [];
  for (const [key, list] of groups) {
    const t = tradeOf(key, list);
    if (t) {
      trades.push(t);
    }
  }
  return trades.sort(
    (a, b) => (b.closeTime ?? b.openTime) - (a.closeTime ?? a.openTime)
  );
}

export interface Bucket {
  key: string;
  trades: number;
  wins: number;
  net: number;
}

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  net: number;
  grossProfit: number;
  grossLoss: number;
  /** grossProfit / |grossLoss|; null without losses. */
  profitFactor: number | null;
  /** Average net per trade. */
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  /** avgWin / |avgLoss|. */
  payoff: number | null;
  best: number;
  worst: number;
  maxWinStreak: number;
  maxLossStreak: number;
  /** Largest peak-to-trough fall of the cumulative net. */
  maxDrawdown: number;
  avgHoldMs: number;
  avgR: number | null;
  costs: number;
  long: Bucket;
  short: Bucket;
  bySymbol: Bucket[];
  byWeekday: Bucket[];
  byHour: Bucket[];
  /** Cumulative net after each closed trade (oldest first). */
  equity: { time: number; value: number }[];
  /** Net per day, YYYY-MM-DD → value. */
  daily: Record<string, { net: number; trades: number }>;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function bucketOf(map: Map<string, Bucket>, key: string, t: Trade) {
  const b = map.get(key) ?? { key, trades: 0, wins: 0, net: 0 };
  b.trades += 1;
  b.net += t.net;
  if (t.net > 0) {
    b.wins += 1;
  }
  map.set(key, b);
}

export const dayKey = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function computeStats(all: Trade[]): Stats {
  const closed = all
    .filter((t) => t.closeTime !== null)
    .sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0));
  const wins = closed.filter((t) => t.net > 0);
  const losses = closed.filter((t) => t.net < 0);
  const grossProfit = wins.reduce((a, t) => a + t.net, 0);
  const grossLoss = losses.reduce((a, t) => a + t.net, 0);
  const net = grossProfit + grossLoss;
  const n = closed.length;

  let streakW = 0;
  let streakL = 0;
  let maxW = 0;
  let maxL = 0;
  let peak = 0;
  let cum = 0;
  let maxDd = 0;
  const equity: Stats["equity"] = [];
  const daily: Stats["daily"] = {};
  const sym = new Map<string, Bucket>();
  const wd = new Map<string, Bucket>();
  const hr = new Map<string, Bucket>();
  const sides = new Map<string, Bucket>();
  for (const t of closed) {
    if (t.net > 0) {
      streakW += 1;
      streakL = 0;
    } else if (t.net < 0) {
      streakL += 1;
      streakW = 0;
    }
    maxW = Math.max(maxW, streakW);
    maxL = Math.max(maxL, streakL);
    cum += t.net;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    equity.push({ time: t.closeTime ?? t.openTime, value: cum });
    const day = dayKey(t.closeTime ?? t.openTime);
    const dd = daily[day] ?? { net: 0, trades: 0 };
    dd.net += t.net;
    dd.trades += 1;
    daily[day] = dd;
    bucketOf(sym, t.symbol, t);
    bucketOf(wd, WEEKDAYS[new Date(t.openTime).getDay()] ?? "", t);
    bucketOf(hr, String(new Date(t.openTime).getHours()).padStart(2, "0"), t);
    bucketOf(sides, t.side, t);
  }
  const rs = closed.map((t) => t.r).filter((r): r is number => r !== null);
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const empty = (key: string): Bucket => ({ key, trades: 0, wins: 0, net: 0 });
  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    breakeven: n - wins.length - losses.length,
    winRate: n ? wins.length / n : 0,
    net,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    expectancy: n ? net / n : 0,
    avgWin,
    avgLoss,
    payoff: avgLoss < 0 ? avgWin / -avgLoss : null,
    best: closed.reduce((a, t) => Math.max(a, t.net), 0),
    worst: closed.reduce((a, t) => Math.min(a, t.net), 0),
    maxWinStreak: maxW,
    maxLossStreak: maxL,
    maxDrawdown: maxDd,
    avgHoldMs: n
      ? closed.reduce(
          (a, t) => a + ((t.closeTime ?? t.openTime) - t.openTime),
          0
        ) / n
      : 0,
    avgR: rs.length ? rs.reduce((a, r) => a + r, 0) / rs.length : null,
    costs: closed.reduce((a, t) => a + t.commission + t.swap + t.fee, 0),
    long: sides.get("buy") ?? empty("buy"),
    short: sides.get("sell") ?? empty("sell"),
    bySymbol: [...sym.values()].sort((a, b) => b.net - a.net),
    byWeekday: WEEKDAYS.map((d) => wd.get(d) ?? empty(d)),
    byHour: Array.from({ length: 24 }, (_, h) => {
      const k = String(h).padStart(2, "0");
      return hr.get(k) ?? empty(k);
    }),
    equity,
    daily,
  };
}

/** "2h 15m", "3d 4h", "45s". */
export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m`;
  }
  const h = Math.floor(m / 60);
  if (h < 48) {
    return `${h}h ${m % 60}m`;
  }
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
