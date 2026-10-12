import type { Deal } from "./metrics";

/**
 * Account statistics sent by the TradingJournal Complete EA
 * (POST /journal/mt5/stats): only the terminal knows the balance, equity,
 * margin, deposits, withdrawals and the weekly/monthly targets. The metrics
 * derived from trades stay computed in the panel from the deals.
 */

/** The fields of the EA's SAccountStats, in the order it sends them. */
export const STAT_KEYS = [
  "balance",
  "equity",
  "freeMargin",
  "initialDeposit",
  "withdrawal",
  "grossProfit",
  "grossLoss",
  "netProfit",
  "totalCommission",
  "totalSwap",
  "dailyProfit",
  "weeklyProfit",
  "monthlyProfit",
  "maxProfitTrade",
  "maxLossTrade",
  "startingWeeklyEquity",
  "startingMonthlyEquity",
  "weeklyTarget",
  "monthlyTarget",
  "weeklyTargetPct",
  "monthlyTargetPct",
  "weeklyTargetProgress",
  "monthlyTargetProgress",
  "targetPercent",
  "winRate",
  "profitFactor",
  "recoveryFactor",
  "sharpeRatio",
  "expectedPayoff",
  "dailyDrawdown",
  "totalTrades",
  "profitTrades",
  "lossTrades",
  "longTrades",
  "shortTrades",
  "maxConWins",
  "maxConLosses",
  "maxConProfitTrades",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];
export type AccountStats = Record<StatKey, number>;

export const ACCOUNT_TYPES = [
  "Personal",
  "Back-Testing",
  "Prop-Valuation",
  "Prop-Funding",
] as const;

export const MARKETS = [
  "Forex",
  "Commodities",
  "Equities",
  "Cryptocurrencies",
] as const;

export const MARKET_LABEL: Record<string, string> = {
  Forex: "Forex",
  Commodities: "Commodities",
  Equities: "Índices e ações",
  Cryptocurrencies: "Cripto",
};

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  Personal: "Pessoal",
  "Back-Testing": "Backtest",
  "Prop-Valuation": "Prop · avaliação",
  "Prop-Funding": "Prop · financiada",
};

/** What the panel keeps of each snapshot for the balance × equity chart. */
export const HISTORY_KEYS = [
  "balance",
  "equity",
  "netProfit",
  "dailyProfit",
  "winRate",
  "profitFactor",
  "initialDeposit",
  "withdrawal",
] as const satisfies readonly StatKey[];

export type HistoryPoint = Record<(typeof HISTORY_KEYS)[number], number> & {
  /** Broker server time (ms) of the snapshot. */
  time: number;
};

/** Server day (YYYY-MM-DD) of a broker server time in ms. */
export const serverDay = (ms: number) =>
  new Date(ms).toISOString().slice(0, 10);

/**
 * The EA's own totals, recomputed from the stored deals: closing deals
 * (out/inout) count as trades and their net is profit + commission + swap.
 */
export function eaTotals(deals: Deal[]) {
  let trades = 0;
  let net = 0;
  for (const d of deals) {
    if (d.entry === "out" || d.entry === "inout") {
      trades += 1;
      net += d.profit + d.commission + d.swap;
    }
  }
  return { trades, net: Math.round(net * 100) / 100 };
}

export interface Divergence {
  field: "trades" | "net";
  ea: number;
  panel: number;
}

/** Differences beyond the tolerance (missing or extra deals). */
export function divergences(
  stats: Pick<AccountStats, "totalTrades" | "netProfit">,
  panel: { trades: number; net: number }
): Divergence[] {
  const out: Divergence[] = [];
  if (stats.totalTrades !== panel.trades) {
    out.push({ field: "trades", ea: stats.totalTrades, panel: panel.trades });
  }
  const tolerance = Math.max(1, Math.abs(stats.netProfit) * 0.005);
  if (Math.abs(stats.netProfit - panel.net) > tolerance) {
    out.push({ field: "net", ea: stats.netProfit, panel: panel.net });
  }
  return out;
}

/** Forex hours: Sunday 22:00 to Friday 22:00 UTC. */
export function marketOpen(now: number) {
  const d = new Date(now);
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  if (day === 6) {
    return false;
  }
  if (day === 5) {
    return h < 22;
  }
  if (day === 0) {
    return h >= 22;
  }
  return true;
}

export const OFFLINE_MS = 15 * 60_000;

/** "EA offline": no data for 15 min while the market is open. */
export const eaOffline = (receivedAt: number, now: number) =>
  now - receivedAt > OFFLINE_MS && marketOpen(now);

/**
 * Balance changes not explained by trading (deposits and withdrawals)
 * between consecutive snapshots.
 */
export function cashFlows(points: HistoryPoint[]) {
  const flows: { time: number; amount: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as HistoryPoint;
    const b = points[i] as HistoryPoint;
    const amount = b.balance - a.balance - (b.netProfit - a.netProfit);
    if (Math.abs(amount) >= 1) {
      flows.push({ time: b.time, amount: Math.round(amount * 100) / 100 });
    }
  }
  return flows;
}
