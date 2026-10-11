import type { Deal } from "./metrics";

/**
 * Fictitious journal data to preview the analytics: ~14 months of trades on
 * five instruments, five trading models with different edges, the ICT
 * sessions, notes and TradingView alerts. Deterministic for a given `now`.
 * Everything lives under the DEMO account so it can be removed on its own.
 */

export const DEMO_ACCOUNT = "DEMO";
export const DEMO_STRATEGY = "Demonstração";

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
  return {
    model: model.name,
    open: {
      ...base,
      ticket: `${position}1`,
      side,
      entry: "in",
      price: round(price, digits),
      sl: round(price - dir * stopDist, digits),
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
      price: round(price + dir * r * stopDist, digits),
      sl: 0,
      profit: round(ins.risk * r, 2),
      commission: commission / 2,
      swap: hold > 20 * HOUR ? -round(next() * 6, 2) : 0,
      comment: win
        ? `[tp ${round(price, digits)}]`
        : `[sl ${round(price, digits)}]`,
      time: time + hold,
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
