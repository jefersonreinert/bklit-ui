import {
  type AccountStats,
  eaTotals,
  HISTORY_KEYS,
  type HistoryPoint,
  STAT_KEYS,
  serverDay,
} from "./account";
import { buildTrades, type Deal, marketOf } from "./metrics";

/**
 * Fictitious journal data to preview the analytics: ~14 months of trades on
 * five instruments, five trading models with different edges, the ICT
 * sessions, notes and TradingView alerts. Deterministic for a given `now`.
 * Everything lives under the DEMO account so it can be removed on its own.
 */

export const DEMO_ACCOUNT = "DEMO";
export const DEMO_STRATEGY = "Demonstração";
/** Starting balance of the demo account. */
const DEPOSIT = 10_000;

const DAY = 86_400_000;
const HOUR = 3_600_000;

interface Instrument {
  symbol: string;
  price: number;
  /** Stop distance as a fraction of price. */
  stop: number;
  /** Money risked per trade at 1 lot-equivalent. */
  risk: number;
  volume: number;
}

const INSTRUMENTS: Instrument[] = [
  { symbol: "EURUSD", price: 1.085, stop: 0.0012, risk: 120, volume: 1 },
  { symbol: "GBPUSD", price: 1.27, stop: 0.0015, risk: 110, volume: 0.8 },
  { symbol: "XAUUSD", price: 2350, stop: 0.0018, risk: 150, volume: 0.3 },
  { symbol: "NAS100", price: 20_100, stop: 0.0022, risk: 140, volume: 0.5 },
  { symbol: "US30", price: 42_000, stop: 0.0016, risk: 100, volume: 0.4 },
];

interface Model {
  name: string;
  /** Win probability. */
  edge: number;
  /** Typical winner in R. */
  reward: number;
  /** New York hours it trades. */
  hours: number[];
  magic: number;
}

const MODELS: Model[] = [
  { name: "Silver Bullet", edge: 0.62, reward: 2.2, hours: [10], magic: 0 },
  { name: "FVG London", edge: 0.55, reward: 1.9, hours: [2, 3, 4], magic: 0 },
  { name: "Breaker", edge: 0.5, reward: 2.4, hours: [8, 9, 13], magic: 0 },
  { name: "Turtle Soup", edge: 0.47, reward: 2.8, hours: [9, 14], magic: 0 },
  { name: "", edge: 0.42, reward: 1.6, hours: [20, 21, 15], magic: 777 },
];

const TAGS = ["A+", "Paciência", "FOMO", "Notícia", "Contra tendência"];

function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

const pick = <T>(list: T[], r: number): T =>
  list[Math.floor(r * list.length) % list.length] as T;

const round = (n: number, digits: number) =>
  Math.round(n * 10 ** digits) / 10 ** digits;

/** NY clock → UTC (good enough for demo data: EDT most of the year). */
const nyToUtc = (day: Date, hour: number, minute: number) =>
  Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hour + 4,
    minute
  );

interface DemoTrade {
  open: Deal;
  close: Deal;
  model: string;
}

function demoTrade(
  i: number,
  time: number,
  model: Model,
  next: () => number
): DemoTrade {
  const ins = pick(INSTRUMENTS, next());
  const side = next() < 0.52 ? "buy" : "sell";
  const dir = side === "buy" ? 1 : -1;
  // Slow drift so prices move over the months
  const price = ins.price * (1 + Math.sin(i / 40) * 0.03);
  const stopDist = price * ins.stop;
  const win = next() < model.edge;
  const r = win ? model.reward * (0.4 + next() * 1.1) : -(0.5 + next() * 0.55);
  const digits = price > 100 ? 2 : 5;
  const position = String(500_000 + i);
  const base = {
    account: DEMO_ACCOUNT,
    position,
    symbol: ins.symbol,
    volume: ins.volume,
    tp: 0,
    fee: 0,
    magic: model.magic,
  };
  const hold = (win ? 0.2 + next() * 3 : 0.1 + next() * 4) * HOUR;
  const commission = -round(ins.volume * 7, 2);
  const point = price > 100 ? 0.01 : 0.000_01;
  const move = r * stopDist;
  const profit = round(ins.risk * r, 2);
  const net = profit + commission;
  return {
    model: model.name,
    open: {
      ...base,
      ticket: `${position}1`,
      side,
      entry: "in",
      price: round(price, digits),
      sl: round(price - dir * stopDist, digits),
      tp: round(price + dir * model.reward * stopDist, digits),
      profit: 0,
      commission: commission / 2,
      swap: 0,
      comment: model.name,
      time,
    },
    close: {
      ...base,
      ticket: `${position}2`,
      side: side === "buy" ? "sell" : "buy",
      entry: "out",
      price: round(price + dir * move, digits),
      sl: 0,
      profit,
      commission: commission / 2,
      swap: hold > 20 * HOUR ? -round(next() * 6, 2) : 0,
      comment: win
        ? `[tp ${round(price, digits)}]`
        : `[sl ${round(price, digits)}]`,
      time: time + hold,
      // Extra fields of the TradingJournal Complete EA
      rr: model.reward,
      riskPct: round(ins.risk / DEPOSIT, 4),
      riskUsd: ins.risk,
      profitPoints: Math.round(move / point),
      durationSec: Math.round(hold / 1000),
      outcome: net > 0.01 ? "win" : "loss",
      accountType: "Personal",
      market: marketOf(ins.symbol),
    },
  };
}

/** Deals for roughly `months` months ending at `now`. */
export function demoTrades(now: number, months = 14): DemoTrade[] {
  const next = random(20_261_011);
  const out: DemoTrade[] = [];
  const start = now - months * 30 * DAY;
  let i = 0;
  for (let t = start; t < now - DAY; t += DAY) {
    const day = new Date(t);
    const wd = day.getUTCDay();
    if (wd === 0 || wd === 6) {
      continue;
    }
    // 0-3 trades a day, a little more active over time
    const n = Math.floor(next() * (2.6 + (t - start) / (months * 30 * DAY)));
    for (let k = 0; k < n; k++) {
      const model = pick(MODELS, next());
      const hour = pick(model.hours, next());
      const minute = Math.floor(next() * 12) * 5 + Math.floor(next() * 5);
      const time = nyToUtc(day, hour, minute);
      if (time < now) {
        out.push(demoTrade(i, time, model, next));
        i += 1;
      }
    }
  }
  return out;
}

export function demoDeals(now: number): Deal[] {
  return demoTrades(now).flatMap((t) => [t.open, t.close]);
}

/** Notes for about a third of the trades (setup, tags, rating). */
export function demoNotes(now: number) {
  const next = random(7);
  return demoTrades(now)
    .filter(() => next() < 0.35)
    .map((t) => ({
      key: `${DEMO_ACCOUNT}:${t.open.position}`,
      setup: t.model || undefined,
      tags: [pick(TAGS, next())],
      rating: 1 + Math.floor(next() * 5),
      notes: "Operação fictícia (dados de demonstração).",
      updatedAt: now,
    }));
}

/** A few TradingView alerts around the most recent trades. */
export function demoSignals(now: number) {
  return demoTrades(now)
    .slice(-25)
    .map((t) => ({
      ticker: `OANDA:${t.open.symbol}`,
      action: t.open.side,
      price: t.open.price,
      qty: t.open.volume,
      position: t.open.side === "buy" ? "long" : "short",
      interval: "15",
      strategy: DEMO_STRATEGY,
      message: t.model ? `${t.model} armado` : "Alerta de teste",
      time: t.open.time - 60_000,
      receivedAt: t.open.time - 60_000,
    }));
}

/**
 * EA account statistics for the demo: balance from a 10 000 deposit, one
 * snapshot per trading day, and the latest totals with weekly/monthly
 * targets (2.5 % and 10 %).
 */
export function demoAccount(now: number) {
  const deals = demoDeals(now);
  const trades = buildTrades(deals)
    .filter((t) => t.closeTime !== null)
    .sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0));
  const history: HistoryPoint[] = [];
  let balance = DEPOSIT;
  let gp = 0;
  let gl = 0;
  let wins = 0;
  let count = 0;
  let day = "";
  let dayStart = DEPOSIT;
  for (const t of trades) {
    const d = serverDay(t.closeTime ?? 0);
    if (d !== day) {
      day = d;
      dayStart = balance;
    }
    balance += t.net;
    count += 1;
    if (t.net > 0) {
      gp += t.net;
      wins += 1;
    } else {
      gl += t.net;
    }
    const point: HistoryPoint = {
      time: t.closeTime ?? 0,
      balance: round(balance, 2),
      equity: round(balance, 2),
      netProfit: round(gp + gl, 2),
      dailyProfit: round(balance - dayStart, 2),
      winRate: wins / count,
      profitFactor: gl < 0 ? gp / -gl : 0,
      initialDeposit: DEPOSIT,
      withdrawal: 0,
    };
    if (history.at(-1) && serverDay(history.at(-1)?.time ?? 0) === d) {
      history[history.length - 1] = point;
    } else {
      history.push(point);
    }
  }
  const sumSince = (from: number) =>
    trades
      .filter((t) => (t.closeTime ?? 0) >= from)
      .reduce((a, t) => a + t.net, 0);
  const today = new Date(now);
  const dayFrom = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const weekFrom = dayFrom - ((today.getUTCDay() + 6) % 7) * DAY;
  const monthFrom = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const weekly = sumSince(weekFrom);
  const monthly = sumSince(monthFrom);
  const startW = balance - weekly;
  const startM = balance - monthly;
  const equity = round(balance + 42.5, 2);
  const values: Partial<AccountStats> = {
    balance: round(balance, 2),
    equity,
    freeMargin: round(equity * 0.93, 2),
    initialDeposit: DEPOSIT,
    withdrawal: 0,
    grossProfit: round(gp, 2),
    grossLoss: round(gl, 2),
    // The EA counts closing deals only (entry commissions left out)
    netProfit: eaTotals(deals).net,
    dailyProfit: round(sumSince(dayFrom), 2),
    weeklyProfit: round(weekly, 2),
    monthlyProfit: round(monthly, 2),
    startingWeeklyEquity: round(startW, 2),
    startingMonthlyEquity: round(startM, 2),
    weeklyTarget: round(startW * 0.025, 2),
    monthlyTarget: round(startM * 0.1, 2),
    weeklyTargetPct: 0.025,
    monthlyTargetPct: 0.1,
    weeklyTargetProgress: Math.max(0, Math.min(1, weekly / (startW * 0.025))),
    monthlyTargetProgress: Math.max(0, Math.min(1, monthly / (startM * 0.1))),
    targetPercent: 0.1,
    winRate: trades.length ? wins / trades.length : 0,
    profitFactor: gl < 0 ? gp / -gl : 0,
    dailyDrawdown: dayStart ? sumSince(dayFrom) / dayStart : 0,
    totalTrades: trades.length,
    profitTrades: wins,
    lossTrades: trades.length - wins,
  };
  const stats = Object.fromEntries(
    STAT_KEYS.map((k) => [k, values[k] ?? 0])
  ) as AccountStats;
  return {
    latest: {
      account: DEMO_ACCOUNT,
      server: "Dados fictícios",
      name: "Demonstração",
      holder: "Trader fictício",
      currency: "USD",
      accountType: "Personal",
      serverTime: now,
      receivedAt: now,
      stats,
    },
    history: history.map((p) => ({
      account: DEMO_ACCOUNT,
      day: serverDay(p.time),
      time: p.time,
      ...Object.fromEntries(HISTORY_KEYS.map((k) => [k, p[k]])),
    })) as (HistoryPoint & { account: string; day: string })[],
  };
}
